/**
 * Acesso a dados. Toda query filtra explicitamente por user_id, mesmo com RLS
 * ativa - defesa em profundidade contra erro de policy (§11).
 */
import { createHash } from 'node:crypto';
import { ApiError, notFound } from '../_lib/errors.js';
import { mapDbError, type Db } from '../_lib/supabase.js';
import type { Experience, Profile, Project, Skill } from '../../shared/schemas/profile.js';
import type { Resume } from '../../shared/schemas/resume.js';
import type { Job } from '../../shared/schemas/job.js';
import {
  toExperience,
  toJob,
  toProfile,
  toProject,
  toResume,
  toSettings,
  toSkill,
  type UserSettings,
} from './mappers.js';

type Row = Record<string, unknown>;

function rows(result: { data: unknown; error: unknown }): Row[] {
  if (result.error) throw mapDbError(result.error as { code?: string; message: string });
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

function single(result: { data: unknown; error: unknown }): Row | null {
  if (result.error) {
    const error = result.error as { code?: string; message: string };
    if (error.code === 'PGRST116') return null;
    throw mapDbError(error);
  }
  return (result.data as Row) ?? null;
}

// -----------------------------------------------------------------------------
// Perfil
// -----------------------------------------------------------------------------
export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const row = single(await db.from('profiles').select('*').eq('id', userId).maybeSingle());
  if (!row) {
    // O trigger de signup cria o perfil; se faltar (usuario legado), cria agora.
    const created = single(await db.from('profiles').insert({ id: userId }).select('*').single());
    if (!created) throw new ApiError('internal_error', 'Não foi possível criar o perfil.');
    return toProfile(created);
  }
  return toProfile(row);
}

export async function listExperiences(db: Db, userId: string): Promise<Experience[]> {
  return rows(
    await db
      .from('experiences')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('start_date', { ascending: false, nullsFirst: false }),
  ).map(toExperience);
}

export async function listProjects(db: Db, userId: string): Promise<Project[]> {
  return rows(
    await db.from('projects').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
  ).map(toProject);
}

export async function listSkills(db: Db, userId: string): Promise<Skill[]> {
  return rows(
    await db.from('skills').select('*').eq('user_id', userId).order('name', { ascending: true }),
  ).map(toSkill);
}

export interface ProfileBundle {
  profile: Profile;
  experiences: Experience[];
  projects: Project[];
  skills: Skill[];
}

export async function getProfileBundle(db: Db, userId: string): Promise<ProfileBundle> {
  const [profile, experiences, projects, skills] = await Promise.all([
    getProfile(db, userId),
    listExperiences(db, userId),
    listProjects(db, userId),
    listSkills(db, userId),
  ]);
  return { profile, experiences, projects, skills };
}

// -----------------------------------------------------------------------------
// Curriculos
// -----------------------------------------------------------------------------
export async function listResumes(db: Db, userId: string): Promise<Resume[]> {
  return rows(
    await db
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false }),
  ).map(toResume);
}

export async function getResume(db: Db, userId: string, id: string): Promise<Resume> {
  const row = single(await db.from('resumes').select('*').eq('id', id).eq('user_id', userId).maybeSingle());
  if (!row) throw notFound('Currículo não encontrado.');
  return toResume(row);
}

// -----------------------------------------------------------------------------
// Vagas
// -----------------------------------------------------------------------------
export async function getJob(db: Db, userId: string, id: string): Promise<Job> {
  const row = single(await db.from('jobs').select('*').eq('id', id).eq('user_id', userId).maybeSingle());
  if (!row) throw notFound('Vaga não encontrada.');
  return toJob(row);
}

// -----------------------------------------------------------------------------
// Configuracoes
// -----------------------------------------------------------------------------
export async function getSettings(db: Db, userId: string): Promise<UserSettings> {
  const row = single(await db.from('settings').select('*').eq('user_id', userId).maybeSingle());
  if (row) return toSettings(row);
  const created = single(await db.from('settings').insert({ user_id: userId }).select('*').single());
  return toSettings(created);
}

// -----------------------------------------------------------------------------
// Cache de analise (§30)
// -----------------------------------------------------------------------------
/**
 * Impressao digital do contexto de uma analise. Muda quando a vaga muda ou
 * quando qualquer curriculo considerado muda - forcando reanalise apenas
 * quando o resultado realmente pode ser diferente.
 */
export function analysisFingerprint(job: Job, resumes: Resume[], version = 'v1'): string {
  const jobPart = JSON.stringify({
    t: job.title,
    c: job.company,
    d: job.description,
    r: job.requirements,
    n: job.niceToHave,
    tech: job.technologies,
    s: job.seniority,
    w: job.workMode,
    l: job.location,
  });
  const resumePart = resumes
    .map((resume) => `${resume.id}:${resume.updatedAt}`)
    .sort()
    .join('|');
  return createHash('sha256').update(`${version}::${jobPart}::${resumePart}`).digest('hex').slice(0, 48);
}
