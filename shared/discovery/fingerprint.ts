/**
 * Deduplicação de vagas (§13).
 *
 * A mesma vaga aparece no site da empresa, no ATS e em agregadores. O JobPilot
 * guarda UMA vaga e preserva todas as URLs de origem.
 *
 * Duas camadas:
 *  1. impressão digital exata — empresa + cargo + local, todos normalizados;
 *  2. similaridade — mesma empresa e títulos equivalentes ("Sr." x "Senior").
 *
 * Sem dependência de Node: roda no servidor, no navegador e nos testes.
 */
import { normalizeText, tokenSimilarity } from '../matching/normalize.js';

/** Sufixos societários que não distinguem empresas. */
const COMPANY_SUFFIXES = [
  'ltda', 'ltda.', 's.a.', 'sa', 's/a', 'me', 'epp', 'eireli', 'inc', 'inc.', 'llc',
  'corp', 'corp.', 'corporation', 'co', 'co.', 'gmbh', 'bv', 'nv', 'plc', 'ag',
  'holding', 'holdings', 'group', 'grupo', 'tecnologia', 'technologies', 'technology',
  'solutions', 'solucoes', 'systems', 'sistemas', 'software', 'labs', 'digital',
];

/** Abreviações que precisam virar a forma extensa antes de comparar títulos. */
const TITLE_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bsr\.?\b/gi, 'senior'],
  [/\bjr\.?\b/gi, 'junior'],
  [/\bpl\.?\b/gi, 'pleno'],
  [/\beng\.?\b/gi, 'engineer'],
  [/\bdev\.?\b/gi, 'developer'],
  [/\bdesenvolvedora?\b/gi, 'developer'],
  [/\bengenheir[ao]\b/gi, 'engineer'],
  [/\bpessoa desenvolvedora\b/gi, 'developer'],
  [/\bfront[- ]?end\b/gi, 'frontend'],
  [/\bback[- ]?end\b/gi, 'backend'],
  [/\bfull[- ]?stack\b/gi, 'fullstack'],
  [/\breact\.?js\b/gi, 'react'],
  [/\bnode\.?js\b/gi, 'node'],
  [/\bi{3}\b/gi, 'senior'],
  [/\bii\b/gi, 'pleno'],
];

/** Nome de empresa comparável: sem acento, sem pontuação e sem sufixo societário. */
export function normalizeCompanyName(name: string): string {
  let value = normalizeText(name)
    .replace(/[.,/\\|@()[\]]/g, ' ')
    .replace(/&/g, ' e ')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return value;
}

/** Título comparável: abreviações expandidas, sem parênteses nem local anexado. */
export function normalizeJobTitle(title: string): string {
  let value = title;
  for (const [pattern, replacement] of TITLE_EXPANSIONS) value = value.replace(pattern, replacement);

  return normalizeText(value)
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    // Remove sufixos de local: "Developer - São Paulo", "Developer | Remote".
    .replace(/\s+[-|–—/]\s+.*$/, '')
    .replace(/[^a-z0-9+#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduz o local a um agrupador estável. Vagas remotas caem todas no mesmo
 * balde, senão "Remote - Brazil" e "Remote" viram vagas diferentes.
 */
export function locationBucket(location: string | null | undefined): string {
  const value = normalizeText(location ?? '');
  if (!value) return 'na';
  if (/\bremot|anywhere|home office\b/.test(value)) return 'remote';
  // Primeiro segmento costuma ser a cidade.
  const city = value.split(/[,\-–|/]/)[0]?.trim() ?? '';
  return city.slice(0, 40) || 'na';
}

/** FNV-1a de 64 bits em hexadecimal. Não é criptográfico — serve como chave. */
export function hashKey(input: string): string {
  let high = 0x811c9dc5;
  let low = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    high ^= code;
    low ^= (code * 31 + i) & 0xffffffff;
    high = Math.imul(high, 0x01000193) >>> 0;
    low = Math.imul(low, 0x01000193) >>> 0;
  }
  return (high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0')).slice(0, 16);
}

export interface FingerprintInput {
  title: string;
  company: string;
  location?: string | null;
}

/** Chave de deduplicação estável entre fontes. */
export function buildFingerprint(input: FingerprintInput): string {
  const company = normalizeCompanyName(input.company);
  const title = normalizeJobTitle(input.title);
  const place = locationBucket(input.location ?? null);
  if (!company && !title) return '';
  return hashKey(`${company}::${title}::${place}`);
}

/** Remove parâmetros de rastreamento para comparar URLs de fontes diferentes. */
export function normalizeJobUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.host.toLowerCase().replace(/^www\./, '');
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|gh_src|ref|source|src|trk|referrer|campaign)/i.test(key)) parsed.searchParams.delete(key);
    }
    const query = parsed.searchParams.toString();
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}${query ? `?${query}` : ''}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export interface DuplicateCandidate {
  title: string;
  company: string;
  location?: string | null;
  sourceUrl?: string;
  fingerprint?: string;
}

/** Limite a partir do qual dois títulos da mesma empresa são a mesma vaga. */
export const TITLE_SIMILARITY_THRESHOLD = 0.82;

/**
 * Decide se duas vagas são a mesma. A URL normalizada idêntica é prova direta;
 * fora isso, exige a mesma empresa e títulos suficientemente próximos.
 */
export function isLikelyDuplicate(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) return true;

  if (a.sourceUrl && b.sourceUrl) {
    const urlA = normalizeJobUrl(a.sourceUrl);
    const urlB = normalizeJobUrl(b.sourceUrl);
    if (urlA && urlA === urlB) return true;
  }

  const companyA = normalizeCompanyName(a.company);
  const companyB = normalizeCompanyName(b.company);
  if (!companyA || !companyB || companyA !== companyB) return false;

  const titleA = normalizeJobTitle(a.title);
  const titleB = normalizeJobTitle(b.title);
  if (!titleA || !titleB) return false;

  const sameTitle = titleA === titleB || tokenSimilarity(titleA, titleB) >= TITLE_SIMILARITY_THRESHOLD;
  if (!sameTitle) return false;

  // A checagem de local vale INCLUSIVE para títulos idênticos: a mesma empresa
  // pode abrir a mesma posição em duas cidades, e são duas vagas.
  const placeA = locationBucket(a.location ?? null);
  const placeB = locationBucket(b.location ?? null);
  return placeA === placeB || placeA === 'na' || placeB === 'na';
}

export interface DedupeGroup<T> {
  primary: T;
  duplicates: T[];
}

/**
 * Agrupa vagas equivalentes de um mesmo lote.
 * A primeira ocorrência vira a principal; as demais viram origens adicionais.
 */
export function groupDuplicates<T extends DuplicateCandidate>(items: T[]): Array<DedupeGroup<T>> {
  const groups: Array<DedupeGroup<T>> = [];

  for (const item of items) {
    const existing = groups.find((group) => isLikelyDuplicate(group.primary, item));
    if (existing) existing.duplicates.push(item);
    else groups.push({ primary: item, duplicates: [] });
  }

  return groups;
}
