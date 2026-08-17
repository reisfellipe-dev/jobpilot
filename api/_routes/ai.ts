/** Rotas de IA. Todo acesso a provider passa por aqui - nunca pelo navegador (§4). */
import { z } from 'zod';
import { parseWith, route, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { uuidSchema } from '../../shared/schemas/common';
import { ANSWER_KINDS, MAX_JOB_TEXT_CHARS, MAX_RESUME_TEXT_CHARS } from '../../shared/constants';
import { jobAnalysisSchema, type JobAnalysis } from '../../shared/schemas/job';
import { getAIService } from '../_services/ai/service';
import {
  adaptResumeForJob,
  extractJobFromText,
  extractResumeFromText,
  generateApplicationAnswer,
} from '../_services/ai-operations';
import { getJob, getProfileBundle, getResume, getSettings, listSkills } from '../_services/repository';
import { AI_QUOTAS } from '../_services/ratelimit';

type Row = Record<string, unknown>;

const textSchema = (max: number) =>
  z.object({
    text: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'Envie o conteúdo a ser analisado.').max(max, 'Conteúdo grande demais.')),
  });

const adaptSchema = z.object({
  jobId: uuidSchema,
  resumeId: uuidSchema,
});

const answerSchema = z.object({
  kind: z.enum(ANSWER_KINDS),
  question: z.string().max(2000).optional(),
  jobId: uuidSchema,
  resumeId: uuidSchema.nullish(),
});

/** Última análise salva da vaga, usada como contexto extra quando existir. */
async function loadAnalysis(db: Parameters<typeof getJob>[0], userId: string, jobId: string): Promise<JobAnalysis | null> {
  const { data, error } = await db
    .from('job_analyses')
    .select('analysis')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw mapDbError(error);
  const row = (data ?? [])[0] as Row | undefined;
  if (!row) return null;
  const parsed = jobAnalysisSchema.safeParse(row.analysis);
  return parsed.success ? parsed.data : null;
}

export const aiRoutes: Route[] = [
  /** Diagnóstico de disponibilidade - não expõe chaves, apenas estado. */
  route('GET', 'ai/status', async () => {
    const status = getAIService().status();
    return {
      ...status,
      quotas: Object.entries(AI_QUOTAS).map(([operation, quota]) => ({ operation, ...quota })),
    };
  }),

  route('POST', 'ai/extract-resume', async (ctx) => {
    const { text } = parseWith(textSchema(MAX_RESUME_TEXT_CHARS * 2), ctx.body);
    const settings = await getSettings(ctx.db, ctx.user.id);
    const { extraction, meta } = await extractResumeFromText(
      { db: ctx.db, userId: ctx.user.id, settings },
      text,
    );
    return { extraction, meta };
  }),

  route('POST', 'ai/extract-job', async (ctx) => {
    const { text } = parseWith(textSchema(MAX_JOB_TEXT_CHARS * 2), ctx.body);
    const settings = await getSettings(ctx.db, ctx.user.id);
    const { extraction, meta } = await extractJobFromText({ db: ctx.db, userId: ctx.user.id, settings }, text);
    return { extraction, meta };
  }),

  /** Pré-visualização da adaptação. Nada é salvo sem aprovação do usuário (§24). */
  route('POST', 'ai/adapt-resume', async (ctx) => {
    const input = parseWith(adaptSchema, ctx.body);
    const [job, resume, settings, skills] = await Promise.all([
      getJob(ctx.db, ctx.user.id, input.jobId),
      getResume(ctx.db, ctx.user.id, input.resumeId),
      getSettings(ctx.db, ctx.user.id),
      listSkills(ctx.db, ctx.user.id),
    ]);
    const analysis = await loadAnalysis(ctx.db, ctx.user.id, input.jobId);

    const outcome = await adaptResumeForJob(
      { db: ctx.db, userId: ctx.user.id, settings },
      job,
      analysis,
      resume,
      skills.map((skill) => skill.name),
    );

    return {
      original: resume.content,
      adapted: outcome.content,
      changes: outcome.changes,
      keywordsAdded: outcome.keywordsAdded,
      missingInfo: outcome.missingInfo,
      atsNotes: outcome.atsNotes,
      violations: outcome.violations,
      meta: outcome.meta,
    };
  }),

  route('POST', 'ai/generate-answer', async (ctx) => {
    const input = parseWith(answerSchema, ctx.body);
    const [job, settings, profile] = await Promise.all([
      getJob(ctx.db, ctx.user.id, input.jobId),
      getSettings(ctx.db, ctx.user.id),
      getProfileBundle(ctx.db, ctx.user.id),
    ]);
    const resume = input.resumeId ? await getResume(ctx.db, ctx.user.id, input.resumeId) : null;
    const analysis = await loadAnalysis(ctx.db, ctx.user.id, input.jobId);

    const outcome = await generateApplicationAnswer(
      { db: ctx.db, userId: ctx.user.id, settings },
      {
        kind: input.kind,
        ...(input.question ? { question: input.question } : {}),
        job,
        analysis,
        resume,
        profile,
      },
    );

    return outcome;
  }),
];
