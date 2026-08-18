/**
 * Preparação de candidatura (§15–§20).
 *
 * Junta vaga + perfil + currículo recomendado + perguntas reais do formulário
 * e devolve um plano revisável. Não envia nada: o usuário permanece no controle
 * do envio do começo ao fim (§17).
 */
import { mapDbError, type Db } from '../../_lib/supabase.js';
import { notFound } from '../../_lib/errors.js';
import type { ApplicationPlan } from '../../../shared/discovery/schemas.js';
import { getApplicationConnector } from './connectors.js';
import { mapQuestions, type MapperProfile } from './field-mapping.js';
import { getProfileBundle, getResume, listResumes } from '../repository.js';
import { toJob } from '../mappers.js';

type Row = Record<string, unknown>;

export interface ApplicationContext {
  db: Db;
  userId: string;
}

/** Identificador da empresa no ATS, necessário para ler o formulário. */
function extractIdentifier(source: string, sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    if (source === 'greenhouse') {
      const embedded = url.searchParams.get('for');
      if (embedded) return embedded;
      const index = segments.indexOf('embed');
      if (index >= 0) return segments[index + 1] ?? '';
      return segments[0] ?? '';
    }
    if (source === 'lever' || source === 'ashby') return segments[0] ?? '';
  } catch {
    return '';
  }
  return '';
}

async function loadSavedAnswers(ctx: ApplicationContext): Promise<Map<string, string>> {
  const { data, error } = await ctx.db
    .from('application_field_maps')
    .select('question_key, answer')
    .eq('user_id', ctx.userId)
    .limit(500);
  if (error) throw mapDbError(error);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Row[]) {
    const key = String(row.question_key ?? '');
    const answer = String(row.answer ?? '');
    if (key && answer) map.set(key, answer);
  }
  return map;
}

export async function buildApplicationPlan(
  ctx: ApplicationContext,
  jobId: string,
  requestedResumeId?: string | null,
): Promise<ApplicationPlan> {
  const { data: jobRow, error: jobError } = await ctx.db
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (jobError) throw mapDbError(jobError);
  if (!jobRow) throw notFound('Vaga não encontrada.');

  const job = toJob(jobRow as Row);
  const raw = jobRow as Row;
  const source = String(raw.source ?? '');
  const sourceJobId = String(raw.source_job_id ?? '');
  const sourceUrl = String(raw.source_url ?? job.url);
  const applicationUrl = String(raw.application_url ?? '') || sourceUrl || job.url;

  // --- Currículo: pedido > recomendado pela análise > melhor match > padrão ---
  let resumeId = requestedResumeId ?? (raw.recommended_resume_id ? String(raw.recommended_resume_id) : null);

  if (!resumeId) {
    const { data: matchRows } = await ctx.db
      .from('job_matches')
      .select('resume_id, score')
      .eq('job_id', jobId)
      .eq('user_id', ctx.userId)
      .order('score', { ascending: false })
      .limit(1);
    const best = (matchRows ?? [])[0] as Row | undefined;
    if (best) resumeId = String(best.resume_id);
  }

  const [bundle, savedAnswers] = await Promise.all([getProfileBundle(ctx.db, ctx.userId), loadSavedAnswers(ctx)]);

  let resumeName = '';
  if (resumeId) {
    try {
      const resume = await getResume(ctx.db, ctx.userId, resumeId);
      resumeName = resume.name;
    } catch {
      resumeId = null;
    }
  }
  if (!resumeId) {
    const resumes = await listResumes(ctx.db, ctx.userId);
    const fallback = resumes.find((item) => item.isDefault) ?? resumes[0];
    if (fallback) {
      resumeId = fallback.id;
      resumeName = fallback.name;
    }
  }

  // --- Formulário: perguntas reais quando a plataforma as publica ---
  const connector = getApplicationConnector(source);
  const form = await connector.loadForm({
    sourceJobId,
    identifier: extractIdentifier(source, sourceUrl),
    applicationUrl,
  });

  const profile: MapperProfile = {
    fullName: bundle.profile.fullName,
    email: bundle.profile.email,
    phone: bundle.profile.phone,
    location: bundle.profile.location,
    headline: bundle.profile.headline,
    summary: bundle.profile.summary,
    links: bundle.profile.links,
    skills: [...bundle.skills.map((skill) => skill.name), ...bundle.experiences.flatMap((item) => item.technologies)],
    experiences: bundle.experiences.map((item) => ({
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      isCurrent: item.isCurrent,
    })),
    desiredRoles: bundle.profile.desiredRoles,
    seniority: bundle.profile.seniority ?? null,
  };

  const fields = mapQuestions(form.questions, profile, { savedAnswers });
  const needsReview = fields.filter((field) => field.state === 'USER_REQUIRED' || field.state === 'UNKNOWN');

  const warnings = [...form.warnings];
  if (!resumeId) warnings.push('Nenhum currículo cadastrado — cadastre um para anexar na plataforma.');
  if (!bundle.profile.email) warnings.push('Seu perfil está sem e-mail; a maioria dos formulários exige.');

  return {
    jobId,
    jobTitle: job.title,
    company: job.company,
    applicationUrl,
    applicationMethod: connector.applicationMethod,
    canAutoSubmit: connector.canAutoSubmit,
    autoSubmitReason: connector.autoSubmitReason,
    fieldsSource: form.origin,
    fields,
    needsReview,
    resumeId,
    resumeName,
    warnings,
  };
}

/** Guarda uma resposta revisada para reaproveitar nas próximas candidaturas (§18). */
export async function saveFieldAnswer(
  ctx: ApplicationContext,
  input: { questionKey: string; questionLabel: string; answer: string },
): Promise<void> {
  const { error } = await ctx.db.from('application_field_maps').upsert(
    {
      user_id: ctx.userId,
      question_key: input.questionKey.slice(0, 300),
      question_label: input.questionLabel.slice(0, 300),
      answer: input.answer.slice(0, 5000),
      state: 'KNOWN',
    },
    { onConflict: 'user_id,question_key', ignoreDuplicates: false },
  );
  if (error) throw mapDbError(error);
}
