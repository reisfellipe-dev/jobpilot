/**
 * Prompt: camada semantica do matching hibrido (§22).
 *
 * O score base ja foi calculado de forma deterministica. A IA NAO recalcula o
 * score: ela apenas propoe um ajuste limitado a +/-10 pontos e justifica.
 * Uma unica chamada avalia todos os curriculos - menos custo e comparacao real.
 */
import { z } from 'zod';
import { semanticAssessmentSchema } from '../../../../shared/schemas/job';
import type { JobAnalysis, ResumeMatch } from '../../../../shared/schemas/job';
import type { Job } from '../../../../shared/schemas/job';
import type { Resume } from '../../../../shared/schemas/resume';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY } from './policy';
import { buildAnalysisContext, buildJobContext, buildResumeSummary } from './context';

export const semanticMatchSchema = z.object({
  assessments: z
    .array(semanticAssessmentSchema.extend({ resumeId: z.string().max(64) }))
    .max(10)
    .default([]),
  recommendedResumeId: z.string().max(64).nullable().default(null),
  recommendationReason: z.string().max(1200).default(''),
});
export type SemanticMatchResult = z.infer<typeof semanticMatchSchema>;

const SCHEMA_HINT = `{
  "assessments": [{
    "resumeId": string,
    "adjustment": number,          // inteiro entre -10 e 10
    "rationale": string,
    "strengths": string[],
    "gaps": string[],
    "risks": string[],
    "recommendation": "aplicar"|"aplicar_com_ajustes"|"avaliar"|"nao_recomendado",
    "recommendationReason": string
  }],
  "recommendedResumeId": string | null,
  "recommendationReason": string
}`;

function summarizeBreakdown(match: ResumeMatch): string {
  const parts = match.breakdown.map((item) => `${item.label} ${item.points}/${item.weight}`);
  const missing = match.missingSkills.slice(0, 12);
  return [
    `- resumeId: ${match.resumeId} | nome: ${match.resumeName} | score base: ${match.score}/100`,
    `  componentes: ${parts.join(' · ')}`,
    `  atendidos: ${match.matchedSkills.slice(0, 15).join(', ') || 'nenhum'}`,
    `  parciais: ${match.partialSkills.slice(0, 10).join(', ') || 'nenhum'}`,
    `  ausentes: ${missing.join(', ') || 'nenhum'}`,
  ].join('\n');
}

export function buildSemanticMatchPrompt(
  job: Job,
  analysis: JobAnalysis,
  matches: ResumeMatch[],
  resumes: Resume[],
) {
  const byId = new Map(resumes.map((resume) => [resume.id, resume]));

  const system = [
    'Você é um avaliador sênior de aderência entre currículos e vagas.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    '',
    'COMO VOCÊ TRABALHA',
    '- O score base já foi calculado por um algoritmo determinístico e auditável.',
    '- Você NÃO recalcula o score. Você apenas propõe "adjustment": um inteiro de -10 a +10',
    '  que corrige o que o algoritmo não enxerga (contexto, transferibilidade, coerência de carreira).',
    '- Use ajuste positivo quando houver equivalência real não capturada por palavras-chave',
    '  (ex.: a vaga pede "Vue" e o currículo mostra domínio profundo de outro framework SPA moderno).',
    '- Use ajuste negativo quando as palavras batem mas o contexto não sustenta',
    '  (ex.: a tecnologia aparece só em curso, nunca em experiência profissional).',
    '- Se não houver motivo claro, use 0. Ajuste sem justificativa concreta é proibido.',
    '',
    'REGRAS DE CONTEÚDO',
    '- "strengths", "gaps" e "risks" citam apenas fatos presentes no currículo ou na vaga.',
    '- "gaps" descreve o que falta em relação à vaga, sem julgar a pessoa.',
    '- "recommendedResumeId" deve ser um dos resumeId listados, normalmente o de maior potencial final',
    '  (score base + seu ajuste). Explique a escolha comparando com os demais.',
    '- Devolva exatamente um item em "assessments" para CADA resumeId recebido.',
  ].join('\n');

  const resumeBlocks = matches
    .map((match) => {
      const resume = byId.get(match.resumeId);
      return resume ? `${summarizeBreakdown(match)}\n  perfil: ${buildResumeSummary(resume)}` : summarizeBreakdown(match);
    })
    .join('\n\n');

  const user = [
    buildJobContext(job, 4000),
    '',
    buildAnalysisContext(analysis),
    '',
    '=== CURRÍCULOS AVALIADOS (com score determinístico já calculado) ===',
    resumeBlocks,
    '',
    'Avalie cada currículo e indique o mais adequado para esta vaga.',
  ].join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
