/**
 * DiscoveryService (§5).
 *
 * Pipeline:
 *   Connector → Raw Job → Normalizer → Pre-filtro → Deduplicador
 *            → Repositório → Matching determinístico → Ranking
 *
 * Três compromissos de projeto:
 *  1. NENHUMA chamada de IA acontece aqui (§29). Descobrir e ranquear centenas
 *     de vagas por sincronização com IA seria caro e lento; tudo é determinístico
 *     e explicável. A IA entra sob demanda, quando o usuário abre uma vaga.
 *  2. Falha de uma fonte não derruba a execução (§35).
 *  3. Nada é inventado: campo ausente na fonte permanece ausente (§3).
 */
import type { Db } from '../../_lib/supabase.js';
import { mapDbError } from '../../_lib/supabase.js';
import { ApiError } from '../../_lib/errors.js';
import type { Resume } from '../../../shared/schemas/resume.js';
import { rankResumes } from '../../../shared/matching/score.js';
import { normalizeCompanyName } from '../../../shared/discovery/fingerprint.js';
import { groupDuplicates, isLikelyDuplicate } from '../../../shared/discovery/fingerprint.js';
import { normalizeRawJob } from '../../../shared/discovery/normalize.js';
import { buildSearchStrategy, preFilter, type SearchStrategy } from '../../../shared/discovery/query-strategy.js';
import { relevanceScore } from '../../../shared/discovery/ranking.js';
import type { NormalizedJob, SourceKind } from '../../../shared/discovery/types.js';
import { SENIORITY_LEVELS, WORK_MODES, type Seniority, type WorkMode } from '../../../shared/constants.js';
import type { DiscoveryRunResult, SyncResultItem } from '../../../shared/discovery/schemas.js';
import { getConnector, DEFAULT_AGGREGATORS } from './connectors/registry.js';
import { describeHttpError, mapWithConcurrency } from './http.js';
import { getProfileBundle, getSettings, listResumes } from '../repository.js';
import type { UserSettings } from '../mappers.js';

type Row = Record<string, unknown>;

/** Converte texto livre em senioridade do domínio; devolve null se não for uma delas. */
function asSeniority(value: string | null | undefined): Seniority | null {
  return value && (SENIORITY_LEVELS as readonly string[]).includes(value) ? (value as Seniority) : null;
}

function asWorkModes(values: string[]): WorkMode[] {
  return values.filter((value): value is WorkMode => (WORK_MODES as readonly string[]).includes(value));
}

interface ProfileMatchContext {
  seniority: Seniority | null;
  workModes: WorkMode[];
  location: string;
}

/** Teto por fonte e por execução — protege o banco e o tempo da função. */
const LIMIT_PER_SOURCE = 120;
const MAX_NEW_JOBS_PER_RUN = 300;
const SOURCE_CONCURRENCY = 3;

export interface DiscoveryContext {
  db: Db;
  userId: string;
}

interface SourceRow {
  id: string;
  kind: SourceKind;
  identifier: string;
  label: string;
  enabled: boolean;
  lastSyncAt: string | null;
  consecutiveFailures: number;
}

// -----------------------------------------------------------------------------
// Fontes
// -----------------------------------------------------------------------------

/** Na primeira execução, habilita os quadros abertos que não exigem configuração. */
export async function ensureDefaultSources(ctx: DiscoveryContext): Promise<void> {
  const { data, error } = await ctx.db.from('job_sources').select('id').eq('user_id', ctx.userId).limit(1);
  if (error) throw mapDbError(error);
  if ((data ?? []).length > 0) return;

  const rows = DEFAULT_AGGREGATORS.map((kind) => ({
    user_id: ctx.userId,
    kind,
    identifier: '',
    label: getConnector(kind).label,
    source_url: '',
    enabled: true,
  }));

  const { error: insertError } = await ctx.db.from('job_sources').insert(rows);
  if (insertError && (insertError as { code?: string }).code !== '23505') throw mapDbError(insertError);
}

async function loadSources(ctx: DiscoveryContext, sourceIds: string[]): Promise<SourceRow[]> {
  let query = ctx.db
    .from('job_sources')
    .select('id, kind, identifier, label, enabled, last_sync_at, consecutive_failures')
    .eq('user_id', ctx.userId)
    .eq('enabled', true);

  if (sourceIds.length > 0) query = query.in('id', sourceIds);

  const { data, error } = await query;
  if (error) throw mapDbError(error);

  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as SourceKind,
    identifier: String(row.identifier ?? ''),
    label: String(row.label ?? ''),
    enabled: row.enabled !== false,
    lastSyncAt: typeof row.last_sync_at === 'string' ? row.last_sync_at : null,
    consecutiveFailures: typeof row.consecutive_failures === 'number' ? row.consecutive_failures : 0,
  }));
}

// -----------------------------------------------------------------------------
// Estratégia de busca
// -----------------------------------------------------------------------------
export async function buildStrategyForUser(ctx: DiscoveryContext, settings: UserSettings): Promise<SearchStrategy> {
  const [bundle, resumes] = await Promise.all([
    getProfileBundle(ctx.db, ctx.userId),
    listResumes(ctx.db, ctx.userId),
  ]);

  // Skills do perfil primeiro; as dos currículos complementam.
  const skills = [
    ...bundle.skills.map((skill) => skill.name),
    ...resumes.flatMap((resume) => resume.skills),
    ...bundle.experiences.flatMap((experience) => experience.technologies),
  ];

  const roles = [...bundle.profile.desiredRoles, ...resumes.flatMap((resume) => resume.targetRoles)];

  return buildSearchStrategy({
    desiredRoles: roles,
    seniority: bundle.profile.seniority ?? null,
    skills,
    workModes: bundle.profile.workModes,
    location: bundle.profile.location,
    desiredLocation: bundle.profile.desiredLocation,
    overrideKeywords: settings.discoveryKeywords,
  });
}

// -----------------------------------------------------------------------------
// Persistência
// -----------------------------------------------------------------------------
interface ExistingJob {
  id: string;
  fingerprint: string;
  title: string;
  company: string;
  location: string | null;
  sourceUrl: string;
}

async function loadExistingJobs(ctx: DiscoveryContext): Promise<ExistingJob[]> {
  const { data, error } = await ctx.db
    .from('jobs')
    .select('id, fingerprint, title, company, location, source_url')
    .eq('user_id', ctx.userId)
    .limit(5000);
  if (error) throw mapDbError(error);

  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    fingerprint: String(row.fingerprint ?? ''),
    title: String(row.title ?? ''),
    company: String(row.company ?? ''),
    location: (row.location as string) || null,
    sourceUrl: String(row.source_url ?? ''),
  }));
}

/** Cria (ou reutiliza) a empresa. Só grava o que veio da fonte (§14). */
async function resolveCompany(ctx: DiscoveryContext, name: string, website: string): Promise<string | null> {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;

  const { data, error } = await ctx.db
    .from('companies')
    .upsert(
      {
        user_id: ctx.userId,
        name: name.slice(0, 200),
        normalized_name: normalized.slice(0, 200),
        website: website.slice(0, 500),
      },
      { onConflict: 'user_id,normalized_name', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) {
    console.warn('[discovery] empresa não pôde ser registrada:', error.message);
    return null;
  }
  return data ? String((data as Row).id) : null;
}

function toJobRow(ctx: DiscoveryContext, job: NormalizedJob, companyId: string | null): Row {
  return {
    user_id: ctx.userId,
    origin: 'discovery',
    title: job.title.slice(0, 180) || 'Vaga sem título',
    company: job.company.slice(0, 160),
    company_id: companyId,
    company_url: job.companyUrl,
    description: job.description.slice(0, 40_000),
    url: job.sourceUrl,
    location: job.location ?? '',
    work_mode: job.isRemote ? 'remoto' : job.isHybrid ? 'hibrido' : job.isRemote === false ? 'presencial' : null,
    seniority: job.seniority,
    requirements: job.requirements,
    nice_to_have: job.niceToHave,
    technologies: job.technologies,
    benefits: [],
    salary_range: job.salary ?? '',
    salary: job.salary ?? '',
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    status: 'nova',
    source: job.source,
    source_job_id: job.sourceJobId,
    source_url: job.sourceUrl,
    is_remote: job.isRemote,
    is_hybrid: job.isHybrid,
    employment_type: job.employmentType,
    published_at: job.publishedAt,
    discovered_at: new Date().toISOString(),
    application_url: job.applicationUrl,
    application_method: job.applicationMethod,
    field_origins: job.fieldOrigins,
    fingerprint: job.fingerprint,
    // Payload original truncado: auditoria sem inchar o banco (§4).
    raw_source_data: truncateRaw(job.raw),
  };
}

function truncateRaw(raw: unknown): unknown {
  try {
    const text = JSON.stringify(raw);
    if (text.length <= 20_000) return raw;
    return { truncated: true, preview: text.slice(0, 20_000) };
  } catch {
    return { truncated: true, preview: null };
  }
}

// -----------------------------------------------------------------------------
// Matching determinístico
// -----------------------------------------------------------------------------
interface MatchOutcome {
  bestScore: number;
  recommendedResumeId: string | null;
  rows: Row[];
}

function computeMatches(
  ctx: DiscoveryContext,
  jobId: string,
  job: NormalizedJob,
  resumes: Resume[],
  profileContext: ProfileMatchContext,
): MatchOutcome {
  if (resumes.length === 0) return { bestScore: 0, recommendedResumeId: null, rows: [] };

  const matches = rankResumes(
    {
      title: job.title,
      seniority: asSeniority(job.seniority),
      workMode: job.isRemote ? 'remoto' : job.isHybrid ? 'hibrido' : job.isRemote === false ? 'presencial' : null,
      location: job.location ?? '',
      requirements: job.requirements,
      niceToHave: job.niceToHave,
      technologies: job.technologies,
      description: job.description,
    },
    null,
    resumes.map((resume) => ({
      id: resume.id,
      name: resume.name,
      objective: resume.objective,
      seniority: resume.seniority ?? null,
      skills: resume.skills,
      targetRoles: resume.targetRoles,
      content: resume.content,
    })),
    {
      profileSeniority: profileContext.seniority,
      profileWorkModes: profileContext.workModes,
      profileLocation: profileContext.location,
    },
  );

  const best = matches[0];
  const rows = matches.slice(0, 8).map((match) => ({
    user_id: ctx.userId,
    job_id: jobId,
    resume_id: match.resumeId,
    score: match.score,
    breakdown: match.breakdown,
    matched_skills: match.matchedSkills.slice(0, 40),
    missing_skills: match.missingSkills.slice(0, 40),
    is_recommended: match.resumeId === best?.resumeId,
    fingerprint: job.fingerprint,
  }));

  return { bestScore: best?.score ?? 0, recommendedResumeId: best?.resumeId ?? null, rows };
}

// -----------------------------------------------------------------------------
// Execução
// -----------------------------------------------------------------------------
export interface RunOptions {
  sourceIds?: string[];
  /** Ignora o corte incremental e revarre a fonte inteira (§7). */
  full?: boolean;
  trigger?: 'manual' | 'cron';
}

export async function runDiscovery(ctx: DiscoveryContext, options: RunOptions = {}): Promise<DiscoveryRunResult> {
  const startedAt = new Date();
  const trigger = options.trigger ?? 'manual';

  await ensureDefaultSources(ctx);

  const [settings, sources, resumes, bundle] = await Promise.all([
    getSettings(ctx.db, ctx.userId),
    loadSources(ctx, options.sourceIds ?? []),
    listResumes(ctx.db, ctx.userId),
    getProfileBundle(ctx.db, ctx.userId),
  ]);

  if (sources.length === 0) {
    throw new ApiError(
      'bad_request',
      'Nenhuma fonte ativa. Adicione uma empresa ou ative um quadro público em Configurações → Fontes.',
    );
  }

  const strategy = await buildStrategyForUser(ctx, settings);
  const existing = await loadExistingJobs(ctx);
  const existingByFingerprint = new Map(existing.filter((job) => job.fingerprint).map((job) => [job.fingerprint, job]));

  const profileContext: ProfileMatchContext = {
    seniority: bundle.profile.seniority ?? null,
    workModes: asWorkModes(bundle.profile.workModes),
    location: bundle.profile.location || bundle.profile.desiredLocation,
  };

  const results: SyncResultItem[] = [];
  const failedSources: string[] = [];
  const collected: Array<{ source: SourceRow; job: NormalizedJob }> = [];

  // --- 1. Executa conectores em paralelo controlado; falha isolada (§35) ---
  await mapWithConcurrency(sources, SOURCE_CONCURRENCY, async (source) => {
    const connector = getConnector(source.kind);
    const sourceStarted = Date.now();
    const label = source.label || connector.label;

    if (!connector) {
      results.push(emptyResult(source, label, 'ignorada', 'Conector não registrado.', 0));
      return;
    }

    try {
      const outcome = await connector.fetchJobs({
        identifier: source.identifier,
        searchTerms: strategy.terms,
        since: options.full ? null : source.lastSyncAt,
        limit: LIMIT_PER_SOURCE,
      });

      let filtered = 0;
      for (const raw of outcome.jobs) {
        const normalized = normalizeRawJob(source.kind, raw);
        if (!normalized.title || !normalized.company) continue;

        // Pré-filtro determinístico antes de qualquer trabalho caro (§29).
        const decision = preFilter(
          { title: normalized.title, technologies: normalized.technologies, description: normalized.description },
          strategy,
        );
        if (!decision.keep) {
          filtered += 1;
          continue;
        }
        collected.push({ source, job: normalized });
      }

      results.push({
        sourceId: source.id,
        kind: source.kind,
        label,
        status: 'ok',
        jobsFound: outcome.jobs.length,
        jobsNew: 0,
        jobsUpdated: 0,
        jobsDuplicated: 0,
        jobsFiltered: filtered,
        durationMs: Date.now() - sourceStarted,
        error: '',
      });
    } catch (error) {
      const message = describeHttpError(error);
      failedSources.push(label);
      results.push(emptyResult(source, label, 'erro', message, Date.now() - sourceStarted));
      console.warn(`[discovery] fonte ${source.kind}/${source.identifier} falhou: ${message}`);
    }
  });

  // --- 2. Deduplicação dentro do lote (§13) ---
  const groups = groupDuplicates(
    collected.map((item) => ({
      ...item.job,
      sourceUrl: item.job.sourceUrl,
      __source: item.source,
    })),
  );

  let totalNew = 0;
  let totalUpdated = 0;
  let totalDuplicated = 0;
  let highMatches = 0;

  const resultBySource = new Map(results.map((item) => [item.sourceId ?? item.kind, item]));

  for (const group of groups) {
    if (totalNew >= MAX_NEW_JOBS_PER_RUN) break;

    const primary = group.primary;
    const source = primary.__source as SourceRow;
    const stat = resultBySource.get(source.id);
    totalDuplicated += group.duplicates.length;
    if (stat) stat.jobsDuplicated += group.duplicates.length;

    // --- 3. Deduplicação contra o que já existe no banco ---
    let jobId: string | null = null;

    const known =
      existingByFingerprint.get(primary.fingerprint) ??
      existing.find((candidate) =>
        isLikelyDuplicate(
          { title: candidate.title, company: candidate.company, location: candidate.location, sourceUrl: candidate.sourceUrl },
          { title: primary.title, company: primary.company, location: primary.location, sourceUrl: primary.sourceUrl },
        ),
      );

    if (known) {
      jobId = known.id;
      totalUpdated += 1;
      if (stat) stat.jobsUpdated += 1;
    } else {
      const companyId = await resolveCompany(ctx, primary.company, primary.companyUrl);
      const { data, error } = await ctx.db
        .from('jobs')
        .insert(toJobRow(ctx, primary, companyId))
        .select('id')
        .single();

      if (error) {
        // 23505 = corrida com outra execução: a vaga já existe, seguimos.
        if ((error as { code?: string }).code !== '23505') {
          console.warn('[discovery] falha ao inserir vaga:', error.message);
          continue;
        }
        const { data: found } = await ctx.db
          .from('jobs')
          .select('id')
          .eq('user_id', ctx.userId)
          .eq('fingerprint', primary.fingerprint)
          .maybeSingle();
        jobId = found ? String((found as Row).id) : null;
      } else {
        jobId = data ? String((data as Row).id) : null;
        totalNew += 1;
        if (stat) stat.jobsNew += 1;
        existing.push({
          id: jobId ?? '',
          fingerprint: primary.fingerprint,
          title: primary.title,
          company: primary.company,
          location: primary.location,
          sourceUrl: primary.sourceUrl,
        });
        if (primary.fingerprint && jobId) {
          existingByFingerprint.set(primary.fingerprint, {
            id: jobId,
            fingerprint: primary.fingerprint,
            title: primary.title,
            company: primary.company,
            location: primary.location,
            sourceUrl: primary.sourceUrl,
          });
        }
      }
    }

    if (!jobId) continue;

    // --- 4. Todas as origens da vaga, inclusive as duplicadas (§13) ---
    const links = [primary, ...group.duplicates].map((item) => ({
      user_id: ctx.userId,
      job_id: jobId,
      source: item.source,
      source_job_id: item.sourceJobId,
      source_url: item.sourceUrl,
      application_url: item.applicationUrl,
      last_seen_at: new Date().toISOString(),
    }));

    const { error: linkError } = await ctx.db
      .from('job_source_links')
      .upsert(links, { onConflict: 'job_id,source,source_job_id', ignoreDuplicates: false });
    if (linkError) console.warn('[discovery] falha ao registrar origem:', linkError.message);

    const { count } = await ctx.db
      .from('job_source_links')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId);

    // --- 5. Matching determinístico e relevância (§9, §24) ---
    const match = computeMatches(ctx, jobId, primary, resumes, profileContext);
    if (match.rows.length > 0) {
      const { error: matchError } = await ctx.db
        .from('job_matches')
        .upsert(match.rows, { onConflict: 'job_id,resume_id', ignoreDuplicates: false });
      if (matchError) console.warn('[discovery] falha ao gravar matches:', matchError.message);
    }

    const relevance = relevanceScore({ matchScore: match.bestScore, publishedAt: primary.publishedAt });
    if (match.bestScore >= 85) highMatches += 1;

    const { error: updateError } = await ctx.db
      .from('jobs')
      .update({
        best_match_score: match.bestScore,
        relevance_score: relevance.score,
        recommended_resume_id: match.recommendedResumeId,
        matched_at: new Date().toISOString(),
        source_count: count ?? 1,
      })
      .eq('id', jobId)
      .eq('user_id', ctx.userId);
    if (updateError) console.warn('[discovery] falha ao atualizar score:', updateError.message);

  }

  // --- 6. Saúde das fontes e histórico (§26, §34) ---
  const finishedAt = new Date();
  await persistSyncResults(ctx, results, trigger);
  await createDiscoveryNotification(ctx, totalNew, highMatches, failedSources);

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totalNew,
    totalUpdated,
    totalFound: results.reduce((sum, item) => sum + item.jobsFound, 0),
    highMatches,
    results,
    strategy: { terms: strategy.terms, explanation: strategy.explanation },
    failedSources,
  };
}

function emptyResult(
  source: SourceRow,
  label: string,
  status: SyncResultItem['status'],
  error: string,
  durationMs: number,
): SyncResultItem {
  return {
    sourceId: source.id,
    kind: source.kind,
    label,
    status,
    jobsFound: 0,
    jobsNew: 0,
    jobsUpdated: 0,
    jobsDuplicated: 0,
    jobsFiltered: 0,
    durationMs,
    error,
  };
}

async function persistSyncResults(
  ctx: DiscoveryContext,
  results: SyncResultItem[],
  trigger: 'manual' | 'cron',
): Promise<void> {
  if (results.length === 0) return;

  const rows = results.map((item) => ({
    user_id: ctx.userId,
    source_id: item.sourceId,
    source_kind: item.kind,
    source_label: item.label,
    status: item.status,
    jobs_found: item.jobsFound,
    jobs_new: item.jobsNew,
    jobs_updated: item.jobsUpdated,
    jobs_duplicated: item.jobsDuplicated,
    jobs_filtered: item.jobsFiltered,
    error: item.error.slice(0, 1000),
    duration_ms: item.durationMs,
    trigger_kind: trigger,
  }));

  const { error } = await ctx.db.from('source_syncs').insert(rows);
  if (error) console.warn('[discovery] histórico de sincronização não registrado:', error.message);

  const now = new Date().toISOString();
  for (const item of results) {
    if (!item.sourceId) continue;
    const patch: Row = {
      last_sync_at: now,
      last_status: item.status === 'ok' ? 'ok' : item.status === 'erro' ? 'erro' : 'desabilitada',
      last_error: item.error.slice(0, 1000),
      last_duration_ms: item.durationMs,
    };
    if (item.status === 'ok') {
      patch.consecutive_failures = 0;
      patch.total_jobs_found = item.jobsFound;
    }

    const { error: sourceError } = await ctx.db
      .from('job_sources')
      .update(patch)
      .eq('id', item.sourceId)
      .eq('user_id', ctx.userId);
    if (sourceError) console.warn('[discovery] saúde da fonte não atualizada:', sourceError.message);

  }
}

/** Notificação interna do resultado (§23). Sem envio externo. */
async function createDiscoveryNotification(
  ctx: DiscoveryContext,
  totalNew: number,
  highMatches: number,
  failedSources: string[],
): Promise<void> {
  const notifications: Row[] = [];

  if (totalNew > 0) {
    notifications.push({
      user_id: ctx.userId,
      kind: 'discovery',
      title: `${totalNew} nova(s) vaga(s) encontrada(s)`,
      body:
        highMatches > 0
          ? `${highMatches} com aderência acima de 85%.`
          : 'Abra a tela Descobrir para revisar os resultados.',
      data: { totalNew, highMatches },
    });
  }

  if (failedSources.length > 0) {
    notifications.push({
      user_id: ctx.userId,
      kind: 'source_error',
      title: 'Algumas fontes não puderam ser atualizadas',
      body: failedSources.slice(0, 5).join(', '),
      data: { failedSources },
    });
  }

  if (notifications.length === 0) return;
  const { error } = await ctx.db.from('notifications').insert(notifications);
  if (error) console.warn('[discovery] notificação não registrada:', error.message);
}
