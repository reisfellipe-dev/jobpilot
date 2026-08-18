/**
 * Conectores de quadros agregadores (APIs públicas e documentadas).
 *
 * Agrupados em um arquivo porque compartilham a mesma natureza: não exigem
 * identificador de empresa, cobrem várias empresas de uma vez e devolvem
 * predominantemente vagas remotas. Os conectores por ATS (Greenhouse, Lever,
 * Ashby) ficam em arquivos próprios por terem regras específicas.
 *
 * Remotive e Remote OK pedem atribuição visível nos termos de uso — a interface
 * exibe o crédito com link (ver SOURCE_ATTRIBUTION em shared/discovery/types).
 */
import type { ConnectorContext, ConnectorResult, JobSourceConnector, RawJob } from '../../../../shared/discovery/types.js';
import { fetchJson } from '../http.js';

// =============================================================================
// Remotive — https://remotive.com/api/remote-jobs
// =============================================================================
interface RemotiveJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotiveConnector: JobSourceConnector = {
  kind: 'remotive',
  label: 'Remotive',
  documentationUrl: 'https://remotive.com/api-documentation',
  requiresIdentifier: false,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    // A API aceita busca textual: usamos poucos termos para não abusar da fonte.
    const queries = context.searchTerms.slice(0, 2);
    const urls =
      queries.length > 0
        ? queries.map(
            (term) => `https://remotive.com/api/remote-jobs?limit=${Math.min(context.limit, 60)}&search=${encodeURIComponent(term)}`,
          )
        : [`https://remotive.com/api/remote-jobs?limit=${Math.min(context.limit, 60)}`];

    const since = context.since ? new Date(context.since).getTime() : null;
    const seen = new Set<string>();
    const jobs: RawJob[] = [];
    const warnings: string[] = [];

    for (const url of urls) {
      const payload = await fetchJson<{ jobs?: RemotiveJob[] }>(url, {
        ...(context.signal ? { signal: context.signal } : {}),
      });

      for (const job of payload.jobs ?? []) {
        if (!job.id || !job.title || !job.company_name) continue;
        const key = String(job.id);
        if (seen.has(key)) continue;

        if (since && job.publication_date) {
          const published = new Date(job.publication_date).getTime();
          if (Number.isFinite(published) && published <= since) continue;
        }

        seen.add(key);
        jobs.push({
          sourceJobId: key,
          title: job.title,
          company: job.company_name,
          location: job.candidate_required_location?.trim() || null,
          // Quadro exclusivamente remoto: a modalidade é um fato da fonte.
          isRemote: true,
          isHybrid: false,
          employmentTypeRaw: job.job_type ?? null,
          descriptionHtml: job.description ?? null,
          publishedAt: job.publication_date ?? null,
          sourceUrl: job.url ?? '',
          applicationUrl: job.url ?? '',
          applicationMethod: 'external_site',
          salaryText: job.salary?.trim() || null,
          tags: [...(job.tags ?? []), job.category ?? ''].filter(Boolean),
          raw: job,
        });

        if (jobs.length >= context.limit) {
          warnings.push(`Limite de ${context.limit} vagas atingido no Remotive.`);
          return { jobs, partial: true, warnings };
        }
      }
    }

    return { jobs, partial: false, warnings };
  },
};

// =============================================================================
// Remote OK — https://remoteok.com/api
// O primeiro elemento do array é um aviso legal, não uma vaga.
// =============================================================================
interface RemoteOkEntry {
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  apply_url?: string;
  url?: string;
  salary_min?: number;
  salary_max?: number;
  legal?: string;
}

export const remoteOkConnector: JobSourceConnector = {
  kind: 'remoteok',
  label: 'Remote OK',
  documentationUrl: 'https://remoteok.com/api',
  requiresIdentifier: false,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    const entries = await fetchJson<RemoteOkEntry[]>('https://remoteok.com/api', {
      ...(context.signal ? { signal: context.signal } : {}),
    });

    const since = context.since ? new Date(context.since).getTime() : null;
    const jobs: RawJob[] = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
      // Descarta o cabeçalho legal e qualquer item sem cargo/empresa.
      if (entry.legal || !entry.position || !entry.company || !entry.id) continue;

      const publishedAt = entry.epoch
        ? new Date(entry.epoch * 1000).toISOString()
        : (entry.date ?? null);

      if (since && publishedAt) {
        const published = new Date(publishedAt).getTime();
        if (Number.isFinite(published) && published <= since) continue;
      }

      jobs.push({
        sourceJobId: String(entry.id),
        title: entry.position,
        company: entry.company,
        location: entry.location?.trim() || null,
        isRemote: true,
        isHybrid: false,
        descriptionHtml: entry.description ?? null,
        publishedAt,
        sourceUrl: entry.url ?? (entry.slug ? `https://remoteok.com/remote-jobs/${entry.slug}` : ''),
        applicationUrl: entry.apply_url ?? entry.url ?? '',
        applicationMethod: 'external_site',
        salaryMin: typeof entry.salary_min === 'number' ? entry.salary_min : null,
        salaryMax: typeof entry.salary_max === 'number' ? entry.salary_max : null,
        salaryCurrency: entry.salary_min || entry.salary_max ? 'USD' : null,
        tags: entry.tags ?? [],
        raw: entry,
      });

      if (jobs.length >= context.limit) break;
    }

    return { jobs, partial: false, warnings: [] };
  },
};

// =============================================================================
// Arbeitnow — https://www.arbeitnow.com/api/job-board-api
// =============================================================================
interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export const arbeitnowConnector: JobSourceConnector = {
  kind: 'arbeitnow',
  label: 'Arbeitnow',
  documentationUrl: 'https://www.arbeitnow.com/api',
  requiresIdentifier: false,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    const payload = await fetchJson<{ data?: ArbeitnowJob[] }>('https://www.arbeitnow.com/api/job-board-api', {
      ...(context.signal ? { signal: context.signal } : {}),
    });

    const since = context.since ? new Date(context.since).getTime() : null;
    const jobs: RawJob[] = [];

    for (const job of payload.data ?? []) {
      if (!job.slug || !job.title || !job.company_name) continue;

      const publishedAt = job.created_at ? new Date(job.created_at * 1000).toISOString() : null;
      if (since && publishedAt) {
        const published = new Date(publishedAt).getTime();
        if (Number.isFinite(published) && published <= since) continue;
      }

      jobs.push({
        sourceJobId: job.slug,
        title: job.title,
        company: job.company_name,
        location: job.location?.trim() || null,
        isRemote: typeof job.remote === 'boolean' ? job.remote : null,
        isHybrid: null,
        employmentTypeRaw: job.job_types?.[0] ?? null,
        descriptionHtml: job.description ?? null,
        publishedAt,
        sourceUrl: job.url ?? `https://www.arbeitnow.com/view/${job.slug}`,
        applicationUrl: job.url ?? '',
        applicationMethod: 'external_site',
        tags: [...(job.tags ?? []), ...(job.job_types ?? [])].filter(Boolean),
        raw: job,
      });

      if (jobs.length >= context.limit) break;
    }

    return { jobs, partial: false, warnings: [] };
  },
};
