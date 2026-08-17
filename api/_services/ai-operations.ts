/**
 * Casos de uso de IA (§17, §21, §22, §24, §26).
 *
 * Responsabilidades desta camada:
 *  - reservar quota antes de qualquer chamada (§44);
 *  - montar apenas o contexto necessario (§29);
 *  - aplicar guardas deterministicas sobre a saida da IA (§18);
 *  - registrar o provider realmente utilizado (§6).
 */
import { ApiError } from '../_lib/errors';
import type { Db } from '../_lib/supabase';
import type { AnswerKind } from '../../shared/constants';
import { MAX_JOB_TEXT_CHARS, MAX_RESUME_TEXT_CHARS } from '../../shared/constants';
import type { Job, JobAnalysis, ResumeMatch } from '../../shared/schemas/job';
import type { Resume, ResumeContent } from '../../shared/schemas/resume';
import { rankResumes, applySemanticAdjustment, MAX_SEMANTIC_ADJUSTMENT } from '../../shared/matching/score';
import { enforceResumeIntegrity, type IntegrityViolation } from '../../shared/guards/resume-integrity';
import { getAIService, type AIOperation, type AIUserPreferences } from './ai/service';
import { buildResumeExtractionPrompt, resumeExtractionSchema, type ResumeExtraction } from './ai/prompts/resume-extraction';
import { buildJobExtractionPrompt, jobExtractionSchema, type JobExtraction } from './ai/prompts/job-extraction';
import { buildJobAnalysisPrompt, jobAnalysisSchema } from './ai/prompts/job-analysis';
import { buildSemanticMatchPrompt, semanticMatchSchema } from './ai/prompts/semantic-match';
import { buildResumeAdaptationPrompt, resumeAdaptationSchema } from './ai/prompts/resume-adaptation';
import { answerMaxTokens, buildAnswerPrompt, generatedAnswerSchema } from './ai/prompts/answers';
import type { ProfileContextInput } from './ai/prompts/context';
import { consumeAIQuota, finalizeAIUsage, type AIOperationName } from './ratelimit';
import type { UserSettings } from './mappers';

export interface AICtx {
  db: Db;
  userId: string;
  settings: UserSettings;
}

export interface AIMeta {
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean;
  inputTokens: number;
  outputTokens: number;
}

interface Runner {
  run<T>(spec: Omit<AIOperation<T>, 'operation'>): Promise<T>;
}

function preferences(settings: UserSettings): AIUserPreferences {
  return { providerPreference: settings.aiProviderPreference, allowFallback: settings.allowFallback };
}

/** Consentimento explicito antes de enviar dados pessoais ao provider (§12). */
function assertConsent(settings: UserSettings): void {
  if (!settings.aiConsent) {
    throw new ApiError(
      'forbidden',
      'Antes de usar a IA você precisa autorizar o envio dos dados em Configurações → Privacidade.',
    );
  }
}

/** Reserva quota, executa as chamadas de IA e registra o consumo real. */
async function withQuota<T>(
  ctx: AICtx,
  operation: AIOperationName,
  fn: (runner: Runner) => Promise<T>,
): Promise<{ data: T; meta: AIMeta }> {
  assertConsent(ctx.settings);

  const service = getAIService();
  if (!service.isAvailable()) {
    throw new ApiError(
      'ai_not_configured',
      'Nenhum provider de IA está configurado no servidor. Configure GROQ_API_KEY ou NVIDIA_API_KEY.',
    );
  }

  const usageId = await consumeAIQuota(ctx.db, operation);
  const meta: AIMeta = { provider: null, model: null, fallbackUsed: false, inputTokens: 0, outputTokens: 0 };
  const prefs = preferences(ctx.settings);

  const runner: Runner = {
    async run<S>(spec: Omit<AIOperation<S>, 'operation'>): Promise<S> {
      const result = await service.run<S>({ ...spec, operation }, prefs);
      meta.provider = result.provider;
      meta.model = result.model;
      meta.fallbackUsed = meta.fallbackUsed || result.fallbackUsed;
      meta.inputTokens += result.usage.inputTokens;
      meta.outputTokens += result.usage.outputTokens;
      return result.data;
    },
  };

  try {
    const data = await fn(runner);
    await finalizeAIUsage(ctx.db, usageId, { ...meta, succeeded: true });
    return { data, meta };
  } catch (error) {
    await finalizeAIUsage(ctx.db, usageId, { ...meta, succeeded: false });
    throw error;
  }
}

// -----------------------------------------------------------------------------
// §17 - Importacao de curriculo
// -----------------------------------------------------------------------------
export async function extractResumeFromText(
  ctx: AICtx,
  rawText: string,
): Promise<{ extraction: ResumeExtraction; meta: AIMeta }> {
  const text = rawText.trim();
  if (text.length < 80) {
    throw new ApiError(
      'bad_request',
      'O texto extraído do arquivo é curto demais para análise. O PDF pode ser uma imagem digitalizada — nesse caso, cole o conteúdo manualmente.',
    );
  }

  const prompt = buildResumeExtractionPrompt(text.slice(0, MAX_RESUME_TEXT_CHARS));
  const { data, meta } = await withQuota(ctx, 'resume.extract', (runner) =>
    runner.run({
      ...prompt,
      schema: resumeExtractionSchema,
      costTier: 'heavy',
      temperature: 0.1,
      maxTokens: 6000,
    }),
  );
  return { extraction: data, meta };
}

// -----------------------------------------------------------------------------
// §20 - Estruturacao de vaga colada
// -----------------------------------------------------------------------------
export async function extractJobFromText(
  ctx: AICtx,
  rawText: string,
): Promise<{ extraction: JobExtraction; meta: AIMeta }> {
  const text = rawText.trim();
  if (text.length < 40) {
    throw new ApiError('bad_request', 'Cole uma descrição de vaga com mais conteúdo para que a análise seja útil.');
  }

  const prompt = buildJobExtractionPrompt(text.slice(0, MAX_JOB_TEXT_CHARS));
  const { data, meta } = await withQuota(ctx, 'job.extract', (runner) =>
    runner.run({ ...prompt, schema: jobExtractionSchema, costTier: 'light', temperature: 0.1, maxTokens: 3000 }),
  );
  return { extraction: data, meta };
}

// -----------------------------------------------------------------------------
// §21/§22 - Analise da vaga + matching hibrido
// -----------------------------------------------------------------------------
export interface AnalysisOutcome {
  analysis: JobAnalysis;
  matches: ResumeMatch[];
  recommendedResumeId: string | null;
  recommendationReason: string;
  meta: AIMeta;
}

const MAX_SEMANTIC_RESUMES = 6;

export async function analyzeJobWithMatching(
  ctx: AICtx,
  job: Job,
  resumes: Resume[],
  profileContext: ProfileContextInput,
): Promise<AnalysisOutcome> {
  const scoringCtx = {
    profileSeniority: profileContext.profile.seniority ?? null,
    profileWorkModes: profileContext.profile.workModes,
    profileLocation: profileContext.profile.location || profileContext.profile.desiredLocation,
  };

  const { data, meta } = await withQuota(ctx, 'job.analyze', async (runner) => {
    // 1) Analise estruturada da vaga.
    const analysisPrompt = buildJobAnalysisPrompt(job);
    const analysis = await runner.run({
      ...analysisPrompt,
      schema: jobAnalysisSchema,
      costTier: 'heavy',
      temperature: 0.1,
      maxTokens: 3500,
    });

    // 2) Score deterministico contra TODOS os curriculos.
    const baseMatches = rankResumes(job, analysis, resumes, scoringCtx);

    if (baseMatches.length === 0) {
      return { analysis, matches: baseMatches, recommendedResumeId: null, recommendationReason: '' };
    }

    // 3) Camada semantica somente sobre os melhores candidatos (controle de custo).
    const shortlist = baseMatches.slice(0, MAX_SEMANTIC_RESUMES);
    const shortlistResumes = shortlist
      .map((match) => resumes.find((resume) => resume.id === match.resumeId))
      .filter((resume): resume is Resume => Boolean(resume));

    let recommendedResumeId: string | null = null;
    let recommendationReason = '';

    try {
      const semanticPrompt = buildSemanticMatchPrompt(job, analysis, shortlist, shortlistResumes);
      const semantic = await runner.run({
        ...semanticPrompt,
        schema: semanticMatchSchema,
        costTier: 'heavy',
        temperature: 0.2,
        maxTokens: 4000,
      });

      const bySemantic = new Map(semantic.assessments.map((item) => [item.resumeId, item]));
      for (const match of baseMatches) {
        const assessment = bySemantic.get(match.resumeId);
        if (!assessment) continue;
        const { resumeId: _ignored, ...rest } = assessment;
        const adjustment = Math.max(-MAX_SEMANTIC_ADJUSTMENT, Math.min(MAX_SEMANTIC_ADJUSTMENT, Math.round(rest.adjustment)));
        match.semantic = { ...rest, adjustment };
        match.semanticAdjustment = adjustment;
        match.score = applySemanticAdjustment(match.baseScore, adjustment);
      }
      baseMatches.sort((a, b) => b.score - a.score || a.resumeName.localeCompare(b.resumeName));

      const suggested = semantic.recommendedResumeId;
      if (suggested && baseMatches.some((match) => match.resumeId === suggested)) {
        recommendedResumeId = suggested;
        recommendationReason = semantic.recommendationReason;
      }
    } catch (error) {
      // A analise semantica e um enriquecimento: se falhar, o resultado
      // deterministico continua valido e utilizavel (§45).
      console.warn('[ai] camada semântica indisponível, mantendo score determinístico:', error);
    }

    if (!recommendedResumeId) {
      const best = baseMatches[0]!;
      recommendedResumeId = best.resumeId;
      recommendationReason =
        recommendationReason ||
        `Maior aderência calculada (${best.score}/100), com ${best.matchedSkills.length} requisito(s) atendido(s) integralmente.`;
    }

    return { analysis, matches: baseMatches, recommendedResumeId, recommendationReason };
  });

  return { ...data, meta };
}

// -----------------------------------------------------------------------------
// §24 - Adaptacao de curriculo
// -----------------------------------------------------------------------------
export interface AdaptationOutcome {
  content: ResumeContent;
  changes: Array<{ section: string; before: string; after: string; reason: string }>;
  keywordsAdded: string[];
  missingInfo: string[];
  atsNotes: string[];
  violations: IntegrityViolation[];
  meta: AIMeta;
}

export async function adaptResumeForJob(
  ctx: AICtx,
  job: Job,
  analysis: JobAnalysis | null,
  resume: Resume,
  profileSkills: string[],
): Promise<AdaptationOutcome> {
  const prompt = buildResumeAdaptationPrompt(job, analysis, resume);
  const { data, meta } = await withQuota(ctx, 'resume.adapt', (runner) =>
    runner.run({
      ...prompt,
      schema: resumeAdaptationSchema,
      costTier: 'heavy',
      temperature: 0.25,
      maxTokens: 7000,
    }),
  );

  // Guarda determinística: remove qualquer fato inventado antes de mostrar.
  const guarded = enforceResumeIntegrity(data.content, {
    content: resume.content,
    extraSkills: [...resume.skills, ...profileSkills],
  });

  return {
    content: guarded.content,
    changes: data.changes,
    keywordsAdded: data.keywordsAdded,
    missingInfo: data.missingInfo,
    atsNotes: data.atsScoreNotes,
    violations: guarded.violations,
    meta,
  };
}

// -----------------------------------------------------------------------------
// §26 - Geracao de respostas de candidatura
// -----------------------------------------------------------------------------
export interface AnswerRequest {
  kind: AnswerKind;
  question?: string;
  job: Job;
  analysis: JobAnalysis | null;
  resume: Resume | null;
  profile: ProfileContextInput;
}

export interface AnswerOutcome {
  answer: string;
  missingInfo: string[];
  notes: string;
  meta: AIMeta;
}

export async function generateApplicationAnswer(ctx: AICtx, request: AnswerRequest): Promise<AnswerOutcome> {
  if (request.kind === 'custom' && !(request.question ?? '').trim()) {
    throw new ApiError('bad_request', 'Informe a pergunta do processo seletivo.');
  }

  const prompt = buildAnswerPrompt({
    kind: request.kind,
    ...(request.question ? { question: request.question } : {}),
    tone: ctx.settings.tone,
    job: request.job,
    analysis: request.analysis,
    resume: request.resume,
    profile: request.profile,
  });

  const { data, meta } = await withQuota(ctx, 'answer.generate', (runner) =>
    runner.run({
      ...prompt,
      schema: generatedAnswerSchema,
      costTier: 'light',
      temperature: 0.5,
      maxTokens: answerMaxTokens(request.kind),
    }),
  );

  return { answer: data.answer.trim(), missingInfo: data.missingInfo, notes: data.notes, meta };
}

/* Atalhos nomeados exigidos pelo §26 - todos delegam ao gerador acima,
   preservando uma unica implementacao e uma unica politica de prompt. */
export const generateCoverLetter = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'cover_letter' });
export const generateRecruiterMessage = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'recruiter_message' });
export const generateAboutMe = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'about_me' });
export const generateWhyCompany = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'why_company' });
export const generateWhyPosition = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'why_position' });
export const generateSalaryAnswer = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'salary' });
export const generateApplicationAnswers = (ctx: AICtx, base: Omit<AnswerRequest, 'kind'>, question: string) =>
  generateApplicationAnswer(ctx, { ...base, kind: 'custom', question });
