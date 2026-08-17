/**
 * Motor de score deterministico e explicavel (§22/§23).
 *
 * Regras de projeto:
 *  - 100% puro: mesma entrada => mesma saida. Testavel sem rede e sem IA.
 *  - Cada ponto do score tem origem rastreavel (`breakdown`).
 *  - A IA pode ajustar o resultado em no maximo +/-10 pontos, e esse ajuste
 *    e sempre exibido separadamente do score base.
 */
import type { Seniority, WorkMode } from '../constants';
import { SENIORITY_RANK } from '../constants';
import type { ResumeContent } from '../schemas/resume';
import type { RequirementStatus, ResumeMatch, ScoreBreakdownItem } from '../schemas/job';
import {
  canonicalSkill,
  canonicalSkills,
  containsTerm,
  extractMinYears,
  normalizeText,
  tokenSimilarity,
  tokenize,
  totalExperienceYears,
} from './normalize';

/** Pesos do score. A soma e exatamente 100. */
export const SCORE_WEIGHTS = {
  requiredSkills: 40,
  preferredSkills: 12,
  title: 14,
  seniority: 12,
  experience: 10,
  workMode: 6,
  keywords: 6,
} as const;

export const SCORE_WEIGHT_LABEL: Record<keyof typeof SCORE_WEIGHTS, string> = {
  requiredSkills: 'Requisitos obrigatórios',
  preferredSkills: 'Requisitos desejáveis',
  title: 'Aderência ao cargo',
  seniority: 'Senioridade',
  experience: 'Tempo de experiência',
  workMode: 'Modalidade e local',
  keywords: 'Palavras-chave / ATS',
};

/** Valor neutro usado quando a vaga nao informa um criterio (nao premia nem pune). */
const NEUTRAL = 0.7;
/** Peso de um match parcial em relacao a um match exato. */
const PARTIAL_WEIGHT = 0.6;
export const MAX_SEMANTIC_ADJUSTMENT = 10;

export interface ScoringJob {
  title: string;
  seniority?: Seniority | null;
  workMode?: WorkMode | null;
  location?: string;
  requirements?: string[];
  niceToHave?: string[];
  technologies?: string[];
  description?: string;
}

export interface ScoringAnalysis {
  requiredSkills?: string[];
  preferredSkills?: string[];
  technologies?: string[];
  keywords?: string[];
  minYearsExperience?: number | null;
  seniority?: string | null;
  workMode?: string | null;
}

export interface ScoringResume {
  id: string;
  name: string;
  objective?: string;
  seniority?: Seniority | null;
  skills?: string[];
  targetRoles?: string[];
  content?: ResumeContent | null;
}

export interface ScoringContext {
  profileSeniority?: Seniority | null;
  profileWorkModes?: WorkMode[];
  profileLocation?: string;
  /** Injetavel para tornar os testes deterministicos. */
  nowIndex?: number;
}

interface ResumeIndex {
  skills: string[];
  skillSet: Set<string>;
  text: string;
  roles: string[];
  years: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Constroi o indice de busca de um curriculo (skills canonicas + texto plano). */
export function buildResumeIndex(resume: ScoringResume, ctx: ScoringContext = {}): ResumeIndex {
  const content = resume.content ?? null;
  const rawSkills: string[] = [...(resume.skills ?? [])];
  const roles: string[] = [...(resume.targetRoles ?? [])];
  const textParts: string[] = [resume.name, resume.objective ?? ''];

  if (content) {
    rawSkills.push(...content.skills);
    textParts.push(content.headline, content.summary);
    if (content.headline) roles.push(content.headline);
    for (const exp of content.experiences) {
      rawSkills.push(...exp.technologies);
      if (exp.role) roles.push(exp.role);
      textParts.push(exp.role, exp.company, exp.description, ...exp.achievements, ...exp.responsibilities);
    }
    for (const project of content.projects) {
      rawSkills.push(...project.technologies);
      textParts.push(project.name, project.description, ...project.outcomes);
    }
    for (const cert of content.certifications) textParts.push(cert.name ?? '');
    for (const lang of content.languages) {
      textParts.push(lang.name ?? '');
      if (lang.name) rawSkills.push(lang.name);
    }
    for (const edu of content.education) textParts.push(edu.institution ?? '', edu.degree ?? '', edu.field ?? '');
  }

  const skills = canonicalSkills(rawSkills.filter(Boolean));
  const text = normalizeText(textParts.filter(Boolean).join(' \n '));
  const years = totalExperienceYears(content?.experiences ?? [], ctx.nowIndex);

  return { skills, skillSet: new Set(skills), text, roles: roles.filter(Boolean), years };
}

export type SkillMatchStatus = 'atendido' | 'parcial' | 'ausente';

/** Classifica uma skill exigida contra o indice do curriculo. */
export function matchSkill(index: ResumeIndex, requiredSkill: string): SkillMatchStatus {
  const target = canonicalSkill(requiredSkill);
  if (!target) return 'ausente';
  if (index.skillSet.has(target)) return 'atendido';
  for (const skill of index.skills) {
    if (containsTerm(skill, target) || containsTerm(target, skill)) return 'parcial';
  }
  if (containsTerm(index.text, target)) return 'parcial';
  return 'ausente';
}

interface Coverage {
  ratio: number;
  matched: string[];
  partial: string[];
  missing: string[];
  informed: boolean;
}

function coverSkills(index: ResumeIndex, required: string[]): Coverage {
  const unique = canonicalSkills(required);
  if (unique.length === 0) {
    return { ratio: NEUTRAL, matched: [], partial: [], missing: [], informed: false };
  }
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const skill of unique) {
    const status = matchSkill(index, skill);
    if (status === 'atendido') matched.push(skill);
    else if (status === 'parcial') partial.push(skill);
    else missing.push(skill);
  }
  const ratio = clamp01((matched.length + PARTIAL_WEIGHT * partial.length) / unique.length);
  return { ratio, matched, partial, missing, informed: true };
}

function scoreTitle(job: ScoringJob, index: ResumeIndex, resume: ScoringResume): { ratio: number; best: string } {
  const candidates = [...(resume.targetRoles ?? []), ...index.roles, resume.name].filter(Boolean);
  if (!job.title || candidates.length === 0) return { ratio: NEUTRAL, best: '' };
  let best = 0;
  let bestLabel = '';
  for (const candidate of candidates) {
    const similarity = tokenSimilarity(job.title, candidate);
    if (similarity > best) {
      best = similarity;
      bestLabel = candidate;
    }
  }
  return { ratio: clamp01(best), best: bestLabel };
}

function scoreSeniority(
  jobSeniority: Seniority | null | undefined,
  resumeSeniority: Seniority | null | undefined,
): { ratio: number; detail: string } {
  if (!jobSeniority) return { ratio: NEUTRAL, detail: 'Vaga não informa senioridade' };
  if (!resumeSeniority) return { ratio: NEUTRAL, detail: 'Currículo sem senioridade definida' };
  const diff = SENIORITY_RANK[resumeSeniority] - SENIORITY_RANK[jobSeniority];
  if (diff === 0) return { ratio: 1, detail: 'Senioridade equivalente' };
  if (diff > 0) {
    const ratio = diff === 1 ? 0.85 : diff === 2 ? 0.6 : 0.4;
    return { ratio, detail: `Acima do nível pedido (${diff} nível(is))` };
  }
  const under = Math.abs(diff);
  const ratio = under === 1 ? 0.65 : under === 2 ? 0.3 : 0.1;
  return { ratio, detail: `Abaixo do nível pedido (${under} nível(is))` };
}

function scoreExperience(
  requiredYears: number | null,
  index: ResumeIndex,
): { ratio: number; detail: string } {
  if (requiredYears === null || requiredYears <= 0) {
    return { ratio: NEUTRAL, detail: `Vaga não define tempo mínimo (você tem ~${index.years} ano(s))` };
  }
  if (index.years <= 0) {
    return { ratio: 0, detail: `Vaga pede ${requiredYears} ano(s); currículo sem datas de experiência` };
  }
  const ratio = clamp01(index.years / requiredYears);
  const detail =
    index.years >= requiredYears
      ? `~${index.years} ano(s) para ${requiredYears} exigido(s)`
      : `~${index.years} ano(s) de ${requiredYears} exigido(s)`;
  return { ratio, detail };
}

function scoreWorkMode(job: ScoringJob, ctx: ScoringContext): { ratio: number; detail: string } {
  const jobMode = job.workMode ?? null;
  const accepted = ctx.profileWorkModes ?? [];
  if (!jobMode) return { ratio: NEUTRAL, detail: 'Modalidade não informada na vaga' };
  if (jobMode === 'remoto') return { ratio: 1, detail: 'Vaga remota' };
  if (accepted.length === 0) return { ratio: NEUTRAL, detail: 'Preferência de modalidade não configurada' };
  if (accepted.includes(jobMode)) {
    const jobLocation = normalizeText(job.location ?? '');
    const profileLocation = normalizeText(ctx.profileLocation ?? '');
    if (!jobLocation || !profileLocation) return { ratio: 0.9, detail: `Aceita ${jobMode}` };
    const similar = tokenSimilarity(jobLocation, profileLocation) > 0.3;
    return similar
      ? { ratio: 1, detail: `Aceita ${jobMode} e a localização confere` }
      : { ratio: 0.6, detail: `Aceita ${jobMode}, mas a cidade parece diferente` };
  }
  return { ratio: 0.25, detail: `Vaga ${jobMode} fora das suas preferências` };
}

function scoreKeywords(keywords: string[], index: ResumeIndex): Coverage {
  const unique = canonicalSkills(keywords);
  if (unique.length === 0) return { ratio: NEUTRAL, matched: [], partial: [], missing: [], informed: false };
  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of unique) {
    if (index.skillSet.has(keyword) || containsTerm(index.text, keyword)) matched.push(keyword);
    else missing.push(keyword);
  }
  return { ratio: clamp01(matched.length / unique.length), matched, partial: [], missing, informed: true };
}

/** Avalia um requisito escrito em linguagem natural contra o curriculo. */
export function evaluateRequirement(
  requirement: string,
  index: ResumeIndex,
): { requirement: string; status: RequirementStatus; evidence: string } {
  const normalized = normalizeText(requirement);
  if (!normalized) return { requirement, status: 'ausente', evidence: '' };

  const hits = index.skills.filter((skill) => skill.length >= 2 && containsTerm(normalized, skill));
  if (hits.length > 0) {
    return { requirement, status: 'atendido', evidence: `Encontrado no currículo: ${hits.slice(0, 5).join(', ')}` };
  }

  const tokens = tokenize(requirement);
  if (tokens.length === 0) return { requirement, status: 'ausente', evidence: '' };
  const present = tokens.filter((token) => token.length > 3 && containsTerm(index.text, token));
  const ratio = present.length / tokens.length;
  if (ratio >= 0.5) {
    return { requirement, status: 'parcial', evidence: `Menções relacionadas: ${present.slice(0, 5).join(', ')}` };
  }
  return { requirement, status: 'ausente', evidence: '' };
}

export interface DeterministicScore {
  score: number;
  breakdown: ScoreBreakdownItem[];
  matchedSkills: string[];
  partialSkills: string[];
  missingSkills: string[];
  requirements: Array<{ requirement: string; status: RequirementStatus; evidence: string }>;
  years: number;
}

/** Calcula o score deterministico de um curriculo contra uma vaga. */
export function scoreResumeAgainstJob(
  job: ScoringJob,
  analysis: ScoringAnalysis | null,
  resume: ScoringResume,
  ctx: ScoringContext = {},
): DeterministicScore {
  const index = buildResumeIndex(resume, ctx);

  const requiredSkills =
    analysis?.requiredSkills && analysis.requiredSkills.length > 0
      ? analysis.requiredSkills
      : (job.technologies ?? []);
  const preferredSkills =
    analysis?.preferredSkills && analysis.preferredSkills.length > 0
      ? analysis.preferredSkills
      : (job.niceToHave ?? []);
  const keywords =
    analysis?.keywords && analysis.keywords.length > 0
      ? analysis.keywords
      : [...(job.technologies ?? []), ...tokenize(job.title).slice(0, 6)];

  const required = coverSkills(index, requiredSkills);
  const preferred = coverSkills(index, preferredSkills);
  const title = scoreTitle(job, index, resume);
  const seniority = scoreSeniority(job.seniority ?? null, resume.seniority ?? ctx.profileSeniority ?? null);

  const requiredYears =
    analysis?.minYearsExperience ??
    extractMinYears([...(job.requirements ?? []), job.description ?? ''].join(' \n '));
  const experience = scoreExperience(requiredYears, index);
  const workMode = scoreWorkMode(job, ctx);
  const keywordCoverage = scoreKeywords(keywords, index);

  const breakdown: ScoreBreakdownItem[] = [
    {
      key: 'requiredSkills',
      label: SCORE_WEIGHT_LABEL.requiredSkills,
      weight: SCORE_WEIGHTS.requiredSkills,
      ratio: required.ratio,
      points: round1(required.ratio * SCORE_WEIGHTS.requiredSkills),
      detail: required.informed
        ? `${required.matched.length} de ${required.matched.length + required.partial.length + required.missing.length} atendidos integralmente`
        : 'Vaga não lista requisitos obrigatórios — critério neutro',
      matched: required.matched,
      missing: required.missing,
    },
    {
      key: 'preferredSkills',
      label: SCORE_WEIGHT_LABEL.preferredSkills,
      weight: SCORE_WEIGHTS.preferredSkills,
      ratio: preferred.ratio,
      points: round1(preferred.ratio * SCORE_WEIGHTS.preferredSkills),
      detail: preferred.informed
        ? `${preferred.matched.length} desejáveis atendidos`
        : 'Vaga não lista diferenciais — critério neutro',
      matched: preferred.matched,
      missing: preferred.missing,
    },
    {
      key: 'title',
      label: SCORE_WEIGHT_LABEL.title,
      weight: SCORE_WEIGHTS.title,
      ratio: title.ratio,
      points: round1(title.ratio * SCORE_WEIGHTS.title),
      detail: title.best ? `Mais próximo: "${title.best}"` : 'Sem cargo-alvo comparável',
      matched: title.best ? [title.best] : [],
      missing: [],
    },
    {
      key: 'seniority',
      label: SCORE_WEIGHT_LABEL.seniority,
      weight: SCORE_WEIGHTS.seniority,
      ratio: seniority.ratio,
      points: round1(seniority.ratio * SCORE_WEIGHTS.seniority),
      detail: seniority.detail,
      matched: [],
      missing: [],
    },
    {
      key: 'experience',
      label: SCORE_WEIGHT_LABEL.experience,
      weight: SCORE_WEIGHTS.experience,
      ratio: experience.ratio,
      points: round1(experience.ratio * SCORE_WEIGHTS.experience),
      detail: experience.detail,
      matched: [],
      missing: [],
    },
    {
      key: 'workMode',
      label: SCORE_WEIGHT_LABEL.workMode,
      weight: SCORE_WEIGHTS.workMode,
      ratio: workMode.ratio,
      points: round1(workMode.ratio * SCORE_WEIGHTS.workMode),
      detail: workMode.detail,
      matched: [],
      missing: [],
    },
    {
      key: 'keywords',
      label: SCORE_WEIGHT_LABEL.keywords,
      weight: SCORE_WEIGHTS.keywords,
      ratio: keywordCoverage.ratio,
      points: round1(keywordCoverage.ratio * SCORE_WEIGHTS.keywords),
      detail: keywordCoverage.informed
        ? `${keywordCoverage.matched.length} de ${keywordCoverage.matched.length + keywordCoverage.missing.length} palavras-chave presentes`
        : 'Sem palavras-chave extraídas — critério neutro',
      matched: keywordCoverage.matched,
      missing: keywordCoverage.missing,
    },
  ];

  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  const requirementList = (job.requirements ?? [])
    .slice(0, 40)
    .map((requirement) => evaluateRequirement(requirement, index));

  return {
    score,
    breakdown,
    matchedSkills: required.matched,
    partialSkills: required.partial,
    missingSkills: required.missing,
    requirements: requirementList,
    years: index.years,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Aplica o ajuste semantico da IA respeitando o teto de +/-10 pontos. */
export function applySemanticAdjustment(baseScore: number, adjustment: number): number {
  const bounded = Math.max(-MAX_SEMANTIC_ADJUSTMENT, Math.min(MAX_SEMANTIC_ADJUSTMENT, Math.round(adjustment)));
  return Math.max(0, Math.min(100, baseScore + bounded));
}

/** Ordena todos os curriculos contra uma vaga (§22). */
export function rankResumes(
  job: ScoringJob,
  analysis: ScoringAnalysis | null,
  resumes: ScoringResume[],
  ctx: ScoringContext = {},
): ResumeMatch[] {
  const matches: ResumeMatch[] = resumes.map((resume) => {
    const result = scoreResumeAgainstJob(job, analysis, resume, ctx);
    return {
      resumeId: resume.id,
      resumeName: resume.name,
      score: result.score,
      baseScore: result.score,
      semanticAdjustment: 0,
      breakdown: result.breakdown,
      requirements: result.requirements,
      matchedSkills: result.matchedSkills,
      partialSkills: result.partialSkills,
      missingSkills: result.missingSkills,
      semantic: null,
    };
  });
  return matches.sort((a, b) => b.score - a.score || a.resumeName.localeCompare(b.resumeName));
}

/** Classificacao textual do score, usada em badges e recomendacoes. */
export function scoreTier(score: number): 'alto' | 'medio' | 'baixo' {
  if (score >= 75) return 'alto';
  if (score >= 55) return 'medio';
  return 'baixo';
}
