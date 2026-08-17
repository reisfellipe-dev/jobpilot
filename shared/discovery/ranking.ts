/**
 * Ranking de descoberta (§8, §24, §25).
 *
 * Relevância = aderência ao perfil + recência. Ambas explicáveis: para cada
 * vaga é possível dizer exatamente por que ela está naquela posição.
 * A IA não participa deste cálculo.
 */
import type { ResumeMatch } from '../schemas/job';

/** Peso da aderência contra o peso da recência na nota final. */
export const RELEVANCE_WEIGHTS = { match: 0.72, recency: 0.28 } as const;

export type RecencyTier = 'hoje' | 'esta_semana' | 'este_mes' | 'antigo' | 'desconhecido';

export interface RecencyInfo {
  /** 0..1 — entra na relevância. */
  score: number;
  tier: RecencyTier;
  /** Texto pronto para a interface: "há 4 horas". */
  label: string;
  ageHours: number | null;
}

const HOUR = 3_600_000;

/**
 * Vaga recente vale mais: em processo seletivo, chegar cedo importa.
 * Data ausente recebe valor neutro — ausência não é penalidade (§3).
 */
export function recencyInfo(publishedAt: string | null | undefined, now: number = Date.now()): RecencyInfo {
  if (!publishedAt) return { score: 0.5, tier: 'desconhecido', label: 'Data não informada', ageHours: null };

  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) {
    return { score: 0.5, tier: 'desconhecido', label: 'Data não informada', ageHours: null };
  }

  const ageHours = Math.max(0, (now - published) / HOUR);

  let score: number;
  let tier: RecencyTier;
  if (ageHours <= 6) {
    score = 1;
    tier = 'hoje';
  } else if (ageHours <= 24) {
    score = 0.95;
    tier = 'hoje';
  } else if (ageHours <= 72) {
    score = 0.85;
    tier = 'esta_semana';
  } else if (ageHours <= 168) {
    score = 0.7;
    tier = 'esta_semana';
  } else if (ageHours <= 336) {
    score = 0.55;
    tier = 'este_mes';
  } else if (ageHours <= 720) {
    score = 0.4;
    tier = 'este_mes';
  } else if (ageHours <= 1440) {
    score = 0.22;
    tier = 'antigo';
  } else {
    score = 0.1;
    tier = 'antigo';
  }

  return { score, tier, label: humanizeAge(ageHours), ageHours };
}

function humanizeAge(ageHours: number): string {
  if (ageHours < 1) return 'publicada agora';
  if (ageHours < 2) return 'há 1 hora';
  if (ageHours < 24) return `há ${Math.floor(ageHours)} horas`;

  const days = Math.floor(ageHours / 24);
  if (days === 1) return 'há 1 dia';
  if (days < 30) return `há ${days} dias`;

  const months = Math.floor(days / 30);
  if (months === 1) return 'há 1 mês';
  if (months < 12) return `há ${months} meses`;

  const years = Math.floor(months / 12);
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}

export type RelevanceTier = 'muito_alta' | 'alta' | 'media' | 'baixa';

export const RELEVANCE_TIER_LABEL: Record<RelevanceTier, string> = {
  muito_alta: 'Muito alta',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export interface RelevanceInput {
  /** Melhor score determinístico entre os currículos (0..100). */
  matchScore: number;
  publishedAt: string | null | undefined;
  now?: number;
}

export interface RelevanceResult {
  score: number;
  tier: RelevanceTier;
  recency: RecencyInfo;
  /** Composição exibida ao usuário. */
  parts: Array<{ label: string; value: number; weight: number }>;
}

export function relevanceScore(input: RelevanceInput): RelevanceResult {
  const recency = recencyInfo(input.publishedAt, input.now ?? Date.now());
  const match = Math.min(100, Math.max(0, input.matchScore));

  const score = Math.round(match * RELEVANCE_WEIGHTS.match + recency.score * 100 * RELEVANCE_WEIGHTS.recency);

  const tier: RelevanceTier = score >= 85 ? 'muito_alta' : score >= 70 ? 'alta' : score >= 50 ? 'media' : 'baixa';

  return {
    score: Math.min(100, Math.max(0, score)),
    tier,
    recency,
    parts: [
      { label: 'Aderência ao perfil', value: match, weight: RELEVANCE_WEIGHTS.match },
      { label: 'Recência da publicação', value: Math.round(recency.score * 100), weight: RELEVANCE_WEIGHTS.recency },
    ],
  };
}

export interface MatchExplanation {
  /** Requisitos atendidos, para a lista de ✓. */
  strengths: string[];
  /** Requisitos ausentes, para a lista de !. */
  gaps: string[];
  /** Frase de abertura da recomendação. */
  headline: string;
}

/**
 * Transforma o match determinístico em explicação legível (§25).
 * Nenhuma recomendação aparece apenas como número.
 */
export function explainMatch(match: Pick<ResumeMatch, 'score' | 'matchedSkills' | 'partialSkills' | 'missingSkills' | 'breakdown' | 'resumeName'>): MatchExplanation {
  const strengths = [...match.matchedSkills];
  const gaps = [...match.missingSkills];

  const strongComponents = match.breakdown
    .filter((item) => item.weight > 0 && item.points / item.weight >= 0.8)
    .map((item) => item.label);

  let headline: string;
  if (match.score >= 85) {
    headline = `Compatibilidade muito alta com "${match.resumeName}"`;
  } else if (match.score >= 70) {
    headline = `Boa compatibilidade com "${match.resumeName}"`;
  } else if (match.score >= 50) {
    headline = `Compatibilidade parcial com "${match.resumeName}"`;
  } else {
    headline = `Baixa compatibilidade com "${match.resumeName}"`;
  }

  const reasons: string[] = [];
  if (strengths.length > 0) reasons.push(`${strengths.length} requisito(s) atendido(s)`);
  if (strongComponents.length > 0) reasons.push(`destaque em ${strongComponents.slice(0, 2).join(' e ').toLowerCase()}`);
  if (gaps.length > 0) reasons.push(`${gaps.length} lacuna(s)`);

  return {
    strengths: strengths.slice(0, 12),
    gaps: gaps.slice(0, 12),
    headline: reasons.length > 0 ? `${headline}: ${reasons.join(', ')}.` : `${headline}.`,
  };
}
