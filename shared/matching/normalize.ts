/**
 * Normalizacao textual e canonicalizacao de skills.
 * Puro, deterministico e sem dependencias - base do matching explicavel (§22/§23).
 */

/** Remove acentuacao mantendo o texto legivel. */
export function deburr(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** minusculas + sem acento + espacos colapsados. */
export function normalizeText(value: string): string {
  return deburr(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','um','uma','uns','umas',
  'para','por','com','sem','sobre','ao','aos','à','às','que','se','ou','the','of','and','for','with',
  'to','in','on','at','an','is','are','be','as','by','our','you','your','we','will','have','has',
  'experiencia','experiencias','conhecimento','conhecimentos','vaga','empresa','area','nivel',
  'atuar','atuacao','trabalhar','profissional','desejavel','requisitos','requisito','anos','ano',
]);

/** Tokeniza preservando simbolos relevantes de tecnologia (c#, c++, node.js). */
export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  const raw = normalized.split(/[^a-z0-9+#.]+/g);
  const out: string[] = [];
  for (const token of raw) {
    const cleaned = token.replace(/^[.]+|[.]+$/g, '');
    if (cleaned.length < 2 && !/^[a-z]$/.test(cleaned)) continue;
    if (STOPWORDS.has(cleaned)) continue;
    if (/^\d+$/.test(cleaned)) continue;
    out.push(cleaned);
  }
  return out;
}

export function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Sinonimos e variacoes comuns. Mapeia para uma forma canonica unica
 * para que "ReactJS", "React.js" e "react" contem como a mesma skill.
 */
const SKILL_ALIASES: Record<string, string> = {
  js: 'javascript',
  ecmascript: 'javascript',
  ts: 'typescript',
  reactjs: 'react',
  'react js': 'react',
  'react.js': 'react',
  nextjs: 'next.js',
  'next js': 'next.js',
  vuejs: 'vue',
  'vue.js': 'vue',
  angularjs: 'angular',
  nodejs: 'node.js',
  node: 'node.js',
  'node js': 'node.js',
  nestjs: 'nest.js',
  expressjs: 'express',
  postgres: 'postgresql',
  psql: 'postgresql',
  mongo: 'mongodb',
  ms: 'microsoft',
  'sql server': 'sqlserver',
  mssql: 'sqlserver',
  k8s: 'kubernetes',
  'aws cloud': 'aws',
  'amazon web services': 'aws',
  gcp: 'google cloud',
  'google cloud platform': 'google cloud',
  azuredevops: 'azure devops',
  'ci cd': 'ci/cd',
  cicd: 'ci/cd',
  'c sharp': 'c#',
  csharp: 'c#',
  'c plus plus': 'c++',
  cpp: 'c++',
  golang: 'go',
  'spring boot': 'springboot',
  'spring-boot': 'springboot',
  'react native': 'react-native',
  'rest api': 'rest',
  restful: 'rest',
  'api rest': 'rest',
  html5: 'html',
  css3: 'css',
  scss: 'sass',
  'tailwind css': 'tailwind',
  tailwindcss: 'tailwind',
  'styled components': 'styled-components',
  githubactions: 'github actions',
  'test driven development': 'tdd',
  'unit test': 'testes unitarios',
  'unit tests': 'testes unitarios',
  'testes unitarios': 'testes unitarios',
  jest: 'jest',
  rtl: 'testing-library',
  'react testing library': 'testing-library',
  'design patterns': 'design patterns',
  poo: 'oop',
  'orientacao a objetos': 'oop',
  'programacao orientada a objetos': 'oop',
  'metodologias ageis': 'agile',
  ageis: 'agile',
  scrum: 'scrum',
  'ingles': 'ingles',
  english: 'ingles',
};

/** Forma canonica de uma skill: normalizada, sem ruido e com sinonimos resolvidos. */
export function canonicalSkill(value: string): string {
  let s = normalizeText(value)
    .replace(/\(.*?\)/g, ' ')
    .replace(/[,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(conhecimento em|experiencia com|experiencia em|vivencia em|dominio de|nocoes de)\s+/i, '');
  s = s.replace(/[.]+$/g, '');
  if (SKILL_ALIASES[s]) return SKILL_ALIASES[s] as string;
  const noSpace = s.replace(/\s+/g, '');
  if (SKILL_ALIASES[noSpace]) return SKILL_ALIASES[noSpace] as string;
  return s;
}

export function canonicalSkills(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const c = canonicalSkill(v);
    if (!c || c.length > 60) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Escapa uma string para uso literal dentro de RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Verifica se `needle` aparece como termo inteiro dentro de `haystack` ja normalizado. */
export function containsTerm(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const pattern = new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(needle)}([^a-z0-9+#]|$)`, 'i');
  return pattern.test(haystack);
}

/** Similaridade F1 entre dois conjuntos de tokens (0..1). */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection += 1;
  if (intersection === 0) return 0;
  const precision = intersection / ta.size;
  const recall = intersection / tb.size;
  return (2 * precision * recall) / (precision + recall);
}

/** Converte "AAAA-MM" em indice absoluto de meses. Retorna null se invalido. */
export function monthIndex(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  if (!Number.isFinite(year) || year < 1950 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

export interface DateRange {
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
}

/**
 * Soma de anos de experiencia com uniao de intervalos (evita contar
 * periodos sobrepostos duas vezes). `nowIndex` e injetavel para testes.
 */
export function totalExperienceYears(ranges: DateRange[], nowIndex?: number): number {
  const now = nowIndex ?? currentMonthIndex();
  const intervals: Array<[number, number]> = [];
  for (const range of ranges) {
    const start = monthIndex(range.startDate);
    if (start === null) continue;
    const rawEnd = range.isCurrent ? now : monthIndex(range.endDate) ?? now;
    const end = Math.max(start, Math.min(rawEnd, now));
    intervals.push([start, end]);
  }
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let cursorStart = intervals[0]![0];
  let cursorEnd = intervals[0]![1];
  for (let i = 1; i < intervals.length; i += 1) {
    const [start, end] = intervals[i]!;
    if (start <= cursorEnd + 1) {
      cursorEnd = Math.max(cursorEnd, end);
    } else {
      months += cursorEnd - cursorStart + 1;
      cursorStart = start;
      cursorEnd = end;
    }
  }
  months += cursorEnd - cursorStart + 1;
  return Math.round((months / 12) * 10) / 10;
}

export function currentMonthIndex(date: Date = new Date()): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/** Extrai "3 anos", "5+ anos", "minimo de 2 anos" de um texto livre. */
export function extractMinYears(text: string): number | null {
  const normalized = normalizeText(text);
  const matches = normalized.matchAll(/(\d{1,2})\s*\+?\s*(?:a\s*\d{1,2}\s*)?anos?/g);
  let best: number | null = null;
  for (const match of matches) {
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0 || value > 30) continue;
    if (best === null || value < best) best = value;
  }
  return best;
}
