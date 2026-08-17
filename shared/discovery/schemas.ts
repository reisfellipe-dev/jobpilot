/** Contratos de API do Discovery Engine, compartilhados entre cliente e servidor. */
import { z } from 'zod';
import { uuidSchema } from '../schemas/common';
import { SENIORITY_LEVELS, WORK_MODES } from '../constants';
import { SOURCE_KINDS, type ApplicationMethod, type DataState, type FieldOrigins, type SourceKind } from './types';

export const sourceKindSchema = z.enum(SOURCE_KINDS);

/** Cadastro manual de fonte, quando o usuário já sabe o board/slug. */
export const jobSourceInputSchema = z.object({
  kind: sourceKindSchema,
  identifier: z.string().trim().max(200).default(''),
  label: z.string().trim().max(200).default(''),
  sourceUrl: z.string().trim().max(500).default(''),
  enabled: z.boolean().default(true),
});
export type JobSourceInput = z.infer<typeof jobSourceInputSchema>;

/** Cadastro a partir da URL da página de carreiras — o sistema detecta o ATS. */
export const detectSourceSchema = z.object({
  url: z
    .string()
    .trim()
    .min(4, 'Informe a URL da página de vagas.')
    .max(500)
    .regex(/^https?:\/\/\S+$/i, 'A URL precisa começar com http:// ou https://'),
});

export const runDiscoverySchema = z.object({
  /** Restringe a execução a fontes específicas; vazio executa todas as ativas. */
  sourceIds: z.array(uuidSchema).max(50).default([]),
  /** Ignora o corte incremental e revarre a fonte inteira. */
  full: z.boolean().default(false),
});

export const discoveryFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  seniority: z.enum(SENIORITY_LEVELS).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  source: sourceKindSchema.optional(),
  company: z.string().trim().max(160).optional(),
  technology: z.string().trim().max(60).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxAgeDays: z.coerce.number().int().min(1).max(365).optional(),
  hasSalary: z.coerce.boolean().optional(),
  sort: z.enum(['relevancia', 'match', 'recente', 'empresa']).default('relevancia'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});
export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;

export const jobDecisionSchema = z.object({
  action: z.enum(['salvar', 'descartar', 'restaurar']),
});

// -----------------------------------------------------------------------------
// Tipos de resposta
// -----------------------------------------------------------------------------

export interface JobSourceRef {
  source: SourceKind;
  sourceJobId: string;
  sourceUrl: string;
  applicationUrl: string;
  discoveredAt: string;
}

export interface DiscoveredJobMatch {
  resumeId: string;
  resumeName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  isRecommended: boolean;
}

/** Vaga descoberta, no formato consumido pela tela /descobrir. */
export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  companyUrl: string;
  location: string | null;
  isRemote: boolean | null;
  isHybrid: boolean | null;
  employmentType: string | null;
  seniority: string | null;
  technologies: string[];
  requirements: string[];
  description: string;

  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;

  source: SourceKind;
  sourceUrl: string;
  applicationUrl: string;
  applicationMethod: ApplicationMethod;
  sources: JobSourceRef[];
  sourceCount: number;

  publishedAt: string | null;
  discoveredAt: string | null;
  fieldOrigins: FieldOrigins;

  matchScore: number | null;
  relevanceScore: number | null;
  recommendedResumeId: string | null;
  matches: DiscoveredJobMatch[];

  status: string;
  savedAt: string | null;
}

export interface SourceHealth {
  id: string;
  kind: SourceKind;
  label: string;
  identifier: string;
  sourceUrl: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastStatus: string;
  lastError: string;
  lastDurationMs: number;
  consecutiveFailures: number;
  totalJobsFound: number;
}

export interface SyncResultItem {
  sourceId: string | null;
  kind: SourceKind;
  label: string;
  status: 'ok' | 'erro' | 'ignorada';
  jobsFound: number;
  jobsNew: number;
  jobsUpdated: number;
  jobsDuplicated: number;
  jobsFiltered: number;
  durationMs: number;
  error: string;
}

export interface DiscoveryRunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalNew: number;
  totalUpdated: number;
  totalFound: number;
  highMatches: number;
  results: SyncResultItem[];
  strategy: { terms: string[]; explanation: string[] };
  /** Fontes que falharam sem interromper as demais (§35). */
  failedSources: string[];
}

// -----------------------------------------------------------------------------
// Candidatura assistida (§15–§20)
// -----------------------------------------------------------------------------

export interface ApplicationFieldPlan {
  key: string;
  label: string;
  required: boolean;
  type: string;
  /** KNOWN | INFERRED | UNKNOWN | USER_REQUIRED */
  state: DataState;
  value: string;
  /** De onde veio o valor: "profile.email", "cálculo", "resposta salva". */
  origin: string;
  options: string[];
  note: string;
}

export interface ApplicationPlan {
  jobId: string;
  jobTitle: string;
  company: string;
  applicationUrl: string;
  applicationMethod: ApplicationMethod;
  /** Se a submissão automática é possível nesta plataforma (§16, §17). */
  canAutoSubmit: boolean;
  autoSubmitReason: string;
  /** Perguntas reais obtidas da fonte, quando ela as expõe publicamente. */
  fieldsSource: 'source' | 'generic';
  fields: ApplicationFieldPlan[];
  needsReview: ApplicationFieldPlan[];
  resumeId: string | null;
  resumeName: string;
  warnings: string[];
}
