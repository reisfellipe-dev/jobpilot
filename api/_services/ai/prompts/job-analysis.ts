/**
 * Prompt: analise completa de vaga (§21).
 * Saida usada tanto pela UI quanto como insumo do score deterministico.
 */
import { jobAnalysisSchema } from '../../../../shared/schemas/job.js';
import type { Job } from '../../../../shared/schemas/job.js';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY } from './policy.js';
import { buildJobContext } from './context.js';

export { jobAnalysisSchema };

const SCHEMA_HINT = `{
  "summary": string,
  "normalizedTitle": string,
  "seniority": "estagio"|"trainee"|"junior"|"pleno"|"senior"|"especialista"|"lead"|"gerente"|"indefinido",
  "workMode": "remoto"|"hibrido"|"presencial"|"indefinido",
  "location": string,
  "responsibilities": string[],
  "requiredSkills": string[],
  "preferredSkills": string[],
  "technologies": string[],
  "softSkills": string[],
  "keywords": string[],
  "benefits": string[],
  "minYearsExperience": number | null,
  "atsNotes": string[],
  "redFlags": string[]
}`;

export function buildJobAnalysisPrompt(job: Job) {
  const system = [
    'Você é um analista técnico de vagas. Extrai a estrutura real da vaga para que um',
    'sistema de matching possa comparar candidatos de forma objetiva.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    '',
    'REGRAS ESPECÍFICAS',
    '- "requiredSkills" e "preferredSkills" devem conter TERMOS CURTOS e comparáveis',
    '  (ex.: "React", "TypeScript", "AWS"), não frases inteiras. Máximo 4 palavras por item.',
    '- Separe corretamente obrigatório de desejável. Se a vaga não distinguir, trate como obrigatório.',
    '- "keywords" = termos que um filtro ATS provavelmente buscaria neste currículo.',
    '- "minYearsExperience" só é preenchido se a vaga citar um tempo mínimo; senão null.',
    '- "atsNotes" = orientações práticas para o currículo passar em triagem automática.',
    '- "redFlags" = sinais de alerta objetivos presentes no texto (ex.: escopo incompatível com o nível,',
    '  exigências contraditórias, ausência total de informação sobre remuneração). Não especule sobre a empresa.',
    '- "summary" tem no máximo 4 frases.',
  ].join('\n');

  const user = ['Analise a vaga abaixo.', '', buildJobContext(job)].join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
