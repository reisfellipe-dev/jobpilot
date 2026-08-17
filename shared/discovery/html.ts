/**
 * Conversão de HTML de fonte externa em texto puro.
 *
 * SEGURANÇA: o HTML das fontes NUNCA é renderizado. Ele é convertido em texto
 * aqui e daqui em diante circula apenas como string — não existe caminho de
 * código que injete markup de terceiro na interface (§43 da fase 1).
 *
 * Puro, sem DOM: roda igual no servidor e nos testes.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  eacute: 'é',
  ccedil: 'ç',
  atilde: 'ã',
  otilde: 'õ',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ecirc: 'ê',
  ocirc: 'ô',
  agrave: 'à',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * HTML → texto preservando a estrutura de parágrafos e listas.
 * Itens de lista viram linhas iniciadas por "• " para que a extração de
 * requisitos consiga reconhecê-los depois.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';

  let text = input;

  // Blocos que nunca contêm conteúdo útil de vaga.
  text = text.replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // Estrutura → quebras de linha.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|h[1-6]|tr|blockquote)>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<\/(li|ul|ol)>/gi, '\n');
  text = text.replace(/<\/t[dh]>/gi, ' ');

  // Remove o restante das tags.
  text = text.replace(/<[^>]+>/g, ' ');

  text = decodeEntities(text);

  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*•\s*$/gm, '')
    .trim();
}

/** Detecta se a string parece HTML (algumas fontes misturam os dois formatos). */
export function looksLikeHtml(input: string | null | undefined): boolean {
  if (!input) return false;
  return /<\/?(p|div|br|li|ul|ol|h[1-6]|strong|em|span)\b/i.test(input);
}

/** Aceita HTML ou texto e devolve sempre texto. */
export function toPlainText(input: string | null | undefined): string {
  if (!input) return '';
  return looksLikeHtml(input) ? htmlToText(input) : decodeEntities(input).replace(/\n{3,}/g, '\n\n').trim();
}
