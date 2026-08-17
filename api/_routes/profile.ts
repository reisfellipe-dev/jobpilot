/** Rotas do perfil profissional, experiências, projetos e skills (§13/§14/§15). */
import { parseWith, route, type Ctx, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { notFound } from '../_lib/errors';
import {
  experienceInputSchema,
  profileInputSchema,
  projectInputSchema,
  skillInputSchema,
} from '../../shared/schemas/profile';
import { uuidSchema } from '../../shared/schemas/common';
import {
  fromExperience,
  fromProfile,
  fromProject,
  fromSkill,
  toExperience,
  toProfile,
  toProject,
  toSkill,
} from '../_services/mappers';
import { getProfileBundle } from '../_services/repository';

type Row = Record<string, unknown>;

function ensure(result: { data: unknown; error: unknown }): Row {
  if (result.error) throw mapDbError(result.error as { code?: string; message: string });
  const row = result.data as Row | null;
  if (!row) throw notFound();
  return row;
}

function id(ctx: Ctx): string {
  return parseWith(uuidSchema, ctx.params.id);
}

async function updateOwned(ctx: Ctx, table: string, payload: Row): Promise<Row> {
  return ensure(
    await ctx.db
      .from(table)
      .update(payload)
      .eq('id', id(ctx))
      .eq('user_id', ctx.user.id) // ownership explícita além da RLS
      .select('*')
      .maybeSingle(),
  );
}

async function deleteOwned(ctx: Ctx, table: string): Promise<null> {
  const { error } = await ctx.db.from(table).delete().eq('id', id(ctx)).eq('user_id', ctx.user.id);
  if (error) throw mapDbError(error);
  return null;
}

export const profileRoutes: Route[] = [
  route('GET', 'profile', async (ctx) => getProfileBundle(ctx.db, ctx.user.id)),

  route('PATCH', 'profile', async (ctx) => {
    const input = parseWith(profileInputSchema, ctx.body);
    const row = ensure(
      await ctx.db
        .from('profiles')
        .update(fromProfile({ ...input, seniority: input.seniority ?? null }))
        .eq('id', ctx.user.id)
        .select('*')
        .maybeSingle(),
    );
    return toProfile(row);
  }),

  // --- Experiências ---------------------------------------------------------
  route('POST', 'experiences', async (ctx) => {
    const input = parseWith(experienceInputSchema, ctx.body);
    const row = ensure(
      await ctx.db
        .from('experiences')
        .insert({ ...fromExperience(input), user_id: ctx.user.id })
        .select('*')
        .single(),
    );
    return toExperience(row);
  }),
  route('PATCH', 'experiences/:id', async (ctx) => {
    const input = parseWith(experienceInputSchema, ctx.body);
    return toExperience(await updateOwned(ctx, 'experiences', fromExperience(input)));
  }),
  route('DELETE', 'experiences/:id', (ctx) => deleteOwned(ctx, 'experiences')),

  // --- Projetos -------------------------------------------------------------
  route('POST', 'projects', async (ctx) => {
    const input = parseWith(projectInputSchema, ctx.body);
    const row = ensure(
      await ctx.db
        .from('projects')
        .insert({ ...fromProject(input), user_id: ctx.user.id })
        .select('*')
        .single(),
    );
    return toProject(row);
  }),
  route('PATCH', 'projects/:id', async (ctx) => {
    const input = parseWith(projectInputSchema, ctx.body);
    return toProject(await updateOwned(ctx, 'projects', fromProject(input)));
  }),
  route('DELETE', 'projects/:id', (ctx) => deleteOwned(ctx, 'projects')),

  // --- Skills ---------------------------------------------------------------
  route('POST', 'skills', async (ctx) => {
    const input = parseWith(skillInputSchema, ctx.body);
    const row = ensure(
      await ctx.db
        .from('skills')
        .insert({ ...fromSkill(input), user_id: ctx.user.id })
        .select('*')
        .single(),
    );
    return toSkill(row);
  }),
  route('PATCH', 'skills/:id', async (ctx) => {
    const input = parseWith(skillInputSchema, ctx.body);
    return toSkill(await updateOwned(ctx, 'skills', fromSkill(input)));
  }),
  route('DELETE', 'skills/:id', (ctx) => deleteOwned(ctx, 'skills')),
];
