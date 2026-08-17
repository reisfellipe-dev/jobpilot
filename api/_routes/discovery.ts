/** Rotas do Discovery Engine (§6, §11, §12, §26, §37). */
import { z } from 'zod';
import { parseWith, route, type Ctx, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { ApiError, badRequest, notFound } from '../_lib/errors';
import { uuidSchema } from '../../shared/schemas/common';
import {
  detectSourceSchema,
  discoveryFiltersSchema,
  jobDecisionSchema,
  jobSourceInputSchema,
  runDiscoverySchema,
  type DiscoveredJob,
  type DiscoveredJobMatch,
  type SourceHealth,
} from '../../shared/discovery/schemas';
import {
  SOURCE_ATTRIBUTION,
  SOURCE_LABEL,
  SOURCE_REQUIRES_IDENTIFIER,
  UNSUPPORTED_SOURCE_INFO,
  type FieldOrigins,
  type SourceKind,
} from '../../shared/discovery/types';
import { recencyInfo, relevanceScore } from '../../shared/discovery/ranking';
import { detectSource, unknownHostMessage } from '../_services/discovery/connectors/detect';
import { getConnector, listConnectors } from '../_services/discovery/connectors/registry';
import { describeHttpError } from '../_services/discovery/http';
import { buildStrategyForUser, ensureDefaultSources, runDiscovery } from '../_services/discovery/service';
import { getSettings } from '../_services/repository';
import { consumeAIQuota } from '../_services/ratelimit';

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function toDiscoveredJob(row: Row, matches: DiscoveredJobMatch[], links: Row[]): DiscoveredJob {
  const publishedAt = str(row.published_at) || null;
  const matchScore = typeof row.best_match_score === 'number' ? row.best_match_score : null;

  return {
    id: str(row.id),
    title: str(row.title),
    company: str(row.company),
    companyUrl: str(row.company_url),
    location: str(row.location) || null,
    isRemote: typeof row.is_remote === 'boolean' ? row.is_remote : null,
    isHybrid: typeof row.is_hybrid === 'boolean' ? row.is_hybrid : null,
    employmentType: str(row.employment_type) || null,
    seniority: str(row.seniority) || null,
    technologies: strArray(row.technologies),
    requirements: strArray(row.requirements),
    description: str(row.description),

    salary: str(row.salary) || str(row.salary_range) || null,
    salaryMin: typeof row.salary_min === 'number' ? row.salary_min : null,
    salaryMax: typeof row.salary_max === 'number' ? row.salary_max : null,
    salaryCurrency: str(row.salary_currency) || null,

    source: str(row.source) as SourceKind,
    sourceUrl: str(row.source_url) || str(row.url),
    applicationUrl: str(row.application_url) || str(row.url),
    applicationMethod: (str(row.application_method) || 'unknown') as DiscoveredJob['applicationMethod'],
    sources: links.map((link) => ({
      source: str(link.source) as SourceKind,
      sourceJobId: str(link.source_job_id),
      sourceUrl: str(link.source_url),
      applicationUrl: str(link.application_url),
      discoveredAt: str(link.discovered_at),
    })),
    sourceCount: typeof row.source_count === 'number' ? row.source_count : links.length || 1,

    publishedAt,
    discoveredAt: str(row.discovered_at) || null,
    fieldOrigins: (row.field_origins ?? {}) as FieldOrigins,

    matchScore,
    relevanceScore: typeof row.relevance_score === 'number' ? row.relevance_score : null,
    recommendedResumeId: str(row.recommended_resume_id) || null,
    matches,

    status: str(row.status),
    savedAt: str(row.saved_at) || null,
  };
}

/** Carrega matches e origens de várias vagas em duas consultas (evita N+1). */
async function loadJobRelations(ctx: Ctx, jobIds: string[]) {
  if (jobIds.length === 0) return { matches: new Map<string, DiscoveredJobMatch[]>(), links: new Map<string, Row[]>() };

  const [matchResult, linkResult, resumeResult] = await Promise.all([
    ctx.db
      .from('job_matches')
      .select('job_id, resume_id, score, matched_skills, missing_skills, is_recommended')
      .eq('user_id', ctx.user.id)
      .in('job_id', jobIds)
      .order('score', { ascending: false }),
    ctx.db
      .from('job_source_links')
      .select('job_id, source, source_job_id, source_url, application_url, discovered_at')
      .eq('user_id', ctx.user.id)
      .in('job_id', jobIds),
    ctx.db.from('resumes').select('id, name').eq('user_id', ctx.user.id),
  ]);

  if (matchResult.error) throw mapDbError(matchResult.error);
  if (linkResult.error) throw mapDbError(linkResult.error);

  const resumeNames = new Map(
    ((resumeResult.data ?? []) as Row[]).map((row) => [str(row.id), str(row.name)]),
  );

  const matches = new Map<string, DiscoveredJobMatch[]>();
  for (const row of (matchResult.data ?? []) as Row[]) {
    const jobId = str(row.job_id);
    const list = matches.get(jobId) ?? [];
    list.push({
      resumeId: str(row.resume_id),
      resumeName: resumeNames.get(str(row.resume_id)) ?? 'Currículo removido',
      score: typeof row.score === 'number' ? row.score : 0,
      matchedSkills: strArray(row.matched_skills),
      missingSkills: strArray(row.missing_skills),
      isRecommended: row.is_recommended === true,
    });
    matches.set(jobId, list);
  }

  const links = new Map<string, Row[]>();
  for (const row of (linkResult.data ?? []) as Row[]) {
    const jobId = str(row.job_id);
    const list = links.get(jobId) ?? [];
    list.push(row);
    links.set(jobId, list);
  }

  return { matches, links };
}

function toSourceHealth(row: Row): SourceHealth {
  const kind = str(row.kind) as SourceKind;
  return {
    id: str(row.id),
    kind,
    label: str(row.label) || SOURCE_LABEL[kind] || kind,
    identifier: str(row.identifier),
    sourceUrl: str(row.source_url),
    enabled: row.enabled !== false,
    lastSyncAt: str(row.last_sync_at) || null,
    lastStatus: str(row.last_status) || 'nunca',
    lastError: str(row.last_error),
    lastDurationMs: typeof row.last_duration_ms === 'number' ? row.last_duration_ms : 0,
    consecutiveFailures: typeof row.consecutive_failures === 'number' ? row.consecutive_failures : 0,
    totalJobsFound: typeof row.total_jobs_found === 'number' ? row.total_jobs_found : 0,
  };
}

export const discoveryRoutes: Route[] = [
  // ---------------------------------------------------------------------------
  // Listagem com filtros aplicados no servidor (§11)
  // ---------------------------------------------------------------------------
  route('GET', 'discovery/jobs', async (ctx) => {
    const filters = parseWith(discoveryFiltersSchema, ctx.query);

    let query = ctx.db
      .from('jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', ctx.user.id)
      .eq('origin', 'discovery')
      .is('saved_at', null)
      .neq('status', 'descartada');

    if (filters.search) {
      const term = filters.search.replace(/[%,()]/g, ' ').trim();
      if (term) query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
    }
    if (filters.seniority) query = query.eq('seniority', filters.seniority);
    if (filters.workMode === 'remoto') query = query.eq('is_remote', true);
    if (filters.workMode === 'hibrido') query = query.eq('is_hybrid', true);
    if (filters.workMode === 'presencial') query = query.eq('is_remote', false).eq('is_hybrid', false);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.company) query = query.ilike('company', `%${filters.company}%`);
    if (filters.technology) query = query.contains('technologies', [filters.technology]);
    if (typeof filters.minScore === 'number') query = query.gte('best_match_score', filters.minScore);
    if (filters.hasSalary) query = query.neq('salary', '');
    if (typeof filters.maxAgeDays === 'number') {
      const cutoff = new Date(Date.now() - filters.maxAgeDays * 86_400_000).toISOString();
      query = query.gte('published_at', cutoff);
    }

    if (filters.sort === 'match') query = query.order('best_match_score', { ascending: false, nullsFirst: false });
    else if (filters.sort === 'recente') query = query.order('published_at', { ascending: false, nullsFirst: false });
    else if (filters.sort === 'empresa') query = query.order('company', { ascending: true });
    else query = query.order('relevance_score', { ascending: false, nullsFirst: false });

    const { data, error, count } = await query.range(filters.offset, filters.offset + filters.limit - 1);
    if (error) throw mapDbError(error);

    const rows = (data ?? []) as Row[];
    const { matches, links } = await loadJobRelations(ctx, rows.map((row) => str(row.id)));

    const jobs = rows.map((row) => {
      const job = toDiscoveredJob(row, matches.get(str(row.id)) ?? [], links.get(str(row.id)) ?? []);
      // Recalcula a relevância na leitura: a recência muda com o tempo (§8).
      if (job.matchScore !== null) {
        job.relevanceScore = relevanceScore({ matchScore: job.matchScore, publishedAt: job.publishedAt }).score;
      }
      return job;
    });

    return {
      jobs,
      total: count ?? jobs.length,
      attribution: Object.entries(SOURCE_ATTRIBUTION)
        .filter(([kind]) => jobs.some((job) => job.source === kind))
        .map(([, info]) => info),
    };
  }),

  /** Contadores do cabeçalho da tela Descobrir. */
  route('GET', 'discovery/summary', async (ctx) => {
    const [totalResult, highResult, savedResult, sourceResult, syncResult] = await Promise.all([
      ctx.db
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.user.id)
        .eq('origin', 'discovery')
        .is('saved_at', null)
        .neq('status', 'descartada'),
      ctx.db
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.user.id)
        .eq('origin', 'discovery')
        .is('saved_at', null)
        .neq('status', 'descartada')
        .gte('best_match_score', 85),
      ctx.db
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.user.id)
        .eq('origin', 'discovery')
        .not('saved_at', 'is', null),
      ctx.db.from('job_sources').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id).eq('enabled', true),
      ctx.db
        .from('source_syncs')
        .select('created_at')
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    return {
      available: totalResult.count ?? 0,
      highMatches: highResult.count ?? 0,
      saved: savedResult.count ?? 0,
      activeSources: sourceResult.count ?? 0,
      lastSyncAt: str(((syncResult.data ?? [])[0] as Row | undefined)?.created_at) || null,
    };
  }),

  // ---------------------------------------------------------------------------
  // Execução da descoberta (§6)
  // ---------------------------------------------------------------------------
  route('POST', 'discovery/run', async (ctx) => {
    const input = parseWith(runDiscoverySchema, ctx.body ?? {});
    // Descoberta consome APIs externas: limitada como as demais operações caras.
    await consumeAIQuota(ctx.db, 'discovery.run');

    return runDiscovery(
      { db: ctx.db, userId: ctx.user.id },
      { sourceIds: input.sourceIds, full: input.full, trigger: 'manual' },
    );
  }),

  /** Explica a estratégia de busca antes de executá-la (§10, §25). */
  route('GET', 'discovery/strategy', async (ctx) => {
    const settings = await getSettings(ctx.db, ctx.user.id);
    const strategy = await buildStrategyForUser({ db: ctx.db, userId: ctx.user.id }, settings);
    return strategy;
  }),

  // ---------------------------------------------------------------------------
  // Decisão sobre a vaga descoberta
  // ---------------------------------------------------------------------------
  route('PATCH', 'discovery/jobs/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { action } = parseWith(jobDecisionSchema, ctx.body);

    const patch: Row =
      action === 'salvar'
        ? { saved_at: new Date().toISOString(), status: 'analisada' }
        : action === 'descartar'
          ? { status: 'descartada' }
          : { status: 'nova', saved_at: null };

    const { data, error } = await ctx.db
      .from('jobs')
      .update(patch)
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .eq('origin', 'discovery')
      .select('id, status, saved_at')
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw notFound('Vaga descoberta não encontrada.');

    return { id, action, status: str((data as Row).status), savedAt: str((data as Row).saved_at) || null };
  }),

  // ---------------------------------------------------------------------------
  // Fontes (§26)
  // ---------------------------------------------------------------------------
  route('GET', 'discovery/sources', async (ctx) => {
    await ensureDefaultSources({ db: ctx.db, userId: ctx.user.id });

    const { data, error } = await ctx.db
      .from('job_sources')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('kind', { ascending: true });
    if (error) throw mapDbError(error);

    return {
      sources: ((data ?? []) as Row[]).map(toSourceHealth),
      available: listConnectors().map((connector) => ({
        kind: connector.kind,
        label: connector.label,
        requiresIdentifier: connector.requiresIdentifier,
        documentationUrl: connector.documentationUrl,
        attribution: SOURCE_ATTRIBUTION[connector.kind] ?? null,
      })),
      // Transparência sobre o que NÃO é suportado, e por quê (§42).
      unsupported: UNSUPPORTED_SOURCE_INFO,
    };
  }),

  /** Detecta o ATS pela URL de carreiras e valida antes de cadastrar. */
  route('POST', 'discovery/sources/detect', async (ctx) => {
    const { url } = parseWith(detectSourceSchema, ctx.body);
    const detection = detectSource(url);

    if (detection.status === 'unsupported') {
      return { status: 'unsupported', info: detection.info };
    }
    if (detection.status === 'unknown') {
      return { status: 'unknown', message: unknownHostMessage(detection.host) };
    }

    // Valida de fato: nada de cadastrar fonte que não responde (§42).
    const connector = getConnector(detection.kind);
    try {
      const probe = await connector.fetchJobs({
        identifier: detection.identifier,
        searchTerms: [],
        since: null,
        limit: 5,
      });
      return {
        status: 'supported',
        kind: detection.kind,
        identifier: detection.identifier,
        label: detection.label,
        sourceUrl: detection.sourceUrl,
        jobsPreview: probe.jobs.slice(0, 5).map((job) => ({ title: job.title, company: job.company })),
        jobsFound: probe.jobs.length,
      };
    } catch (error) {
      throw new ApiError(
        'bad_request',
        `Encontrei ${SOURCE_LABEL[detection.kind]} nessa URL, mas a consulta falhou: ${describeHttpError(error)}. Confira se o endereço do quadro de vagas está correto.`,
      );
    }
  }),

  route('POST', 'discovery/sources', async (ctx) => {
    const input = parseWith(jobSourceInputSchema, ctx.body);
    if (SOURCE_REQUIRES_IDENTIFIER[input.kind] && !input.identifier.trim()) {
      throw badRequest(`${SOURCE_LABEL[input.kind]} exige o identificador da empresa.`);
    }

    const { data, error } = await ctx.db
      .from('job_sources')
      .insert({
        user_id: ctx.user.id,
        kind: input.kind,
        identifier: input.identifier.trim(),
        label: input.label.trim() || SOURCE_LABEL[input.kind],
        source_url: input.sourceUrl.trim(),
        enabled: input.enabled,
      })
      .select('*')
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') throw badRequest('Esta fonte já está cadastrada.');
      throw mapDbError(error);
    }
    return toSourceHealth(data as Row);
  }),

  route('PATCH', 'discovery/sources/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const input = parseWith(z.object({ enabled: z.boolean() }), ctx.body);

    const { data, error } = await ctx.db
      .from('job_sources')
      .update({ enabled: input.enabled })
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .select('*')
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw notFound('Fonte não encontrada.');
    return toSourceHealth(data as Row);
  }),

  route('DELETE', 'discovery/sources/:id', async (ctx) => {
    const id = parseWith(uuidSchema, ctx.params.id);
    const { error } = await ctx.db.from('job_sources').delete().eq('id', id).eq('user_id', ctx.user.id);
    if (error) throw mapDbError(error);
    return null;
  }),

  /** Histórico de sincronizações (§7, §26). */
  route('GET', 'discovery/syncs', async (ctx) => {
    const { data, error } = await ctx.db
      .from('source_syncs')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw mapDbError(error);

    return ((data ?? []) as Row[]).map((row) => ({
      id: str(row.id),
      sourceKind: str(row.source_kind),
      sourceLabel: str(row.source_label),
      status: str(row.status),
      jobsFound: typeof row.jobs_found === 'number' ? row.jobs_found : 0,
      jobsNew: typeof row.jobs_new === 'number' ? row.jobs_new : 0,
      jobsUpdated: typeof row.jobs_updated === 'number' ? row.jobs_updated : 0,
      jobsFiltered: typeof row.jobs_filtered === 'number' ? row.jobs_filtered : 0,
      durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : 0,
      error: str(row.error),
      triggerKind: str(row.trigger_kind),
      createdAt: str(row.created_at),
    }));
  }),

  // ---------------------------------------------------------------------------
  // Notificações internas (§23)
  // ---------------------------------------------------------------------------
  route('GET', 'notifications', async (ctx) => {
    const { data, error } = await ctx.db
      .from('notifications')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw mapDbError(error);

    return ((data ?? []) as Row[]).map((row) => ({
      id: str(row.id),
      kind: str(row.kind),
      title: str(row.title),
      body: str(row.body),
      readAt: str(row.read_at) || null,
      createdAt: str(row.created_at),
      age: recencyInfo(str(row.created_at)).label,
    }));
  }),

  route('POST', 'notifications/read', async (ctx) => {
    const { error } = await ctx.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id)
      .is('read_at', null);
    if (error) throw mapDbError(error);
    return { ok: true };
  }),
];
