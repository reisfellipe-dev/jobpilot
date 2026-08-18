/**
 * Prompt: transformar a descricao colada de uma vaga em campos estruturados (§20).
 * Nunca inventa empresa, beneficio ou requisito que nao esteja no texto.
 */
import { z } from 'zod';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY } from './policy.js';
import { truncate } from './context.js';
import { MAX_JOB_TEXT_CHARS } from '../../../../shared/constants.js';

export const jobExtractionSchema = z.object({
  company: z.string().max(160).default(''),
  title: z.string().max(180).default(''),
  location: z.string().max(160).default(''),
  workMode: z.enum(['remoto', 'hibrido', 'presencial', 'indefinido']).default('indefinido'),
  seniority: z
    .enum(['estagio', 'trainee', 'junior', 'pleno', 'senior', 'especialista', 'lead', 'gerente', 'indefinido'])
    .default('indefinido'),
  requirements: z.array(z.string().max(400)).max(40).default([]),
  niceToHave: z.array(z.string().max(400)).max(30).default([]),
  technologies: z.array(z.string().max(60)).max(60).default([]),
  benefits: z.array(z.string().max(200)).max(30).default([]),
  salaryRange: z.string().max(120).default(''),
  missingInfo: z.array(z.string().max(160)).max(20).default([]),
});
export type JobExtraction = z.infer<typeof jobExtractionSchema>;

const SCHEMA_HINT = `{
  "company": string,
  "title": string,
  "location": string,
  "workMode": "remoto"|"hibrido"|"presencial"|"indefinido",
  "seniority": "estagio"|"trainee"|"junior"|"pleno"|"senior"|"especialista"|"lead"|"gerente"|"indefinido",
  "requirements": string[],
  "niceToHave": string[],
  "technologies": string[],
  "benefits": string[],
  "salaryRange": string,
  "missingInfo": string[]
}`;

export function buildJobExtractionPrompt(rawText: string) {
  const system = [
    'Você estrutura descrições de vagas de emprego em dados objetivos.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    '',
    'REGRAS ESPECÍFICAS',
    '- "requirements" = exigências obrigatórias. "niceToHave" = diferenciais/desejáveis.',
    '- Separe cada requisito em um item curto e autônomo (uma exigência por item).',
    '- "technologies" contém apenas nomes de tecnologias, linguagens, frameworks ou ferramentas.',
    '- "workMode" e "seniority" só saem de "indefinido" quando o texto for explícito.',
    '- "salaryRange" apenas se houver valor no texto; caso contrário "".',
    '- "missingInfo" lista o que a vaga não informou (ex.: "salário", "modalidade").',
  ].join('\n');

  const user = ['Estruture a vaga abaixo.', '', '=== TEXTO DA VAGA ===', truncate(rawText, MAX_JOB_TEXT_CHARS)].join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
