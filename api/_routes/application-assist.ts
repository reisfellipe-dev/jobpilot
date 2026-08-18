/** Rotas da candidatura assistida (§15–§20). Nenhuma envia candidatura (§17). */
import { z } from 'zod';
import { parseWith, route, type Route } from '../_lib/router.js';
import { mapDbError } from '../_lib/supabase.js';
import { uuidSchema } from '../../shared/schemas/common.js';
import { buildApplicationPlan, saveFieldAnswer } from '../_services/applications/service.js';

type Row = Record<string, unknown>;

const planSchema = z.object({
  jobId: uuidSchema,
  resumeId: uuidSchema.nullish(),
});

const answerSchema = z.object({
  questionKey: z.string().trim().min(1).max(300),
  questionLabel: z.string().trim().max(300).default(''),
  answer: z.string().max(5000),
});

export const applicationAssistRoutes: Route[] = [
  /**
   * Monta o plano de preenchimento: perguntas reais quando a plataforma as
   * publica, respostas do perfil e o que exige revisão do usuário.
   */
  route('POST', 'applications/plan', async (ctx) => {
    const input = parseWith(planSchema, ctx.body);
    return buildApplicationPlan({ db: ctx.db, userId: ctx.user.id }, input.jobId, input.resumeId ?? null);
  }),

  /** Respostas revisadas ficam salvas e são reaproveitadas nas próximas vagas. */
  route('POST', 'applications/field-answers', async (ctx) => {
    const input = parseWith(answerSchema, ctx.body);
    await saveFieldAnswer({ db: ctx.db, userId: ctx.user.id }, input);
    return { saved: true };
  }),

  route('GET', 'applications/field-answers', async (ctx) => {
    const { data, error } = await ctx.db
      .from('application_field_maps')
      .select('id, question_key, question_label, answer, state, updated_at')
      .eq('user_id', ctx.user.id)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw mapDbError(error);

    return ((data ?? []) as Row[]).map((row) => ({
      id: String(row.id ?? ''),
      questionKey: String(row.question_key ?? ''),
      questionLabel: String(row.question_label ?? ''),
      answer: String(row.answer ?? ''),
      state: String(row.state ?? 'KNOWN'),
      updatedAt: String(row.updated_at ?? ''),
    }));
  }),

  route('DELETE', 'applications/field-answers/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db
      .from('application_field_maps')
      .delete()
      .eq('id', id)
      .eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),
];
