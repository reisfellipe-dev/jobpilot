/**
 * Prompt: adaptacao de curriculo para uma vaga especifica (§24).
 *
 * O resultado NAO e salvo automaticamente: a UI mostra original x adaptado e
 * exige aprovacao explicita do usuario.
 */
import { z } from 'zod';
import { resumeContentSchema } from '../../../../shared/schemas/resume.js';
import type { Resume } from '../../../../shared/schemas/resume.js';
import type { Job, JobAnalysis } from '../../../../shared/schemas/job.js';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY } from './policy.js';
import { buildAnalysisContext, buildJobContext, buildResumeContext } from './context.js';

export const resumeAdaptationSchema = z.object({
  content: resumeContentSchema,
  changes: z
    .array(
      z.object({
        section: z.string().max(120),
        before: z.string().max(2000).default(''),
        after: z.string().max(2000).default(''),
        reason: z.string().max(500).default(''),
      }),
    )
    .max(30)
    .default([]),
  keywordsAdded: z.array(z.string().max(60)).max(40).default([]),
  missingInfo: z.array(z.string().max(200)).max(20).default([]),
  atsScoreNotes: z.array(z.string().max(300)).max(10).default([]),
});
export type ResumeAdaptation = z.infer<typeof resumeAdaptationSchema>;

const SCHEMA_HINT = `{
  "content": { /* mesma estrutura do currículo original, já adaptada */
    "fullName": string, "headline": string, "summary": string,
    "contact": { "email": string, "phone": string, "location": string,
                 "links": [{ "label": string, "url": string }] },
    "experiences": [{ "company": string, "role": string, "description": string,
                      "startDate": string, "endDate": string, "isCurrent": boolean,
                      "technologies": string[], "achievements": string[],
                      "responsibilities": string[] }],
    "education": [{ "institution": string, "degree": string, "field": string,
                    "startDate": string, "endDate": string, "status": string }],
    "projects": [{ "name": string, "description": string, "technologies": string[],
                   "url": string, "githubUrl": string, "outcomes": string[] }],
    "skills": string[],
    "certifications": [{ "name": string, "issuer": string, "year": string, "url": string }],
    "languages": [{ "name": string, "level": string }]
  },
  "changes": [{ "section": string, "before": string, "after": string, "reason": string }],
  "keywordsAdded": string[],
  "missingInfo": string[],
  "atsScoreNotes": string[]
}`;

export function buildResumeAdaptationPrompt(job: Job, analysis: JobAnalysis | null, resume: Resume) {
  const system = [
    'Você adapta currículos existentes para vagas específicas, sem falsificar histórico.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    '',
    'O QUE VOCÊ PODE FAZER',
    '- Reescrever o "summary" para dialogar com a vaga, usando apenas fatos já presentes.',
    '- Reordenar experiências, projetos e skills para destacar o que é relevante à vaga.',
    '- Reordenar e reescrever bullets (achievements/responsibilities) mantendo o significado factual.',
    '- Ajustar vocabulário para casar com as palavras-chave da vaga QUANDO a competência já existir',
    '  no currículo (ex.: currículo diz "React.js", vaga pede "ReactJS" → padronize o termo).',
    '- Promover para o topo a tecnologia que a vaga exige e que a pessoa realmente tem.',
    '',
    'O QUE É PROIBIDO',
    '- Adicionar tecnologia, empresa, cargo, número, métrica ou certificação que não exista no original.',
    '- Alterar datas, nomes de empresas, cargos ou instituições.',
    '- Inflar senioridade ou transformar contato com uma ferramenta em experiência profissional.',
    '- Remover uma experiência inteira (você pode reordenar e resumir, nunca apagar o histórico).',
    '',
    'SAÍDA',
    '- "content" deve conter o currículo COMPLETO adaptado (todas as experiências, na nova ordem).',
    '- "changes" lista cada alteração relevante com o texto antes e depois e o motivo.',
    '- "keywordsAdded" lista termos da vaga que passaram a aparecer porque a competência já existia.',
    '- "missingInfo" lista requisitos da vaga que o currículo não cobre — sem tentar compensá-los.',
  ].join('\n');

  const user = [
    buildJobContext(job, 5000),
    analysis ? `\n${buildAnalysisContext(analysis)}` : '',
    '',
    buildResumeContext(resume),
    '',
    'Adapte o currículo acima para esta vaga respeitando integralmente as regras.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
