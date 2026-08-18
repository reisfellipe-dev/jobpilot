/** Configurações, consumo de IA e exclusão de dados (§12/§44/§46). */
import { z } from 'zod';
import { parseWith, route, type Route } from '../_lib/router.js';
import { mapDbError } from '../_lib/supabase.js';
import { toSettings } from '../_services/mappers.js';
import { getSettings } from '../_services/repository.js';
import { STORAGE_BUCKET } from '../../shared/constants.js';

type Row = Record<string, unknown>;

const settingsPatchSchema = z.object({
  aiProviderPreference: z.enum(['auto', 'groq', 'nvidia']),
  allowFallback: z.boolean(),
  tone: z.enum(['profissional', 'direto', 'entusiasmado', 'tecnico']),
  language: z.enum(['pt-BR', 'en-US']),
  aiConsent: z.boolean(),
  // Preferências de descoberta (fase 2)
  autoDiscovery: z.boolean().default(false),
  discoveryMinScore: z.number().int().min(0).max(100).default(55),
  discoveryMaxAgeDays: z.number().int().min(1).max(365).default(30),
  discoveryKeywords: z.array(z.string().trim().max(80)).max(20).default([]),
});

/** Tabelas de dados do usuário, na ordem segura de exclusão. */
const USER_TABLES = [
  'application_answers',
  'applications',
  'job_analyses',
  'resume_versions',
  'jobs',
  'resumes',
  'skills',
  'projects',
  'experiences',
] as const;

export const settingsRoutes: Route[] = [
  route('GET', 'settings', async (ctx) => getSettings(ctx.db, ctx.user.id)),

  route('PATCH', 'settings', async (ctx) => {
    const input = parseWith(settingsPatchSchema, ctx.body);
    await getSettings(ctx.db, ctx.user.id); // garante que a linha existe

    const { data, error } = await ctx.db
      .from('settings')
      .update({
        ai_provider_preference: input.aiProviderPreference,
        allow_fallback: input.allowFallback,
        tone: input.tone,
        language: input.language,
        ai_consent: input.aiConsent,
        auto_discovery: input.autoDiscovery,
        discovery_min_score: input.discoveryMinScore,
        discovery_max_age_days: input.discoveryMaxAgeDays,
        discovery_keywords: input.discoveryKeywords.filter(Boolean),
      })
      .eq('user_id', ctx.user.id)
      .select('*')
      .maybeSingle();
    if (error) throw mapDbError(error);
    return toSettings((data ?? null) as Row | null);
  }),

  /** Consumo de IA das últimas 24h - transparência sobre o que foi enviado. */
  route('GET', 'usage', async (ctx) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await ctx.db
      .from('ai_usage')
      .select('operation, provider, model, tokens_in, tokens_out, succeeded, created_at')
      .eq('user_id', ctx.user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw mapDbError(error);

    const rows = (data ?? []) as Row[];
    const byOperation = new Map<string, number>();
    let inputTokens = 0;
    let outputTokens = 0;
    for (const row of rows) {
      const operation = String(row.operation ?? '');
      byOperation.set(operation, (byOperation.get(operation) ?? 0) + 1);
      inputTokens += typeof row.tokens_in === 'number' ? row.tokens_in : 0;
      outputTokens += typeof row.tokens_out === 'number' ? row.tokens_out : 0;
    }

    return {
      windowHours: 24,
      total: rows.length,
      inputTokens,
      outputTokens,
      byOperation: Array.from(byOperation, ([operation, count]) => ({ operation, count })),
      recent: rows.slice(0, 25),
    };
  }),

  /**
   * Exclusão de todos os dados do usuário (§12).
   * A conta de login em si permanece: removê-la exige acesso administrativo ao
   * Supabase, que este projeto deliberadamente não possui em runtime.
   */
  route('POST', 'account/erase', async (ctx) => {
    const confirmation = parseWith(
      z.object({ confirm: z.literal('APAGAR', { errorMap: () => ({ message: 'Digite APAGAR para confirmar.' }) }) }),
      ctx.body,
    );
    void confirmation;

    // Arquivos primeiro: sem os registros não saberíamos os caminhos.
    const { data: resumeRows } = await ctx.db
      .from('resumes')
      .select('file_path')
      .eq('user_id', ctx.user.id)
      .not('file_path', 'eq', '');
    const paths = ((resumeRows ?? []) as Row[])
      .map((row) => String(row.file_path ?? ''))
      .filter((path) => path.startsWith(`${ctx.user.id}/`));
    if (paths.length > 0) {
      const { error } = await ctx.db.storage.from(STORAGE_BUCKET).remove(paths);
      if (error) console.warn('[account] falha ao remover arquivos:', error.message);
    }

    for (const table of USER_TABLES) {
      const { error } = await ctx.db.from(table).delete().eq('user_id', ctx.user.id);
      if (error) throw mapDbError(error);
    }

    const { error: profileError } = await ctx.db
      .from('profiles')
      .update({
        full_name: '',
        phone: '',
        location: '',
        headline: '',
        summary: '',
        education: [],
        certifications: [],
        languages: [],
        links: [],
        desired_roles: [],
        seniority: null,
        work_modes: [],
        desired_location: '',
      })
      .eq('id', ctx.user.id);
    if (profileError) throw mapDbError(profileError);

    return { erased: true };
  }),
];
