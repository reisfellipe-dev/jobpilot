/** Rotas de candidaturas e respostas geradas (§25/§26). */
import { z } from 'zod';
import { parseWith, route, type Ctx, type Route } from '../_lib/router.js';
import { mapDbError } from '../_lib/supabase.js';
import { badRequest, notFound } from '../_lib/errors.js';
import { uuidSchema } from '../../shared/schemas/common.js';
import {
  applicationAnswerInputSchema,
  applicationInputSchema,
  type ApplicationListItem,
} from '../../shared/schemas/application.js';
import { APPLICATION_STATUSES } from '../../shared/constants.js';
import { toApplication, toApplicationAnswer } from '../_services/mappers.js';

type Row = Record<string, unknown>;

const SELECT_WITH_RELATIONS = '*, jobs:job_id (id, title, company, url), resumes:resume_id (id, name)';

function ensure(result: { data: unknown; error: unknown }): Row {
  if (result.error) throw mapDbError(result.error as { code?: string; message: string });
  const row = result.data as Row | null;
  if (!row) throw notFound('Candidatura não encontrada.');
  return row;
}

function toListItem(row: Row): ApplicationListItem {
  const jobRow = (row.jobs ?? null) as Row | null;
  const resumeRow = (row.resumes ?? null) as Row | null;
  return {
    ...toApplication(row),
    job: jobRow
      ? {
          id: String(jobRow.id ?? ''),
          title: String(jobRow.title ?? ''),
          company: String(jobRow.company ?? ''),
          url: String(jobRow.url ?? ''),
        }
      : null,
    resume: resumeRow ? { id: String(resumeRow.id ?? ''), name: String(resumeRow.name ?? '') } : null,
  };
}

/** Confere que as chaves estrangeiras enviadas pertencem ao usuário (§11/§43). */
async function assertReferences(
  ctx: Ctx,
  refs: { jobId?: string | null; resumeId?: string | null; resumeVersionId?: string | null },
): Promise<void> {
  const checks: Array<Promise<void>> = [];

  if (refs.jobId) {
    checks.push(
      (async () => {
        const { data, error } = await ctx.db
          .from('jobs')
          .select('id')
          .eq('id', refs.jobId!)
          .eq('user_id', ctx.user.id)
          .maybeSingle();
        if (error) throw mapDbError(error);
        if (!data) throw notFound('Vaga não encontrada.');
      })(),
    );
  }
  if (refs.resumeId) {
    checks.push(
      (async () => {
        const { data, error } = await ctx.db
          .from('resumes')
          .select('id')
          .eq('id', refs.resumeId!)
          .eq('user_id', ctx.user.id)
          .maybeSingle();
        if (error) throw mapDbError(error);
        if (!data) throw notFound('Currículo não encontrado.');
      })(),
    );
  }
  if (refs.resumeVersionId) {
    checks.push(
      (async () => {
        const { data, error } = await ctx.db
          .from('resume_versions')
          .select('id')
          .eq('id', refs.resumeVersionId!)
          .eq('user_id', ctx.user.id)
          .maybeSingle();
        if (error) throw mapDbError(error);
        if (!data) throw notFound('Versão de currículo não encontrada.');
      })(),
    );
  }

  await Promise.all(checks);
}

const statusPatchSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
});

async function loadOwnedApplication(ctx: Ctx, id: string): Promise<Row> {
  const { data, error } = await ctx.db
    .from('applications')
    .select('id')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw notFound('Candidatura não encontrada.');
  return data as Row;
}

export const applicationRoutes: Route[] = [
  route('GET', 'applications', async (ctx) => {
    const { data, error } = await ctx.db
      .from('applications')
      .select(SELECT_WITH_RELATIONS)
      .eq('user_id', ctx.user.id)
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) throw mapDbError(error);
    return (data ?? []).map((row) => toListItem(row as Row));
  }),

  route('GET', 'applications/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const row = ensure(
      await ctx.db
        .from('applications')
        .select(SELECT_WITH_RELATIONS)
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .maybeSingle(),
    );
    return toListItem(row);
  }),

  route('POST', 'applications', async (ctx) => {
    const input = parseWith(applicationInputSchema, ctx.body);
    await assertReferences(ctx, {
      jobId: input.jobId,
      resumeId: input.resumeId ?? null,
      resumeVersionId: input.resumeVersionId ?? null,
    });

    const { data, error } = await ctx.db
      .from('applications')
      .insert({
        user_id: ctx.user.id,
        job_id: input.jobId,
        resume_id: input.resumeId ?? null,
        resume_version_id: input.resumeVersionId ?? null,
        score: input.score ?? null,
        status: input.status,
        applied_at: input.appliedAt ?? null,
        notes: input.notes,
      })
      .select(SELECT_WITH_RELATIONS)
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw badRequest('Já existe uma candidatura registrada para esta vaga.');
      }
      throw mapDbError(error);
    }
    return toListItem(data as Row);
  }),

  route('PATCH', 'applications/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const input = parseWith(applicationInputSchema, ctx.body);
    await assertReferences(ctx, {
      jobId: input.jobId,
      resumeId: input.resumeId ?? null,
      resumeVersionId: input.resumeVersionId ?? null,
    });

    const row = ensure(
      await ctx.db
        .from('applications')
        .update({
          job_id: input.jobId,
          resume_id: input.resumeId ?? null,
          resume_version_id: input.resumeVersionId ?? null,
          score: input.score ?? null,
          status: input.status,
          applied_at: input.appliedAt ?? null,
          notes: input.notes,
        })
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .select(SELECT_WITH_RELATIONS)
        .maybeSingle(),
    );
    return toListItem(row);
  }),

  /** Movimentação no Kanban: atualização leve de status. */
  route('PATCH', 'applications/:id/status', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { status } = parseWith(statusPatchSchema, ctx.body);
    const patch: Row = { status };
    if (status === 'enviada') patch.applied_at = new Date().toISOString().slice(0, 10);

    const row = ensure(
      await ctx.db
        .from('applications')
        .update(patch)
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .select(SELECT_WITH_RELATIONS)
        .maybeSingle(),
    );
    return toListItem(row);
  }),

  route('DELETE', 'applications/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db.from('applications').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),

  // --- Respostas ------------------------------------------------------------
  route('GET', 'applications/:id/answers', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    await loadOwnedApplication(ctx, id);
    const { data, error } = await ctx.db
      .from('application_answers')
      .select('*')
      .eq('application_id', id)
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw mapDbError(error);
    return (data ?? []).map((row) => toApplicationAnswer(row as Row));
  }),

  route('POST', 'applications/:id/answers', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    await loadOwnedApplication(ctx, id);
    const input = parseWith(
      applicationAnswerInputSchema.omit({ applicationId: true }).extend({
        provider: z.string().max(40).nullish(),
        model: z.string().max(120).nullish(),
      }),
      ctx.body,
    );

    const row = ensure(
      await ctx.db
        .from('application_answers')
        .insert({
          user_id: ctx.user.id,
          application_id: id,
          kind: input.kind,
          question: input.question,
          answer: input.answer,
          provider: input.provider ?? null,
          model: input.model ?? null,
        })
        .select('*')
        .single(),
    );
    return toApplicationAnswer(row);
  }),

  route('DELETE', 'application-answers/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db.from('application_answers').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),
];
