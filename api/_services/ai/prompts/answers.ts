/**
 * Prompt: geracao de textos de candidatura (§26).
 * Um unico construtor parametrizado por tipo de resposta, com instrucoes
 * especificas por tipo e a mesma politica anti-alucinacao.
 */
import type { AnswerKind } from '../../../../shared/constants';
import { generatedAnswerSchema } from '../../../../shared/schemas/application';
import type { Job, JobAnalysis } from '../../../../shared/schemas/job';
import type { Resume } from '../../../../shared/schemas/resume';
import { ANTI_HALLUCINATION_POLICY, LANGUAGE_POLICY, toneInstruction } from './policy';
import { buildAnalysisContext, buildJobContext, buildResumeContext, type ProfileContextInput, buildProfileContext } from './context';

export { generatedAnswerSchema };

const SCHEMA_HINT = `{
  "answer": string,          // o texto final, pronto para copiar
  "missingInfo": string[],   // informações que faltaram no perfil
  "notes": string            // observações curtas para o usuário (opcional)
}`;

interface KindSpec {
  goal: string;
  rules: string[];
  maxTokens: number;
}

const KIND_SPECS: Record<AnswerKind, KindSpec> = {
  cover_letter: {
    goal: 'Escreva uma carta de apresentação para esta vaga.',
    rules: [
      'Entre 3 e 5 parágrafos curtos, no máximo 300 palavras.',
      'Primeiro parágrafo: conexão direta entre a pessoa e a vaga, sem clichê de "sempre fui apaixonado".',
      'Parágrafos do meio: 2 ou 3 evidências concretas já existentes no currículo, ligadas aos requisitos.',
      'Último parágrafo: disponibilidade e próximo passo, sem subserviência.',
      'Não repetir o currículo inteiro nem listar tecnologias em sequência.',
    ],
    maxTokens: 1200,
  },
  recruiter_message: {
    goal: 'Escreva uma mensagem curta para enviar ao recrutador (LinkedIn/e-mail).',
    rules: [
      'No máximo 120 palavras. Deve caber em uma mensagem de LinkedIn.',
      'Comece indicando a vaga de interesse.',
      'Cite no máximo 2 pontos de aderência concretos.',
      'Termine com uma pergunta ou chamada objetiva.',
      'Sem emojis, sem formatação markdown, sem "espero que esteja bem".',
    ],
    maxTokens: 700,
  },
  about_me: {
    goal: 'Responda "fale um pouco sobre você" no contexto desta vaga.',
    rules: [
      'Entre 120 e 200 palavras, em primeira pessoa.',
      'Estrutura: quem é hoje profissionalmente, trajetória relevante, o que busca agora.',
      'Conectar a trajetória ao que a vaga pede, usando apenas fatos do perfil.',
    ],
    maxTokens: 800,
  },
  why_company: {
    goal: 'Responda "por que você quer trabalhar nesta empresa?".',
    rules: [
      'Máximo 150 palavras.',
      'Baseie-se APENAS no que a descrição da vaga revela sobre a empresa (produto, stack, cultura declarada).',
      'É proibido afirmar fatos sobre a empresa que não estejam no texto da vaga.',
      'Se a vaga trouxer pouca informação sobre a empresa, escreva uma resposta honesta focada no escopo da posição',
      'e registre em "missingInfo" que faltam dados sobre a empresa.',
    ],
    maxTokens: 700,
  },
  why_position: {
    goal: 'Responda "por que esta vaga?".',
    rules: [
      'Máximo 150 palavras.',
      'Ligue as responsabilidades da vaga à experiência real da pessoa e ao objetivo de carreira declarado.',
      'Evite adjetivos vazios; use evidências.',
    ],
    maxTokens: 700,
  },
  salary: {
    goal: 'Responda à pergunta sobre pretensão salarial.',
    rules: [
      'NUNCA invente um número. Não existe base salarial no perfil.',
      'Se o perfil ou a vaga trouxerem uma faixa, use exatamente essa informação.',
      'Caso contrário, escreva uma resposta profissional que devolve a pergunta de forma elegante',
      '(alinhamento com a faixa da posição, abertura para negociar considerando o pacote completo)',
      'e registre em "missingInfo" que a pretensão salarial não está definida no perfil.',
      'Máximo 100 palavras.',
    ],
    maxTokens: 600,
  },
  custom: {
    goal: 'Responda à pergunta do processo seletivo informada pelo usuário.',
    rules: [
      'Responda exatamente o que foi perguntado, sem inventar contexto.',
      'Máximo 250 palavras, salvo se a pergunta pedir algo mais curto.',
      'Se a pergunta exigir informação que não existe no perfil, responda com o que existe',
      'e registre a lacuna em "missingInfo".',
    ],
    maxTokens: 900,
  },
};

export function answerMaxTokens(kind: AnswerKind): number {
  return KIND_SPECS[kind].maxTokens;
}

export interface AnswerPromptInput {
  kind: AnswerKind;
  question?: string;
  tone?: string | null;
  job: Job;
  analysis: JobAnalysis | null;
  resume: Resume | null;
  profile: ProfileContextInput;
}

export function buildAnswerPrompt(input: AnswerPromptInput) {
  const spec = KIND_SPECS[input.kind];

  const system = [
    'Você escreve textos de candidatura em nome de uma pessoa real, usando somente o histórico dela.',
    '',
    ANTI_HALLUCINATION_POLICY,
    '',
    LANGUAGE_POLICY,
    toneInstruction(input.tone),
    '',
    'OBJETIVO',
    spec.goal,
    '',
    'REGRAS DESTE TEXTO',
    ...spec.rules.map((rule) => `- ${rule}`),
    '',
    'FORMATO DO TEXTO',
    '- Texto puro, sem markdown, sem títulos, sem bullets (a menos que a pergunta peça).',
    '- Não use placeholders como [empresa] ou [seu nome]: use os dados reais do contexto',
    '  ou omita a menção se o dado estiver AUSENTE.',
    '- Escreva em primeira pessoa.',
  ].join('\n');

  const user = [
    buildJobContext(input.job, 4000),
    input.analysis ? `\n${buildAnalysisContext(input.analysis)}` : '',
    '',
    buildProfileContext(input.profile, { includeContact: false }),
    input.resume ? `\n${buildResumeContext(input.resume)}` : '',
    input.question ? `\n=== PERGUNTA DO PROCESSO ===\n${input.question.slice(0, 2000)}` : '',
    '',
    'Escreva agora o texto pedido.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user, schemaHint: SCHEMA_HINT };
}
