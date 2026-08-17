/** Rotas de currículos e versões adaptadas (§16/§19/§24). */
import { z } from 'zod';
import { parseWith, route, type Ctx, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { badRequest, notFound } from '../_lib/errors';
import { uuidSchema } from '../../shared/schemas/common';
import { resumeContentSchema, resumeInputSchema } from '../../shared/schemas/resume';
import { STORAGE_BUCKET, UPLOAD_ALLOWED_MIME } from '../../shared/constants';
import { fromResume, toResume, toResumeVersion } from '../_services/mappers';
import { getResume, listResumes } from '../_services/repository';

type Row = Record<string, unknown>;

function ensure(result: { data: unknown; error: unknown }): Row {
  if (result.error) throw mapDbError(result.error as { code?: string; message: string });
  const row = result.data as Row | null;
  if (!row) throw notFound('Currículo não encontrado.');
  return row;
}

/** Garante que o caminho do arquivo pertence ao usuário (§37). */
function assertOwnedPath(filePath: string, userId: string): void {
  if (!filePath) return;
  if (!filePath.startsWith(`${userId}/`) || filePath.includes('..')) {
    throw badRequest('Caminho de arquivo inválido.');
  }
}

async function clearOtherDefaults(ctx: Ctx, exceptId: string | null): Promise<void> {
  let query = ctx.db.from('resumes').update({ is_default: false }).eq('user_id', ctx.user.id).eq('is_default', true);
  if (exceptId) query = query.neq('id', exceptId);
  const { error } = await query;
  if (error) throw mapDbError(error);
}

const versionInputSchema = z.object({
  jobId: uuidSchema.nullish(),
  label: z.string().trim().max(160).default(''),
  content: resumeContentSchema,
  changes: z
    .array(
      z.object({
        section: z.string().max(120),
        before: z.string().max(2000).default(''),
        after: z.string().max(2000).default(''),
        reason: z.string().max(500).default(''),
      }),
    )
    .max(30)
    .default([]),
  keywordsAdded: z.array(z.string().max(60)).max(40).default([]),
  provider: z.string().max(40).nullish(),
  model: z.string().max(120).nullish(),
});

export const resumeRoutes: Route[] = [
  route('GET', 'resumes', async (ctx) => listResumes(ctx.db, ctx.user.id)),

  route('GET', 'resumes/:id', async (ctx) => getResume(ctx.db, ctx.user.id, parseWith(uuidSchema, ctx.params.id))),

  route('POST', 'resumes', async (ctx) => {
    const input = parseWith(resumeInputSchema, ctx.body);
    assertOwnedPath(input.filePath, ctx.user.id);
    if (input.fileMime && !(UPLOAD_ALLOWED_MIME as readonly string[]).includes(input.fileMime)) {
      throw badRequest('Tipo de arquivo não permitido.');
    }
    if (input.isDefault) await clearOtherDefaults(ctx, null);

    const row = ensure(
      await ctx.db
        .from('resumes')
        .insert({ ...fromResume(input), user_id: ctx.user.id })
        .select('*')
        .single(),
    );
    return toResume(row);
  }),

  route('PATCH', 'resumes/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const input = parseWith(resumeInputSchema, ctx.body);
    assertOwnedPath(input.filePath, ctx.user.id);
    if (input.isDefault) await clearOtherDefaults(ctx, id);

    const row = ensure(
      await ctx.db
        .from('resumes')
        .update(fromResume(input))
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .select('*')
        .maybeSingle(),
    );
    return toResume(row);
  }),

  route('DELETE', 'resumes/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const resume = await getResume(ctx.db, ctx.user.id, id);

    if (resume.filePath) {
      assertOwnedPath(resume.filePath, ctx.user.id);
      const { error } = await ctx.db.storage.from(STORAGE_BUCKET).remove([resume.filePath]);
      // Arquivo órfão não deve impedir a exclusão do registro.
      if (error) console.warn('[resumes] falha ao remover arquivo do storage:', error.message);
    }

    const { error } = await ctx.db.from('resumes').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),

  route('POST', 'resumes/:id/duplicate', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const original = await getResume(ctx.db, ctx.user.id, id);
    const copy = {
      ...fromResume({ ...original, name: `${original.name} (cópia)`.slice(0, 120), isDefault: false }),
      user_id: ctx.user.id,
      // O arquivo original não é duplicado: a cópia referencia apenas os dados.
      file_path: '',
      file_name: '',
      file_mime: '',
    };
    return toResume(ensure(await ctx.db.from('resumes').insert(copy).select('*').single()));
  }),

  // --- Versões adaptadas ----------------------------------------------------
  route('GET', 'resumes/:id/versions', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    await getResume(ctx.db, ctx.user.id, id); // valida ownership do currículo
    const { data, error } = await ctx.db
      .from('resume_versions')
      .select('*')
      .eq('resume_id', id)
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw mapDbError(error);
    return (data ?? []).map((row) => toResumeVersion(row as Row));
  }),

  route('POST', 'resumes/:id/versions', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    await getResume(ctx.db, ctx.user.id, id);
    const input = parseWith(versionInputSchema, ctx.body);

    if (input.jobId) {
      const { data, error } = await ctx.db
        .from('jobs')
        .select('id')
        .eq('id', input.jobId)
        .eq('user_id', ctx.user.id)
        .maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw notFound('Vaga não encontrada.');
    }

    const row = ensure(
      await ctx.db
        .from('resume_versions')
        .insert({
          user_id: ctx.user.id,
          resume_id: id,
          job_id: input.jobId ?? null,
          label: input.label,
          content: input.content,
          changes: input.changes,
          keywords_added: input.keywordsAdded,
          provider: input.provider ?? null,
          model: input.model ?? null,
        })
        .select('*')
        .single(),
    );
    return toResumeVersion(row);
  }),

  route('DELETE', 'resume-versions/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db.from('resume_versions').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),
];
