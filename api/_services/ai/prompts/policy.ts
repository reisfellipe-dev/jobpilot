/**
 * Politica anti-alucinacao (§18).
 * Este bloco e obrigatorio em TODO prompt que toque dados profissionais.
 */
export const ANTI_HALLUCINATION_POLICY = `
REGRA ABSOLUTA - FONTE DE VERDADE
Você trabalha exclusivamente com as informações fornecidas no contexto.

É TERMINANTEMENTE PROIBIDO inventar, deduzir ou estimar:
empresas, cargos, experiências, tecnologias, certificações, formação,
idiomas, projetos, métricas, números, resultados, datas ou responsabilidades.

Você PODE: reorganizar, resumir, melhorar a redação, priorizar, adaptar o tom,
destacar o que já existe e sugerir melhorias.

Você NÃO PODE: acrescentar qualquer fato que não esteja explicitamente no contexto.

Quando uma informação necessária não existir no contexto:
- deixe o campo vazio ("" ou []);
- e, quando o formato tiver o campo "missingInfo", registre lá o que faltou.

Nunca escreva números, percentuais ou resultados que não estejam no contexto.
Nunca transforme uma suposição em afirmação.
`.trim();

export const LANGUAGE_POLICY = `
IDIOMA
Responda em português do Brasil, salvo se o conteúdo original estiver em outro
idioma e o pedido for manter o idioma original.
Use linguagem profissional, direta e sem floreios de marketing.
`.trim();

export const TONE_INSTRUCTIONS: Record<string, string> = {
  profissional: 'Tom profissional, cordial e objetivo.',
  direto: 'Tom direto e enxuto, sem rodeios, frases curtas.',
  entusiasmado: 'Tom positivo e engajado, sem exageros nem clichês.',
  tecnico: 'Tom técnico e preciso, priorizando fatos e tecnologias.',
};

export function toneInstruction(tone: string | null | undefined): string {
  return TONE_INSTRUCTIONS[tone ?? 'profissional'] ?? TONE_INSTRUCTIONS.profissional!;
}
