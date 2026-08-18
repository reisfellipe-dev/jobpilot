/**
 * Conector Ashby — Job Posting API pública.
 *
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 * Documentação: https://developers.ashbyhq.com/reference/introduction
 * Sem autenticação. É a API que alimenta o quadro público de vagas.
 *
 * É a fonte mais rica das três: entrega modalidade, tipo de contratação e,
 * quando a empresa publica, a faixa salarial — tudo como dado de fonte.
 */
import type { ConnectorContext, ConnectorResult, JobSourceConnector, RawJob } from '../../../../shared/discovery/types.js';
import { fetchJson } from '../http.js';

const BASE = 'https://api.ashbyhq.com/posting-api/job-board';

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string;
  updatedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTierSummary?: string | null;
    scrapeableCompensationSalarySummary?: string | null;
  } | null;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

function mapWorkplace(job: AshbyJob): { isRemote: boolean | null; isHybrid: boolean | null } {
  const type = (job.workplaceType ?? '').toLowerCase();
  if (type === 'hybrid') return { isRemote: false, isHybrid: true };
  if (type === 'remote') return { isRemote: true, isHybrid: false };
  if (type === 'onsite') return { isRemote: false, isHybrid: false };
  if (typeof job.isRemote === 'boolean') return { isRemote: job.isRemote, isHybrid: false };
  return { isRemote: null, isHybrid: null };
}

export const ashbyConnector: JobSourceConnector = {
  kind: 'ashby',
  label: 'Ashby',
  documentationUrl: 'https://developers.ashbyhq.com/reference/introduction',
  requiresIdentifier: true,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    const board = context.identifier.trim();
    if (!board) {
      return { jobs: [], partial: false, warnings: ['Board do Ashby não informado.'] };
    }

    const url = `${BASE}/${encodeURIComponent(board)}?includeCompensation=true`;
    const payload = await fetchJson<AshbyResponse>(url, {
      ...(context.signal ? { signal: context.signal } : {}),
    });

    const since = context.since ? new Date(context.since).getTime() : null;
    const jobs: RawJob[] = [];

    for (const job of payload.jobs ?? []) {
      if (!job.id || !job.title) continue;
      // `isListed: false` significa vaga despublicada.
      if (job.isListed === false) continue;

      const published = job.publishedAt ?? job.updatedAt ?? null;
      if (since && published) {
        const time = new Date(published).getTime();
        if (Number.isFinite(time) && time <= since) continue;
      }

      const workplace = mapWorkplace(job);
      const secondary = (job.secondaryLocations ?? [])
        .map((item) => item.location ?? '')
        .filter(Boolean);

      // Salário só existe se a empresa optou por publicar (§21).
      const salaryText =
        job.compensation?.compensationTierSummary?.trim() ||
        job.compensation?.scrapeableCompensationSalarySummary?.trim() ||
        null;

      jobs.push({
        sourceJobId: job.id,
        title: job.title,
        company: board,
        location: job.location?.trim() || secondary[0] || null,
        isRemote: workplace.isRemote,
        isHybrid: workplace.isHybrid,
        employmentTypeRaw: job.employmentType ?? null,
        descriptionHtml: job.descriptionHtml ?? null,
        descriptionText: job.descriptionPlain ?? null,
        publishedAt: published,
        sourceUrl: job.jobUrl ?? `https://jobs.ashbyhq.com/${board}/${job.id}`,
        applicationUrl: job.applyUrl ?? job.jobUrl ?? '',
        applicationMethod: 'ats_form',
        salaryText,
        department: job.department ?? null,
        tags: [job.department, job.team, ...secondary].filter((item): item is string => Boolean(item)),
        raw: job,
      });

      if (jobs.length >= context.limit) break;
    }

    return { jobs, partial: false, warnings: [] };
  },
};
