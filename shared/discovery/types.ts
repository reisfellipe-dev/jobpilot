/**
 * Tipos do Discovery Engine (§3, §4, §20).
 *
 * Distinção central do produto: o que veio da fonte, o que foi deduzido pelo
 * sistema e o que simplesmente não existe. Nenhum dado ausente pode virar
 * estimativa apresentada como fato.
 */

/** Estado de um dado usado no preenchimento de candidatura (§20). */
export type DataState = 'KNOWN' | 'UNKNOWN' | 'INFERRED' | 'USER_REQUIRED';

/** Procedência de um campo da vaga (§4). */
export type FieldOrigin = 'source' | 'inferred' | 'absent';

/** Mapa campo → procedência, persistido junto da vaga. */
export type FieldOrigins = Record<string, FieldOrigin>;

export const SOURCE_KINDS = ['greenhouse', 'lever', 'ashby', 'remotive', 'remoteok', 'arbeitnow'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Fontes conhecidas porém sem integração legítima possível (§2, §42). */
export const UNSUPPORTED_SOURCES = ['linkedin', 'indeed', 'gupy', 'catho', 'vagas', 'glassdoor', 'infojobs'] as const;
export type UnsupportedSource = (typeof UNSUPPORTED_SOURCES)[number];

export const SOURCE_LABEL: Record<SourceKind, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  remotive: 'Remotive',
  remoteok: 'Remote OK',
  arbeitnow: 'Arbeitnow',
};

/** Conectores por empresa exigem um identificador (board token / slug). */
export const SOURCE_REQUIRES_IDENTIFIER: Record<SourceKind, boolean> = {
  greenhouse: true,
  lever: true,
  ashby: true,
  remotive: false,
  remoteok: false,
  arbeitnow: false,
};

/**
 * Atribuição exigida pelos termos de uso da fonte.
 * Remote OK e Remotive pedem crédito visível — a interface honra isso.
 */
export const SOURCE_ATTRIBUTION: Partial<Record<SourceKind, { label: string; url: string }>> = {
  remoteok: { label: 'Remote OK', url: 'https://remoteok.com' },
  remotive: { label: 'Remotive', url: 'https://remotive.com' },
};

export type ApplicationMethod = 'unknown' | 'ats_form' | 'external_site' | 'email';

/** Saída crua de um conector, antes de qualquer normalização. */
export interface RawJob {
  sourceJobId: string;
  title: string;
  company: string;
  companyUrl?: string | null;
  location?: string | null;
  isRemote?: boolean | null;
  isHybrid?: boolean | null;
  employmentTypeRaw?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  sourceUrl: string;
  applicationUrl?: string | null;
  applicationMethod?: ApplicationMethod;
  salaryText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  tags?: string[];
  department?: string | null;
  /** Payload original para auditoria (§4). Truncado antes de persistir. */
  raw: unknown;
}

/** Vaga após normalização, pronta para deduplicação e persistência. */
export interface NormalizedJob {
  source: SourceKind;
  sourceJobId: string;
  sourceUrl: string;
  applicationUrl: string;
  applicationMethod: ApplicationMethod;

  title: string;
  company: string;
  companyUrl: string;
  location: string | null;
  isRemote: boolean | null;
  isHybrid: boolean | null;
  employmentType: string | null;
  seniority: string | null;

  description: string;
  requirements: string[];
  niceToHave: string[];
  technologies: string[];

  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;

  publishedAt: string | null;
  fingerprint: string;
  fieldOrigins: FieldOrigins;
  raw: unknown;
}

/** Resultado da execução de um conector. */
export interface ConnectorResult {
  jobs: RawJob[];
  /** Fontes que responderam parcialmente ainda entregam o que deu certo (§35). */
  partial: boolean;
  warnings: string[];
}

export interface ConnectorContext {
  /** Identificador da empresa no ATS (board token, slug). */
  identifier: string;
  /** Termos derivados do perfil, usados por agregadores que aceitam busca (§10). */
  searchTerms: string[];
  /** Só busca o que mudou desde aqui (§7). */
  since: string | null;
  /** Teto de vagas por fonte, para conter custo e tempo. */
  limit: number;
  signal?: AbortSignal;
}

/** Contrato único de conector de vagas (§1). */
export interface JobSourceConnector {
  readonly kind: SourceKind;
  readonly label: string;
  /** Descreve de onde vêm os dados — exibido na auditoria de origem (§38). */
  readonly documentationUrl: string;
  readonly requiresIdentifier: boolean;
  fetchJobs(context: ConnectorContext): Promise<ConnectorResult>;
}

/** Motivo pelo qual uma plataforma não é suportada — exibido ao usuário (§42). */
export interface UnsupportedSourceInfo {
  kind: UnsupportedSource;
  label: string;
  reason: string;
}

export const UNSUPPORTED_SOURCE_INFO: UnsupportedSourceInfo[] = [
  {
    kind: 'linkedin',
    label: 'LinkedIn',
    reason:
      'Não possui API pública de vagas. O acesso automatizado é proibido pelos Termos de Uso e protegido por mecanismos anti-bot.',
  },
  {
    kind: 'gupy',
    label: 'Gupy',
    reason: 'Não expõe API pública documentada para busca de vagas por terceiros.',
  },
  {
    kind: 'indeed',
    label: 'Indeed',
    reason: 'A API de publicação foi descontinuada para novos parceiros; a raspagem é bloqueada e proibida.',
  },
  {
    kind: 'catho',
    label: 'Catho',
    reason: 'Sem API pública. O conteúdo exige autenticação de usuário.',
  },
  {
    kind: 'vagas',
    label: 'Vagas.com',
    reason: 'Sem API pública documentada para consumo por terceiros.',
  },
  {
    kind: 'glassdoor',
    label: 'Glassdoor',
    reason: 'API restrita a parceiros aprovados; não há acesso público.',
  },
  {
    kind: 'infojobs',
    label: 'InfoJobs',
    reason: 'A API pública brasileira foi descontinuada.',
  },
];
