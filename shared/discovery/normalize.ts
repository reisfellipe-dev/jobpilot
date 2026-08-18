/**
 * Normalizador: RawJob (formato da fonte) → NormalizedJob (formato do JobPilot).
 *
 * Regras invioláveis (§3, §4, §21):
 *  - informação ausente na fonte permanece `null`, nunca vira estimativa;
 *  - tudo que o sistema deduz do texto é marcado como `inferred`;
 *  - salário só existe se a fonte informou. A IA jamais preenche este campo.
 *
 * Puro e determinístico: mesma entrada, mesma saída. Coberto por testes.
 */
import { canonicalSkill, canonicalSkills, containsTerm, normalizeText, tokenize } from '../matching/normalize.js';
import { toPlainText } from './html.js';
import type { FieldOrigins, NormalizedJob, RawJob, SourceKind } from './types.js';
import {
  AMBIGUOUS_TECH_PATTERNS,
  CLOSING_HEADINGS,
  EMPLOYMENT_TYPE_PATTERNS,
  HYBRID_PATTERNS,
  NICE_TO_HAVE_HEADINGS,
  ONSITE_PATTERNS,
  REMOTE_PATTERNS,
  REQUIREMENT_HEADINGS,
  SENIORITY_PATTERNS,
  TECH_VOCABULARY,
} from './vocabulary.js';
import { buildFingerprint } from './fingerprint.js';

const MAX_DESCRIPTION = 30_000;
const MAX_REQUIREMENTS = 40;
const MAX_TECHNOLOGIES = 40;

const VOCABULARY_SET = new Set(TECH_VOCABULARY);

/** Tecnologias citadas no texto. Sempre `inferred` — é dedução, não campo da fonte. */
export function extractTechnologies(text: string, tags: string[] = []): string[] {
  const haystack = normalizeText(text);
  const found: string[] = [];

  // 1. Token a token, canonicalizando: pega variações como "ReactJS" → react.
  for (const token of tokenize(text)) {
    const canonical = canonicalSkill(token);
    if (canonical && VOCABULARY_SET.has(canonical) && !AMBIGUOUS_TECH_PATTERNS[canonical]) {
      found.push(canonical);
    }
  }

  // 2. Termos compostos ("google cloud", "machine learning") não sobrevivem à
  //    tokenização e precisam ser buscados como frase.
  for (const term of TECH_VOCABULARY) {
    const ambiguous = AMBIGUOUS_TECH_PATTERNS[term];
    if (ambiguous) {
      if (ambiguous.test(text)) found.push(term);
      continue;
    }
    if (!term.includes(' ')) continue;
    if (containsTerm(haystack, term)) found.push(term);
  }

  // Tags vêm da fonte e entram mesmo fora do vocabulário conhecido.
  for (const tag of tags) {
    const canonical = canonicalSkill(tag);
    if (canonical && canonical.length >= 2 && canonical.length <= 40) found.push(canonical);
  }

  return canonicalSkills(found).slice(0, MAX_TECHNOLOGIES);
}

/**
 * Senioridade deduzida do título (e, em último caso, do início do texto).
 * Compara sempre sobre texto normalizado — "Sênior" e "senior" são o mesmo.
 */
export function inferSeniority(title: string, description = ''): string | null {
  const normalizedTitle = normalizeText(title);
  for (const entry of SENIORITY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedTitle))) return entry.seniority;
  }

  // O título é o sinal confiável; no corpo, só aceitamos menções explícitas.
  const head = normalizeText(description.slice(0, 600));
  for (const entry of SENIORITY_PATTERNS) {
    // "I"/"II" no corpo do texto geram ruído demais.
    if (entry.seniority === 'junior' || entry.seniority === 'pleno') continue;
    if (entry.patterns.some((pattern) => pattern.test(head))) return entry.seniority;
  }
  return null;
}

export interface WorkModeInference {
  isRemote: boolean | null;
  isHybrid: boolean | null;
  inferred: boolean;
}

/** Modalidade: usa o que a fonte informou; só deduz do texto quando ela cala. */
export function inferWorkMode(
  raw: Pick<RawJob, 'isRemote' | 'isHybrid' | 'location'>,
  title: string,
  description: string,
): WorkModeInference {
  if (typeof raw.isRemote === 'boolean' || typeof raw.isHybrid === 'boolean') {
    return {
      isRemote: raw.isRemote ?? null,
      isHybrid: raw.isHybrid ?? null,
      inferred: false,
    };
  }

  const haystack = `${title} ${raw.location ?? ''} ${description.slice(0, 2000)}`;
  const hybrid = HYBRID_PATTERNS.some((pattern) => pattern.test(haystack));
  if (hybrid) return { isRemote: false, isHybrid: true, inferred: true };

  const remote = REMOTE_PATTERNS.some((pattern) => pattern.test(haystack));
  if (remote) return { isRemote: true, isHybrid: false, inferred: true };

  const onsite = ONSITE_PATTERNS.some((pattern) => pattern.test(haystack));
  if (onsite) return { isRemote: false, isHybrid: false, inferred: true };

  return { isRemote: null, isHybrid: null, inferred: false };
}

export function normalizeEmploymentType(rawValue: string | null | undefined, text = ''): string | null {
  const haystack = `${rawValue ?? ''} ${text.slice(0, 1500)}`;
  if (!haystack.trim()) return null;
  for (const entry of EMPLOYMENT_TYPE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) return entry.type;
  }
  return null;
}

function normalizeHeading(line: string): string {
  return normalizeText(line).replace(/[:•\-–*]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesHeading(line: string, headings: string[]): boolean {
  const normalized = normalizeHeading(line);
  if (!normalized || normalized.length > 80) return false;
  return headings.some((heading) => normalized === heading || normalized.startsWith(`${heading} `) || normalized.startsWith(heading));
}

const BULLET = /^\s*(?:[•·▪◦*\-–—]|\d{1,2}[.)])\s+/;

function cleanBullet(line: string): string {
  return line.replace(BULLET, '').replace(/\s+/g, ' ').trim();
}

export interface ExtractedSections {
  requirements: string[];
  niceToHave: string[];
}

/**
 * Separa requisitos obrigatórios de diferenciais lendo os cabeçalhos do anúncio.
 * Sem cabeçalho reconhecível, todos os bullets viram requisitos — é a leitura
 * mais conservadora e a que o score já trata corretamente.
 */
export function extractSections(description: string): ExtractedSections {
  const lines = description.split('\n');
  const requirements: string[] = [];
  const niceToHave: string[] = [];
  const orphanBullets: string[] = [];

  let section: 'none' | 'required' | 'nice' | 'other' = 'none';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBullet = BULLET.test(trimmed);

    if (!isBullet) {
      if (matchesHeading(trimmed, NICE_TO_HAVE_HEADINGS)) {
        section = 'nice';
        continue;
      }
      if (matchesHeading(trimmed, REQUIREMENT_HEADINGS)) {
        section = 'required';
        continue;
      }
      if (matchesHeading(trimmed, CLOSING_HEADINGS)) {
        section = 'other';
        continue;
      }
      continue;
    }

    const content = cleanBullet(trimmed);
    if (content.length < 3 || content.length > 400) continue;

    if (section === 'required') requirements.push(content);
    else if (section === 'nice') niceToHave.push(content);
    else if (section === 'none') orphanBullets.push(content);
  }

  const finalRequirements = requirements.length > 0 ? requirements : orphanBullets;

  return {
    requirements: dedupeStrings(finalRequirements).slice(0, MAX_REQUIREMENTS),
    niceToHave: dedupeStrings(niceToHave).slice(0, MAX_REQUIREMENTS),
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Data em ISO. Aceita epoch em segundos ou milissegundos e strings de data. */
export function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heurística padrão: valores abaixo de 10^11 são segundos.
    const millis = value < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return toIsoDate(Number(text));

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normaliza uma vaga crua. Nenhum campo é preenchido por suposição. */
export function normalizeRawJob(source: SourceKind, raw: RawJob): NormalizedJob {
  const title = (raw.title ?? '').trim().slice(0, 180);
  const company = (raw.company ?? '').trim().slice(0, 160);

  const description = toPlainText(raw.descriptionText ?? raw.descriptionHtml ?? '').slice(0, MAX_DESCRIPTION);
  const searchable = `${title}\n${description}`;

  const fieldOrigins: FieldOrigins = {};

  // --- Local: só existe se a fonte informou (§3) ---
  const location = (raw.location ?? '').trim() || null;
  fieldOrigins.location = location ? 'source' : 'absent';

  // --- Modalidade ---
  const workMode = inferWorkMode(raw, title, description);
  fieldOrigins.isRemote =
    workMode.isRemote === null ? 'absent' : workMode.inferred ? 'inferred' : 'source';
  fieldOrigins.isHybrid = fieldOrigins.isRemote;

  // --- Senioridade: sempre dedução nossa; nenhuma fonte entrega isso ---
  const seniority = inferSeniority(title, description);
  fieldOrigins.seniority = seniority ? 'inferred' : 'absent';

  // --- Tipo de contratação ---
  const employmentTypeFromSource = normalizeEmploymentType(raw.employmentTypeRaw, '');
  const employmentType = employmentTypeFromSource ?? normalizeEmploymentType(null, searchable);
  fieldOrigins.employmentType = employmentTypeFromSource
    ? 'source'
    : employmentType
      ? 'inferred'
      : 'absent';

  // --- Tecnologias ---
  const technologies = extractTechnologies(searchable, raw.tags ?? []);
  fieldOrigins.technologies = technologies.length > 0 ? 'inferred' : 'absent';

  // --- Requisitos ---
  const sections = extractSections(description);
  fieldOrigins.requirements = sections.requirements.length > 0 ? 'inferred' : 'absent';

  // --- Salário: exclusivamente o que a fonte trouxe (§21) ---
  const salaryText = (raw.salaryText ?? '').trim() || null;
  const salaryMin = typeof raw.salaryMin === 'number' && raw.salaryMin > 0 ? raw.salaryMin : null;
  const salaryMax = typeof raw.salaryMax === 'number' && raw.salaryMax > 0 ? raw.salaryMax : null;
  const hasSalary = Boolean(salaryText || salaryMin || salaryMax);
  fieldOrigins.salary = hasSalary ? 'source' : 'absent';

  const publishedAt = toIsoDate(raw.publishedAt ?? null);
  fieldOrigins.publishedAt = publishedAt ? 'source' : 'absent';

  const sourceUrl = (raw.sourceUrl ?? '').trim();
  const applicationUrl = (raw.applicationUrl ?? '').trim() || sourceUrl;

  return {
    source,
    sourceJobId: String(raw.sourceJobId ?? '').slice(0, 200),
    sourceUrl: sourceUrl.slice(0, 500),
    applicationUrl: applicationUrl.slice(0, 500),
    applicationMethod: raw.applicationMethod ?? 'unknown',

    title,
    company,
    companyUrl: (raw.companyUrl ?? '').trim().slice(0, 500),
    location,
    isRemote: workMode.isRemote,
    isHybrid: workMode.isHybrid,
    employmentType,
    seniority,

    description,
    requirements: sections.requirements,
    niceToHave: sections.niceToHave,
    technologies,

    salary: salaryText,
    salaryMin,
    salaryMax,
    salaryCurrency: (raw.salaryCurrency ?? '').trim() || null,

    publishedAt,
    fingerprint: buildFingerprint({ title, company, location }),
    fieldOrigins,
    raw: raw.raw,
  };
}
