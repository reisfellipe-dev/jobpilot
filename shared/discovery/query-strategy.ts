/**
 * Estratégia de busca derivada do perfil (§10).
 *
 * Não se busca "vagas de programação". Constrói-se um conjunto pequeno de
 * termos conceituais a partir de cargos desejados, tecnologias e senioridade.
 * Relevância acima de quantidade: melhor 6 termos certeiros do que 40 genéricos.
 *
 * Determinístico — nenhuma chamada de IA para montar a busca.
 */
import { canonicalSkill, normalizeText, tokenSimilarity } from '../matching/normalize.js';
import type { Seniority, WorkMode } from '../constants.js';

export interface StrategyInput {
  desiredRoles: string[];
  seniority: Seniority | null;
  /** Skills do perfil e dos currículos, já em ordem de importância. */
  skills: string[];
  workModes: WorkMode[];
  location: string;
  desiredLocation: string;
  /** Termos manuais definidos pelo usuário — têm prioridade absoluta. */
  overrideKeywords?: string[];
}

export interface SearchStrategy {
  /** Termos de busca para fontes que aceitam consulta textual. */
  terms: string[];
  /** Palavras usadas no filtro determinístico local (pré-IA). */
  keywords: string[];
  /** Tecnologias canônicas relevantes ao perfil. */
  technologies: string[];
  locations: string[];
  remoteOnly: boolean;
  seniority: Seniority | null;
  /** Explicação legível de como a estratégia foi montada (§25). */
  explanation: string[];
}

const ROLE_TEMPLATES = [
  '{role}',
  '{tech} developer',
  '{role} {tech}',
];

const MAX_TERMS = 8;

/** Papéis genéricos derivados das tecnologias mais fortes do perfil. */
const TECH_ROLE_HINTS: Record<string, string[]> = {
  react: ['frontend developer', 'react developer'],
  'next.js': ['frontend developer', 'react developer'],
  vue: ['frontend developer', 'vue developer'],
  angular: ['frontend developer', 'angular developer'],
  typescript: ['frontend developer', 'fullstack developer'],
  javascript: ['frontend developer', 'fullstack developer'],
  'node.js': ['backend developer', 'node developer'],
  java: ['backend developer', 'java developer'],
  springboot: ['backend developer', 'java developer'],
  python: ['backend developer', 'python developer'],
  django: ['backend developer', 'python developer'],
  php: ['backend developer', 'php developer'],
  laravel: ['backend developer', 'php developer'],
  'c#': ['backend developer', '.net developer'],
  '.net': ['backend developer', '.net developer'],
  go: ['backend developer', 'golang developer'],
  ruby: ['backend developer', 'ruby developer'],
  'react-native': ['mobile developer', 'react native developer'],
  flutter: ['mobile developer', 'flutter developer'],
  android: ['mobile developer', 'android developer'],
  ios: ['mobile developer', 'ios developer'],
  aws: ['devops engineer', 'cloud engineer'],
  kubernetes: ['devops engineer', 'sre'],
  docker: ['devops engineer'],
  terraform: ['devops engineer', 'platform engineer'],
  sql: ['data analyst'],
  'power bi': ['data analyst'],
  spark: ['data engineer'],
  airflow: ['data engineer'],
  'machine learning': ['machine learning engineer', 'data scientist'],
};

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

export function buildSearchStrategy(input: StrategyInput): SearchStrategy {
  const explanation: string[] = [];

  const technologies = dedupe(input.skills.map(canonicalSkill).filter(Boolean)).slice(0, 12);
  const topTechnologies = technologies.slice(0, 4);

  // 1. Termos definidos manualmente vencem qualquer heurística.
  const overrides = dedupe(input.overrideKeywords ?? []);
  if (overrides.length > 0) {
    explanation.push(`Termos definidos por você: ${overrides.join(', ')}.`);
  }

  // 2. Cargos desejados são o sinal mais forte do perfil.
  const roles = dedupe(input.desiredRoles).slice(0, 4);
  if (roles.length > 0) {
    explanation.push(`Cargos desejados no perfil: ${roles.join(', ')}.`);
  }

  // 3. Sem cargo declarado, deduz-se o papel a partir das tecnologias.
  const derivedRoles: string[] = [];
  if (roles.length === 0) {
    for (const tech of topTechnologies) {
      for (const hint of TECH_ROLE_HINTS[tech] ?? []) derivedRoles.push(hint);
    }
    if (derivedRoles.length > 0) {
      explanation.push(
        `Nenhum cargo desejado cadastrado — papéis deduzidos das suas tecnologias: ${dedupe(derivedRoles).slice(0, 3).join(', ')}.`,
      );
    }
  }

  const baseRoles = dedupe([...overrides, ...roles, ...derivedRoles]);

  // 4. Combina papel × tecnologia principal, sem explodir a quantidade.
  const terms: string[] = [];
  for (const role of baseRoles) {
    for (const template of ROLE_TEMPLATES) {
      if (terms.length >= MAX_TERMS) break;
      const tech = topTechnologies[0];
      if (template.includes('{tech}') && !tech) continue;
      const term = template.replace('{role}', role).replace('{tech}', tech ?? '').replace(/\s+/g, ' ').trim();
      if (term && !terms.some((existing) => normalizeText(existing) === normalizeText(term))) terms.push(term);
    }
  }

  if (terms.length === 0 && topTechnologies.length > 0) {
    for (const tech of topTechnologies.slice(0, 3)) terms.push(`${tech} developer`);
    explanation.push('Busca montada apenas a partir das tecnologias, por ausência de cargo-alvo.');
  }

  // 5. Palavras-chave do filtro determinístico: papéis + tecnologias.
  const keywords = dedupe([...baseRoles.flatMap((role) => role.split(/\s+/)), ...technologies]).filter(
    (word) => word.length >= 2,
  );

  const locations = dedupe([input.desiredLocation, input.location].filter(Boolean));
  const remoteOnly = input.workModes.length === 1 && input.workModes[0] === 'remoto';
  if (remoteOnly) explanation.push('Você aceita apenas trabalho remoto — vagas presenciais serão despriorizadas.');
  if (input.seniority) explanation.push(`Senioridade do perfil: ${input.seniority}.`);
  if (explanation.length === 0) {
    explanation.push('Perfil ainda sem cargos ou tecnologias — a busca fica genérica até você completar o perfil.');
  }

  return {
    terms: terms.slice(0, MAX_TERMS),
    keywords: keywords.slice(0, 40),
    technologies,
    locations,
    remoteOnly,
    seniority: input.seniority,
    explanation,
  };
}

export interface PreFilterInput {
  title: string;
  technologies: string[];
  description: string;
}

export interface PreFilterResult {
  keep: boolean;
  reason: string;
  /** Sinal aproximado 0..1, usado só para ordenar a fila pré-matching. */
  affinity: number;
}

/**
 * Filtro determinístico barato (§29, etapa 1).
 * Roda antes de qualquer processamento caro e descarta o que claramente não
 * tem relação com o perfil. Deliberadamente permissivo: é melhor deixar passar
 * uma vaga duvidosa do que descartar uma boa.
 */
export function preFilter(job: PreFilterInput, strategy: SearchStrategy): PreFilterResult {
  if (strategy.terms.length === 0 && strategy.technologies.length === 0) {
    return { keep: true, reason: 'Perfil sem critérios — nada é descartado.', affinity: 0.5 };
  }

  const jobTechnologies = new Set(job.technologies.map(canonicalSkill));
  const sharedTechnologies = strategy.technologies.filter((tech) => jobTechnologies.has(tech));

  const titleAffinity = strategy.terms.reduce(
    (best, term) => Math.max(best, tokenSimilarity(job.title, term)),
    0,
  );

  if (sharedTechnologies.length > 0) {
    return {
      keep: true,
      reason: `Tecnologias em comum: ${sharedTechnologies.slice(0, 4).join(', ')}.`,
      affinity: Math.min(1, 0.5 + sharedTechnologies.length * 0.12 + titleAffinity * 0.3),
    };
  }

  if (titleAffinity >= 0.3) {
    return { keep: true, reason: 'Cargo compatível com os termos da busca.', affinity: titleAffinity };
  }

  // Última chance: menção de alguma tecnologia do perfil no corpo do anúncio.
  const haystack = normalizeText(job.description.slice(0, 4000));
  const mentioned = strategy.technologies.filter((tech) => tech.length > 2 && haystack.includes(tech));
  if (mentioned.length > 0) {
    return {
      keep: true,
      reason: `Menciona ${mentioned.slice(0, 3).join(', ')} na descrição.`,
      affinity: 0.35,
    };
  }

  return { keep: false, reason: 'Sem tecnologias nem cargo relacionados ao perfil.', affinity: 0 };
}
