/**
 * Conector Lever — Postings API pública.
 *
 * Endpoint: GET https://api.lever.co/v0/postings/{company}?mode=json
 * Documentação: https://github.com/lever/postings-api
 * Sem autenticação. É a mesma API que renderiza a página pública de vagas.
 *
 * O slug sai da URL de carreiras (jobs.lever.co/nome → "nome"). Slug inválido
 * devolve 404 e o cadastro da fonte é recusado na hora — nada de fonte fantasma.
 */
import type { ConnectorContext, ConnectorResult, JobSourceConnector, RawJob } from '../../../../shared/discovery/types';
import { fetchJson } from '../http';

const BASE = 'https://api.lever.co/v0/postings';

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverPosting {
  id?: string;
  text?: string;
  createdAt?: number;
  descriptionPlain?: string;
  description?: string;
  additional?: string;
  additionalPlain?: string;
  lists?: LeverList[];
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  country?: string;
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
}

/** Lever entrega a modalidade explicitamente — dado de fonte, não inferência. */
function mapWorkplaceType(value: string | undefined): { isRemote: boolean | null; isHybrid: boolean | null } {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'remote') return { isRemote: true, isHybrid: false };
  if (normalized === 'hybrid') return { isRemote: false, isHybrid: true };
  if (normalized === 'onsite' || normalized === 'on-site') return { isRemote: false, isHybrid: false };
  return { isRemote: null, isHybrid: null };
}

/**
 * A descrição do Lever vem partida: corpo + "lists" (cada uma com título e
 * bullets em HTML). Remontamos com os títulos preservados para que a extração
 * de requisitos consiga separar obrigatórios de diferenciais.
 */
function buildDescription(posting: LeverPosting): string {
  const parts: string[] = [];
  if (posting.description) parts.push(posting.description);
  for (const list of posting.lists ?? []) {
    if (list.text) parts.push(`<h3>${list.text}</h3>`);
    if (list.content) parts.push(`<ul>${list.content}</ul>`);
  }
  if (posting.additional) parts.push(posting.additional);
  return parts.join('\n');
}

export const leverConnector: JobSourceConnector = {
  kind: 'lever',
  label: 'Lever',
  documentationUrl: 'https://github.com/lever/postings-api',
  requiresIdentifier: true,

  async fetchJobs(context: ConnectorContext): Promise<ConnectorResult> {
    const company = context.identifier.trim();
    if (!company) {
      return { jobs: [], partial: false, warnings: ['Empresa do Lever não informada.'] };
    }

    const url = `${BASE}/${encodeURIComponent(company)}?mode=json&limit=${Math.min(context.limit, 100)}`;
    const postings = await fetchJson<LeverPosting[]>(url, {
      ...(context.signal ? { signal: context.signal } : {}),
    });

    const since = context.since ? new Date(context.since).getTime() : null;
    const jobs: RawJob[] = [];

    for (const posting of Array.isArray(postings) ? postings : []) {
      if (!posting.id || !posting.text) continue;

      const createdAt = typeof posting.createdAt === 'number' ? posting.createdAt : null;
      if (since && createdAt && createdAt <= since) continue;

      const workplace = mapWorkplaceType(posting.workplaceType);
      const location = posting.categories?.location?.trim() || posting.country?.trim() || null;

      jobs.push({
        sourceJobId: posting.id,
        title: posting.text,
        company,
        location,
        isRemote: workplace.isRemote,
        isHybrid: workplace.isHybrid,
        employmentTypeRaw: posting.categories?.commitment ?? null,
        descriptionHtml: buildDescription(posting),
        descriptionText: posting.descriptionPlain ?? null,
        publishedAt: createdAt ? new Date(createdAt).toISOString() : null,
        sourceUrl: posting.hostedUrl ?? `https://jobs.lever.co/${company}/${posting.id}`,
        applicationUrl: posting.applyUrl ?? posting.hostedUrl ?? '',
        applicationMethod: 'ats_form',
        department: posting.categories?.department ?? null,
        tags: [posting.categories?.team, posting.categories?.department].filter((item): item is string => Boolean(item)),
        raw: posting,
      });

      if (jobs.length >= context.limit) break;
    }

    return { jobs, partial: false, warnings: [] };
  },
};
