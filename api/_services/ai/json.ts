/**
 * Extracao e reparo de JSON produzido por modelos de linguagem.
 * Puro e sem dependencias - coberto por testes unitarios.
 *
 * Modelos frequentemente devolvem: cercas markdown, texto antes/depois,
 * virgulas sobrando, aspas tipograficas ou JSON truncado por limite de tokens.
 */

/** Remove cercas de codigo markdown mantendo apenas o conteudo. */
export function stripCodeFences(input: string): string {
  const text = input.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/;
  const match = fence.exec(text);
  if (match && match[1] !== undefined) return match[1].trim();
  // Cerca aberta sem fechamento (resposta truncada).
  if (text.startsWith('```')) {
    return text.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/```$/, '').trim();
  }
  return text;
}

/**
 * Recorta o primeiro objeto/array JSON balanceado do texto.
 * Se a resposta estiver truncada, fecha os delimitadores pendentes.
 */
export function extractJsonSlice(input: string): { slice: string; autoClosed: boolean } | null {
  const text = stripCodeFences(input);
  const startObject = text.indexOf('{');
  const startArray = text.indexOf('[');
  const candidates = [startObject, startArray].filter((index) => index >= 0);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      continue;
    }
    if (char === '}' || char === ']') {
      const expected = stack.pop();
      if (expected !== char) return null;
      if (stack.length === 0) return { slice: text.slice(start, i + 1), autoClosed: false };
    }
  }

  if (stack.length === 0) return null;

  // Resposta truncada: fecha string aberta e delimitadores pendentes.
  let slice = text.slice(start);
  if (inString) slice += '"';
  slice = slice.replace(/,\s*$/, '');
  while (stack.length > 0) slice += stack.pop();
  return { slice, autoClosed: true };
}

/** Correcoes conservadoras que nao alteram a semantica do JSON valido. */
export function repairJson(input: string): string {
  let text = input;
  // Aspas tipograficas fora de conteudo tecnico.
  text = text
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/ /g, ' ');
  // Comentarios de linha e bloco (invalidos em JSON).
  text = text.replace(/^\s*\/\/.*$/gm, '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Virgulas sobrando antes de fechamento.
  text = text.replace(/,(\s*[}\]])/g, '$1');
  // Valores literais de Python/JS que aparecem por engano.
  text = text.replace(/:\s*None\b/g, ': null').replace(/:\s*(True|False)\b/g, (_m, v: string) => `: ${v.toLowerCase()}`);
  // Quebras de linha cruas dentro de strings sao invalidas; escapa as obvias.
  return text;
}

export interface ParsedJson {
  value: unknown;
  repaired: boolean;
}

/** Tenta obter um valor JSON de um texto arbitrario de LLM. */
export function parseLooseJson(input: string): ParsedJson | null {
  if (!input || !input.trim()) return null;

  const direct = tryParse(stripCodeFences(input));
  if (direct.ok) return { value: direct.value, repaired: false };

  const extracted = extractJsonSlice(input);
  if (!extracted) return null;

  const clean = tryParse(extracted.slice);
  if (clean.ok) return { value: clean.value, repaired: extracted.autoClosed };

  const repaired = tryParse(repairJson(extracted.slice));
  if (repaired.ok) return { value: repaired.value, repaired: true };

  return null;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Resumo curto de erros de validacao, usado para pedir correcao ao modelo. */
export function describeIssues(issues: Array<{ path: (string | number)[]; message: string }>): string {
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');
}
