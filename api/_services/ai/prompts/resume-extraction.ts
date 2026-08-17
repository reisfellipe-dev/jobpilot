/**
 * Prompt: estruturar o texto bruto de um curriculo importado (PDF/DOCX).
 * Objetivo   : transformar texto em dados estruturados sem inventar nada.
 * Contexto   : apenas o texto extraido do arquivo.
 * Restricoes : politica anti-alucinacao; campos ausentes ficam vazios.
 */
import { z } from 'zod';
import { seniaritySchema, stringList } from '../../../../shared/schemas/common';
import { resumeContentSchema } from '../../../../shared/schemas/resume';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY } from './policy';
import { truncate } from './context';
import { MAX_RESUME_TEXT_CHARS } from '../../../../shared/constants';

export const resumeExtractionSchema = z.object({
  content: resumeContentSchema,
  suggestedName: z.string().max(120).default(''),
  suggestedObjective: z.string().max(300).default(''),
  suggestedSeniority: seniaritySchema.nullable().default(null),
  suggestedTargetRoles: stringList(80, 12),
  detectedLanguage: z.string().max(20).default(''),
  missingInfo: z.array(z.string().max(160)).max(20).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

const SCHEMA_HINT = `{
  "content": {
    "fullName": string,
    "headline": string,
    "summary": string,
    "contact": { "email": string, "phone": string, "location": string,
                 "links": [{ "label": string, "url": string }] },
    "experiences": [{
      "company": string, "role": string, "description": string,
      "startDate": "AAAA-MM" | "", "endDate": "AAAA-MM" | "", "isCurrent": boolean,
      "technologies": string[], "achievements": string[], "responsibilities": string[]
    }],
    "education": [{ "institution": string, "degree": string, "field": string,
                    "startDate": "AAAA-MM" | "", "endDate": "AAAA-MM" | "",
                    "status": "concluido" | "cursando" | "trancado" | "incompleto" }],
    "projects": [{ "name": string, "description": string, "technologies": string[],
                   "url": string, "githubUrl": string, "outcomes": string[] }],
    "skills": string[],
    "certifications": [{ "name": string, "issuer": string, "year": string, "url": string }],
    "languages": [{ "name": string,
                    "level": "basico"|"intermediario"|"avancado"|"fluente"|"nativo" }]
  },
  "suggestedName": string,
  "suggestedObjective": string,
  "suggestedSeniority": "estagio"|"trainee"|"junior"|"pleno"|"senior"|"especialista"|"lead"|"gerente"|null,
  "suggestedTargetRoles": string[],
  "detectedLanguage": string,
  "missingInfo": string[],
  "confidence": number
}`;

export function buildResumeExtractionPrompt(rawText: string) {
  const system = [
    'Você é um extrator de dados de currículos. Sua única função é converter o texto',
    'de um currículo em dados estruturados fiéis ao original.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    '',
    'REGRAS ESPECÍFICAS',
    '- Copie os fatos exatamente como estão no texto; corrija apenas acentuação e capitalização óbvias.',
    '- Datas: converta para "AAAA-MM". Se só houver o ano, use "AAAA". Se não houver data, use "".',
    '- "isCurrent" só é true quando o texto indicar explicitamente emprego atual (ex.: "atual", "presente", "till date").',
    '- Não fundir experiências diferentes; não dividir uma experiência em várias.',
    '- "skills" deve conter apenas tecnologias/competências realmente citadas.',
    '- "suggestedSeniority" deve ser inferida SOMENTE do cargo escrito no currículo; se ambíguo, use null.',
    '- "missingInfo" lista blocos importantes que não foram encontrados (ex.: "telefone", "formação").',
    '- "confidence" é sua avaliação (0 a 1) da qualidade do texto de entrada, não da sua criatividade.',
  ].join('\n');

  const user = [
    'Extraia os dados do currículo abaixo.',
    '',
    '=== TEXTO EXTRAÍDO DO ARQUIVO ===',
    truncate(rawText, MAX_RESUME_TEXT_CHARS),
  ].join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
