/** Rotas de vagas e da análise/matching (§20/§21/§22/§30). */
import { z } from 'zod';
import { parseWith, route, type Ctx, type Route } from '../_lib/router.js';
import { mapDbError } from '../_lib/supabase.js';
import { notFound } from '../_lib/errors.js';
import { uuidSchema } from '../../shared/schemas/common.js';
import { jobInputSchema, type JobAnalysisRecord } from '../../shared/schemas/job.js';
import { JOB_STATUSES } from '../../shared/constants.js';
import { fromJob, toJob, toJobAnalysisRecord } from '../_services/mappers.js';
import { analysisFingerprint, getJob, getProfileBundle, getSettings, listResumes } from '../_services/repository.js';
import { analyzeJobWithMatching } from '../_services/ai-operations.js';

type Row = Record<string, unknown>;

function ensure(result: { data: unknown; error: unknown }): Row {
  if (result.error) throw mapDbError(result.error as { code?: string; message: string });
  const row = result.data as Row | null;
  if (!row) throw notFound('Vaga não encontrada.');
  return row;
}

const listQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

async function loadLatestAnalysis(ctx: Ctx, jobId: string, fingerprint?: string) {
  let query = ctx.db
    .from('job_analyses')
    .select('*')
    .eq('job_id', jobId)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (fingerprint) query = query.eq('fingerprint', fingerprint);

  const { data, error } = await query;
  if (error) throw mapDbError(error);
  const row = (data ?? [])[0] as Row | undefined;
  return row ? toJobAnalysisRecord(row) : null;
}

export const jobRoutes: Route[] = [
  route('GET', 'jobs', async (ctx) => {
    const query = parseWith(listQuerySchema, ctx.query);
    let request = ctx.db
      .from('jobs')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(query.limit);
    if (query.status) request = request.eq('status', query.status);

    const { data, error } = await request;
    if (error) throw mapDbError(error);
    return (data ?? []).map((row) => toJob(row as Row));
  }),

  route('GET', 'jobs/:id', async (ctx) => getJob(ctx.db, ctx.user.id, parseWith(uuidSchema, ctx.params.id))),

  route('POST', 'jobs', async (ctx) => {
    const input = parseWith(jobInputSchema, ctx.body);
    const row = ensure(
      await ctx.db
        .from('jobs')
        .insert({ ...fromJob(input), user_id: ctx.user.id })
        .select('*')
        .single(),
    );
    return toJob(row);
  }),

  route('PATCH', 'jobs/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const input = parseWith(jobInputSchema, ctx.body);
    const row = ensure(
      await ctx.db.from('jobs').update(fromJob(input)).eq('id', id).eq('user_id', ctx.user.id).select('*').maybeSingle(),
    );
    return toJob(row);
  }),

  route('DELETE', 'jobs/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db.from('jobs').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),

  /** Análise em cache: só consome IA quando o contexto realmente mudou (§30). */
  route('GET', 'jobs/:id/analysis', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const [job, resumes] = await Promise.all([getJob(ctx.db, ctx.user.id, id), listResumes(ctx.db, ctx.user.id)]);
    const fingerprint = analysisFingerprint(job, resumes);
    const latest = await loadLatestAnalysis(ctx, id);
    return {
      analysis: latest,
      stale: latest ? latest.fingerprint !== fingerprint : false,
      hasResumes: resumes.length > 0,
    };
  }),

  route('POST', 'jobs/:id/analyze', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const force = parseWith(z.object({ force: z.boolean().default(false) }), ctx.body ?? {}).force;

    const [job, resumes, settings] = await Promise.all([
      getJob(ctx.db, ctx.user.id, id),
      listResumes(ctx.db, ctx.user.id),
      getSettings(ctx.db, ctx.user.id),
    ]);
    const fingerprint = analysisFingerprint(job, resumes);

    if (!force) {
      const cached = await loadLatestAnalysis(ctx, id, fingerprint);
      if (cached) return { analysis: cached, cached: true, stale: false, hasResumes: resumes.length > 0 };
    }

    const profileBundle = await getProfileBundle(ctx.db, ctx.user.id);
    const outcome = await analyzeJobWithMatching(
      { db: ctx.db, userId: ctx.user.id, settings },
      job,
      resumes,
      profileBundle,
    );

    const row = ensure(
      await ctx.db
        .from('job_analyses')
        .upsert(
          {
            user_id: ctx.user.id,
            job_id: id,
            fingerprint,
            analysis: outcome.analysis,
            matches: outcome.matches,
            recommended_resume_id: outcome.recommendedResumeId,
            recommendation_reason: outcome.recommendationReason.slice(0, 2000),
            provider: outcome.meta.provider,
            model: outcome.meta.model,
          },
          { onConflict: 'job_id,fingerprint' },
        )
        .select('*')
        .single(),
    );

    if (job.status === 'nova') {
      const { error } = await ctx.db
        .from('jobs')
        .update({ status: 'analisada' })
        .eq('id', id)
        .eq('user_id', ctx.user.id);
      if (error) console.warn('[jobs] não foi possível atualizar o status da vaga:', error.message);
    }

    const analysis: JobAnalysisRecord = toJobAnalysisRecord(row);
    return {
      analysis,
      cached: false,
      stale: false,
      hasResumes: resumes.length > 0,
      provider: outcome.meta.provider,
      fallbackUsed: outcome.meta.fallbackUsed,
    };
  }),
];
