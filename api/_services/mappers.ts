/**
 * Conversao entre linhas do Postgres (snake_case) e o dominio (camelCase).
 * Todo jsonb vindo do banco passa por Zod antes de virar objeto de dominio:
 * dados persistidos tambem sao tratados como entrada nao confiavel.
 */
import type { Seniority, WorkMode } from '../../shared/constants.js';
import { SENIORITY_LEVELS, WORK_MODES } from '../../shared/constants.js';
import type { Experience, Profile, Project, Skill } from '../../shared/schemas/profile.js';
import { certificationSchema, educationSchema, languageSchema, SKILL_CATEGORIES } from '../../shared/schemas/profile.js';
import { linkSchema } from '../../shared/schemas/common.js';
import { emptyResumeContent, resumeContentSchema, type Resume, type ResumeVersion } from '../../shared/schemas/resume.js';
import {
  jobAnalysisSchema,
  resumeMatchSchema,
  type Job,
  type JobAnalysisRecord,
  type ResumeMatch,
} from '../../shared/schemas/job.js';
import type { Application, ApplicationAnswer } from '../../shared/schemas/application.js';
import { z } from 'zod';

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const bool = (value: unknown): boolean => value === true;
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const nullableStr = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function enumOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseArray<S extends z.ZodTypeAny>(value: unknown, schema: S): z.output<S>[] {
  if (!Array.isArray(value)) return [];
  const out: z.output<S>[] = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------
export function toProfile(row: Row): Profile {
  return {
    id: str(row.id),
    fullName: str(row.full_name),
    avatarUrl: str(row.avatar_url),
    email: str(row.email),
    phone: str(row.phone),
    location: str(row.location),
    headline: str(row.headline),
    summary: str(row.summary),
    education: parseArray(row.education, educationSchema),
    certifications: parseArray(row.certifications, certificationSchema),
    languages: parseArray(row.languages, languageSchema),
    links: parseArray(row.links, linkSchema),
    desiredRoles: strArray(row.desired_roles),
    seniority: enumOrNull<Seniority>(row.seniority, SENIORITY_LEVELS),
    workModes: strArray(row.work_modes).filter((mode): mode is WorkMode =>
      (WORK_MODES as readonly string[]).includes(mode),
    ),
    desiredLocation: str(row.desired_location),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function fromProfile(input: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Row {
  return {
    full_name: input.fullName,
    avatar_url: input.avatarUrl,
    email: input.email,
    phone: input.phone,
    location: input.location,
    headline: input.headline,
    summary: input.summary,
    education: input.education,
    certifications: input.certifications,
    languages: input.languages,
    links: input.links,
    desired_roles: input.desiredRoles,
    seniority: input.seniority ?? null,
    work_modes: input.workModes,
    desired_location: input.desiredLocation,
  };
}

// -----------------------------------------------------------------------------
// Experience / Project / Skill
// -----------------------------------------------------------------------------
export function toExperience(row: Row): Experience {
  return {
    id: str(row.id),
    company: str(row.company),
    role: str(row.role),
    description: str(row.description),
    startDate: nullableStr(row.start_date),
    endDate: nullableStr(row.end_date),
    isCurrent: bool(row.is_current),
    technologies: strArray(row.technologies),
    achievements: strArray(row.achievements),
    responsibilities: strArray(row.responsibilities),
    sortOrder: num(row.sort_order),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function fromExperience(input: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>): Row {
  return {
    company: input.company,
    role: input.role,
    description: input.description,
    start_date: input.startDate || null,
    end_date: input.isCurrent ? null : input.endDate || null,
    is_current: input.isCurrent,
    technologies: input.technologies,
    achievements: input.achievements,
    responsibilities: input.responsibilities,
    sort_order: input.sortOrder,
  };
}

export function toProject(row: Row): Project {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    technologies: strArray(row.technologies),
    url: str(row.url),
    githubUrl: str(row.github_url),
    outcomes: strArray(row.outcomes),
    startDate: nullableStr(row.start_date),
    endDate: nullableStr(row.end_date),
    sortOrder: num(row.sort_order),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function fromProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Row {
  return {
    name: input.name,
    description: input.description,
    technologies: input.technologies,
    url: input.url,
    github_url: input.githubUrl,
    outcomes: input.outcomes,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    sort_order: input.sortOrder,
  };
}

export function toSkill(row: Row): Skill {
  const category = enumOrNull(row.category, SKILL_CATEGORIES) ?? 'outro';
  return {
    id: str(row.id),
    name: str(row.name),
    category,
    level: Math.min(5, Math.max(1, num(row.level) || 3)),
    yearsExperience: typeof row.years_experience === 'number' ? row.years_experience : null,
    createdAt: str(row.created_at),
  };
}

export function fromSkill(input: Omit<Skill, 'id' | 'createdAt'>): Row {
  return {
    name: input.name,
    category: input.category,
    level: input.level,
    years_experience: input.yearsExperience ?? null,
  };
}

// -----------------------------------------------------------------------------
// Resume
// -----------------------------------------------------------------------------
export function toResume(row: Row): Resume {
  const parsed = resumeContentSchema.safeParse(row.content);
  return {
    id: str(row.id),
    name: str(row.name),
    objective: str(row.objective),
    seniority: enumOrNull<Seniority>(row.seniority, SENIORITY_LEVELS),
    description: str(row.description),
    skills: strArray(row.skills),
    targetRoles: strArray(row.target_roles),
    content: parsed.success ? parsed.data : emptyResumeContent(),
    priority: num(row.priority),
    isDefault: bool(row.is_default),
    filePath: str(row.file_path),
    fileName: str(row.file_name),
    fileMime: str(row.file_mime),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function fromResume(input: Omit<Resume, 'id' | 'createdAt' | 'updatedAt'>): Row {
  return {
    name: input.name,
    objective: input.objective,
    seniority: input.seniority ?? null,
    description: input.description,
    skills: input.skills,
    target_roles: input.targetRoles,
    content: input.content,
    priority: input.priority,
    is_default: input.isDefault,
    file_path: input.filePath,
    file_name: input.fileName,
    file_mime: input.fileMime,
  };
}

export function toResumeVersion(row: Row): ResumeVersion {
  const parsed = resumeContentSchema.safeParse(row.content);
  const changes = parseArray(
    row.changes,
    z.object({
      section: z.string(),
      before: z.string().default(''),
      after: z.string().default(''),
      reason: z.string().default(''),
    }),
  );
  return {
    id: str(row.id),
    resumeId: str(row.resume_id),
    jobId: nullableStr(row.job_id),
    label: str(row.label),
    content: parsed.success ? parsed.data : emptyResumeContent(),
    changes,
    keywordsAdded: strArray(row.keywords_added),
    provider: nullableStr(row.provider),
    model: nullableStr(row.model),
    createdAt: str(row.created_at),
  };
}

// -----------------------------------------------------------------------------
// Job
// -----------------------------------------------------------------------------
export function toJob(row: Row): Job {
  return {
    id: str(row.id),
    company: str(row.company),
    title: str(row.title),
    description: str(row.description),
    url: str(row.url),
    location: str(row.location),
    workMode: enumOrNull<WorkMode>(row.work_mode, WORK_MODES),
    seniority: enumOrNull<Seniority>(row.seniority, SENIORITY_LEVELS),
    requirements: strArray(row.requirements),
    niceToHave: strArray(row.nice_to_have),
    technologies: strArray(row.technologies),
    benefits: strArray(row.benefits),
    salaryRange: str(row.salary_range),
    postedAt: nullableStr(row.posted_at),
    status: (['nova', 'analisada', 'aplicada', 'descartada'] as const).includes(row.status as never)
      ? (row.status as Job['status'])
      : 'nova',
    source: (['manual', 'texto', 'url'] as const).includes(row.source as never)
      ? (row.source as Job['source'])
      : 'manual',
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function fromJob(input: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Row {
  return {
    company: input.company,
    title: input.title,
    description: input.description,
    url: input.url,
    location: input.location,
    work_mode: input.workMode ?? null,
    seniority: input.seniority ?? null,
    requirements: input.requirements,
    nice_to_have: input.niceToHave,
    technologies: input.technologies,
    benefits: input.benefits,
    salary_range: input.salaryRange,
    posted_at: input.postedAt || null,
    status: input.status,
    source: input.source,
  };
}

export function toJobAnalysisRecord(row: Row): JobAnalysisRecord {
  const analysis = jobAnalysisSchema.safeParse(row.analysis);
  const matches: ResumeMatch[] = parseArray(row.matches, resumeMatchSchema);
  return {
    id: str(row.id),
    jobId: str(row.job_id),
    fingerprint: str(row.fingerprint),
    analysis: analysis.success ? analysis.data : jobAnalysisSchema.parse({}),
    matches,
    recommendedResumeId: nullableStr(row.recommended_resume_id),
    recommendationReason: str(row.recommendation_reason),
    provider: nullableStr(row.provider),
    model: nullableStr(row.model),
    createdAt: str(row.created_at),
  };
}

// -----------------------------------------------------------------------------
// Application
// -----------------------------------------------------------------------------
export function toApplication(row: Row): Application {
  return {
    id: str(row.id),
    jobId: str(row.job_id),
    resumeId: nullableStr(row.resume_id),
    resumeVersionId: nullableStr(row.resume_version_id),
    score: typeof row.score === 'number' ? row.score : null,
    status: str(row.status) as Application['status'],
    appliedAt: nullableStr(row.applied_at),
    notes: str(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toApplicationAnswer(row: Row): ApplicationAnswer {
  return {
    id: str(row.id),
    applicationId: str(row.application_id),
    kind: str(row.kind) as ApplicationAnswer['kind'],
    question: str(row.question),
    answer: str(row.answer),
    provider: nullableStr(row.provider),
    model: nullableStr(row.model),
    createdAt: str(row.created_at),
  };
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------
export interface UserSettings {
  aiProviderPreference: 'auto' | 'groq' | 'nvidia';
  allowFallback: boolean;
  tone: 'profissional' | 'direto' | 'entusiasmado' | 'tecnico';
  language: 'pt-BR' | 'en-US';
  aiConsent: boolean;
  /** Descoberta automática por cron (§22). */
  autoDiscovery: boolean;
  discoveryMinScore: number;
  discoveryMaxAgeDays: number;
  /** Termos manuais que substituem a estratégia derivada do perfil (§10). */
  discoveryKeywords: string[];
  discoveryLocations: string[];
  updatedAt: string;
}

export function toSettings(row: Row | null): UserSettings {
  return {
    aiProviderPreference:
      (enumOrNull(row?.ai_provider_preference, ['auto', 'groq', 'nvidia'] as const) ?? 'auto'),
    allowFallback: row?.allow_fallback !== false,
    tone: enumOrNull(row?.tone, ['profissional', 'direto', 'entusiasmado', 'tecnico'] as const) ?? 'profissional',
    language: enumOrNull(row?.language, ['pt-BR', 'en-US'] as const) ?? 'pt-BR',
    aiConsent: row?.ai_consent === true,
    autoDiscovery: row?.auto_discovery === true,
    discoveryMinScore: typeof row?.discovery_min_score === 'number' ? row.discovery_min_score : 55,
    discoveryMaxAgeDays: typeof row?.discovery_max_age_days === 'number' ? row.discovery_max_age_days : 30,
    discoveryKeywords: strArray(row?.discovery_keywords),
    discoveryLocations: strArray(row?.discovery_locations),
    updatedAt: str(row?.updated_at),
  };
}
