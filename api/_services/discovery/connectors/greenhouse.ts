/**
 * Conector Greenhouse — Job Board API pública.
 *
 * Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 * Documentação: https://developers.greenhouse.io/job-board.html
 * Sem autenticação, público por definição (é o que alimenta a página de vagas
 * da própria empresa). Nenhuma proteção é contornada.
 *
 * O board token sai da URL de carreiras da empresa
 * (ex.: boards.greenhouse.io/nubank → "nubank").
 */
import { decodeEntities } from '../../../../shared/discovery/html.js';
import type { ConnectorContext, ConnectorResult, JobSourceConnector, RawJob } from '../../../../shared/discovery/types.js';
import { fetchJson } from '../http.js';

const BASE = 'https://boards-api.greenhouse.io/v1/boards';

interface GreenhouseJob {
  id: number;
  title?: string;
  updated_at?: string;
  first_published?: string;
  absolute_url?: string;
  company_name?: string;
  content?: string;
  location?: { name?: string } | null;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: unknown;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export const greenhouseConnector: JobSourceConnector = {
  kind: 'greenhouse',
  label: 'Greenhouse',
  documentationUrl: 'https://developers.greenhouse.io/job-board.html',
  requiresIdentifier: true,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    const board = context.identifier.trim();
    if (!board) {
      return { jobs: [], partial: false, warnings: ['Board do Greenhouse não informado.'] };
    }

    const url = `${BASE}/${encodeURIComponent(board)}/jobs?content=true`;
    const payload = await fetchJson<GreenhouseResponse>(url, {
      ...(context.signal ? { signal: context.signal } : {}),
    });

    const warnings: string[] = [];
    const since = context.since ? new Date(context.since).getTime() : null;
    const jobs: RawJob[] = [];

    for (const job of payload.jobs ?? []) {
      if (!job.id || !job.title) continue;

      const updatedAt = job.updated_at ?? null;
      // Busca incremental (§7): pula o que não mudou desde a última sincronização.
      if (since && updatedAt) {
        const updated = new Date(updatedAt).getTime();
        if (Number.isFinite(updated) && updated <= since) continue;
      }

      jobs.push({
        sourceJobId: String(job.id),
        title: job.title,
        company: job.company_name?.trim() || board,
        location: job.location?.name?.trim() || null,
        // O Greenhouse não declara modalidade: fica para a inferência textual.
        isRemote: null,
        isHybrid: null,
        // `content` chega com entidades escapadas (&lt;p&gt;): decodifica antes.
        descriptionHtml: job.content ? decodeEntities(job.content) : null,
        publishedAt: job.first_published ?? updatedAt,
        updatedAt,
        sourceUrl: job.absolute_url ?? `https://boards.greenhouse.io/${board}/jobs/${job.id}`,
        applicationUrl: job.absolute_url ?? '',
        applicationMethod: 'ats_form',
        department: job.departments?.[0]?.name ?? null,
        tags: (job.departments ?? []).map((item) => item.name ?? '').filter(Boolean),
        raw: job,
      });

      if (jobs.length >= context.limit) {
        warnings.push(`Limite de ${context.limit} vagas por sincronização atingido nesta fonte.`);
        break;
      }
    }

    return { jobs, partial: warnings.length > 0, warnings };
  },
};

/**
 * Perguntas reais do formulário de candidatura (§18).
 * Endpoint público: .../jobs/{id}?questions=true
 */
export interface GreenhouseQuestion {
  label?: string;
  required?: boolean;
  description?: string | null;
  fields?: Array<{ name?: string; type?: string; values?: Array<{ label?: string; value?: unknown }> }>;
}

export async function fetchGreenhouseQuestions(
  board: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<GreenhouseQuestion[]> {
  const url = `${BASE}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`;
  const payload = await fetchJson<{ questions?: GreenhouseQuestion[] }>(url, {
    ...(signal ? { signal } : {}),
  });
  return payload.questions ?? [];
}
