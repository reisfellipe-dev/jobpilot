/**
 * Detecção de fonte a partir da URL de carreiras (§2, §42).
 *
 * O usuário cola o link da página de vagas de uma empresa e o sistema descobre
 * qual ATS está por trás. Assim nada é adivinhado: se a URL não corresponder a
 * uma integração real, a resposta é honesta e o cadastro não acontece.
 */
import {
  UNSUPPORTED_SOURCE_INFO,
  type SourceKind,
  type UnsupportedSourceInfo,
} from '../../../../shared/discovery/types.js';

export type DetectionResult =
  | { status: 'supported'; kind: SourceKind; identifier: string; label: string; sourceUrl: string }
  | { status: 'unsupported'; info: UnsupportedSourceInfo }
  | { status: 'unknown'; host: string };

interface Pattern {
  kind: SourceKind;
  /** Hosts que identificam o ATS. */
  hosts: RegExp;
  /** Extrai o identificador (board token / slug) da URL. */
  extract: (url: URL) => string;
}

const firstPathSegment = (url: URL): string => url.pathname.split('/').filter(Boolean)[0] ?? '';

const PATTERNS: Pattern[] = [
  {
    kind: 'greenhouse',
    hosts: /(^|\.)greenhouse\.io$/i,
    extract: (url) => {
      // Formato embutido: /embed/job_board?for=TOKEN
      const embedded = url.searchParams.get('for');
      if (embedded) return embedded;
      const segments = url.pathname.split('/').filter(Boolean);
      // boards.greenhouse.io/TOKEN  ·  job-boards.greenhouse.io/TOKEN/jobs/123
      const first = segments[0] ?? '';
      return first === 'embed' ? (segments[1] ?? '') : first;
    },
  },
  {
    kind: 'lever',
    hosts: /(^|\.)lever\.co$/i,
    extract: firstPathSegment,
  },
  {
    kind: 'ashby',
    hosts: /(^|\.)ashbyhq\.com$/i,
    extract: firstPathSegment,
  },
  { kind: 'remotive', hosts: /(^|\.)remotive\.(com|io)$/i, extract: () => '' },
  { kind: 'remoteok', hosts: /(^|\.)remoteok\.(com|io)$/i, extract: () => '' },
  { kind: 'arbeitnow', hosts: /(^|\.)arbeitnow\.com$/i, extract: () => '' },
];

const UNSUPPORTED_HOSTS: Array<{ pattern: RegExp; kind: UnsupportedSourceInfo['kind'] }> = [
  { pattern: /(^|\.)linkedin\.com$/i, kind: 'linkedin' },
  { pattern: /(^|\.)indeed\.(com|com\.br)$/i, kind: 'indeed' },
  { pattern: /(^|\.)gupy\.(io|com\.br)$/i, kind: 'gupy' },
  { pattern: /(^|\.)catho\.com\.br$/i, kind: 'catho' },
  { pattern: /(^|\.)vagas\.com\.br$/i, kind: 'vagas' },
  { pattern: /(^|\.)glassdoor\.(com|com\.br)$/i, kind: 'glassdoor' },
  { pattern: /(^|\.)infojobs\.com\.br$/i, kind: 'infojobs' },
];

/** Nome legível a partir do identificador ("acme-tech" → "Acme Tech"). */
function labelFromIdentifier(identifier: string): string {
  return identifier
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function detectSource(rawUrl: string): DetectionResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { status: 'unknown', host: rawUrl.trim().slice(0, 80) };
  }

  const host = url.host.toLowerCase().replace(/^www\./, '');

  for (const entry of UNSUPPORTED_HOSTS) {
    if (entry.pattern.test(host)) {
      const info = UNSUPPORTED_SOURCE_INFO.find((item) => item.kind === entry.kind);
      if (info) return { status: 'unsupported', info };
    }
  }

  for (const pattern of PATTERNS) {
    if (!pattern.hosts.test(host)) continue;

    const identifier = pattern.extract(url).trim();
    // Agregadores não precisam de identificador.
    if (!identifier && (pattern.kind === 'remotive' || pattern.kind === 'remoteok' || pattern.kind === 'arbeitnow')) {
      return {
        status: 'supported',
        kind: pattern.kind,
        identifier: '',
        label: pattern.kind,
        sourceUrl: url.origin,
      };
    }
    if (!identifier) continue;

    return {
      status: 'supported',
      kind: pattern.kind,
      identifier,
      label: labelFromIdentifier(identifier),
      sourceUrl: url.toString().slice(0, 500),
    };
  }

  return { status: 'unknown', host };
}

/** Mensagem para host não reconhecido — sem prometer suporte futuro específico. */
export function unknownHostMessage(host: string): string {
  return (
    `Não foi possível identificar um ATS com integração pública em "${host}". ` +
    'O JobPilot integra hoje Greenhouse, Lever e Ashby. Se a empresa usa um deles, ' +
    'cole a URL do quadro de vagas (ex.: boards.greenhouse.io/empresa, jobs.lever.co/empresa, ' +
    'jobs.ashbyhq.com/empresa). Caso contrário, você ainda pode cadastrar a vaga manualmente.'
  );
}
