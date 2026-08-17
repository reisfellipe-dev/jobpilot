/**
 * ApplicationFieldMapper (§18, §19, §20).
 *
 * Converte a pergunta de um formulário de candidatura em uma resposta baseada
 * no perfil — e, principalmente, sabe quando NÃO sabe.
 *
 * Cada campo recebe um estado:
 *   KNOWN         → o dado existe no perfil, textualmente.
 *   INFERRED      → foi calculado ou deduzido; o usuário deve conferir.
 *   UNKNOWN       → não há base no perfil para responder.
 *   USER_REQUIRED → só o usuário pode responder (visto, pretensão, upload).
 *
 * Nada aqui inventa resposta. Pergunta sem base vira revisão obrigatória.
 */
import { canonicalSkill, containsTerm, normalizeText, totalExperienceYears } from '../../../shared/matching/normalize';
import { TECH_VOCABULARY } from '../../../shared/discovery/vocabulary';
import type { ApplicationFieldPlan } from '../../../shared/discovery/schemas';
import type { DataState } from '../../../shared/discovery/types';

export interface MapperProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  links: Array<{ label: string; url: string }>;
  skills: string[];
  experiences: Array<{ startDate?: string | null; endDate?: string | null; isCurrent?: boolean }>;
  desiredRoles: string[];
  seniority: string | null;
}

export interface QuestionInput {
  key: string;
  label: string;
  required: boolean;
  type: string;
  options?: string[];
  description?: string | null;
}

/** Chave estável para reaproveitar respostas já revisadas pelo usuário. */
export function questionKey(label: string): string {
  return normalizeText(label).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function findLink(profile: MapperProfile, ...needles: string[]): string {
  for (const link of profile.links) {
    const haystack = `${normalizeText(link.label)} ${normalizeText(link.url)}`;
    if (needles.some((needle) => haystack.includes(needle))) return link.url;
  }
  return '';
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

interface Rule {
  id: string;
  /** Reconhece a pergunta pelo rótulo normalizado. */
  match: (label: string, question: QuestionInput) => boolean;
  resolve: (profile: MapperProfile, question: QuestionInput) => Omit<ApplicationFieldPlan, 'key' | 'label' | 'required' | 'type' | 'options'>;
}

const value = (
  state: DataState,
  text: string,
  origin: string,
  note = '',
): Omit<ApplicationFieldPlan, 'key' | 'label' | 'required' | 'type' | 'options'> => ({
  state,
  value: text,
  origin,
  note,
});

/** Perguntas que só o usuário pode responder — nunca preenchidas por dedução. */
const USER_ONLY_PATTERNS: Array<{ patterns: RegExp[]; note: string }> = [
  {
    patterns: [/visa|sponsor|work authorization|autoriza[cç][aã]o (de|para) trabalh|elegib/i, /permiss[aã]o de trabalho/i],
    note: 'Depende da sua situação legal — o perfil não guarda esse dado.',
  },
  {
    patterns: [/pretens[aã]o|expectativa salarial|salary expectation|desired salary|remunera[cç][aã]o pretendida/i],
    note: 'O JobPilot não estima salário (§21). Informe o valor que você considera adequado.',
  },
  {
    patterns: [/how did you hear|como (voc[eê] )?(nos )?conheceu|onde (voc[eê] )?viu/i],
    note: 'Só você sabe por onde chegou à vaga.',
  },
  {
    patterns: [/notice period|aviso pr[eé]vio|disponibilidade para in[ií]cio|start date|quando pode come[cç]ar/i],
    note: 'Depende da sua disponibilidade atual.',
  },
  {
    patterns: [/g[eê]nero|gender|ra[cç]a|ethnicity|defici[eê]ncia|disability|veteran|orienta[cç][aã]o sexual/i],
    note: 'Dado sensível de autodeclaração. O JobPilot não armazena nem preenche esse tipo de informação.',
  },
  {
    patterns: [/resume|curr[ií]culo|cv\b|attach|upload|anexo/i],
    note: 'O envio do arquivo é feito por você na plataforma — use o currículo recomendado.',
  },
];

const RULES: Rule[] = [
  {
    id: 'first_name',
    match: (label) => /^(first name|nome|primeiro nome|given name)$/.test(label) || /\bfirst name\b/.test(label),
    resolve: (profile) => {
      const { first } = splitName(profile.fullName);
      return first
        ? value('KNOWN', first, 'perfil.nome')
        : value('UNKNOWN', '', 'perfil.nome', 'Preencha seu nome no perfil.');
    },
  },
  {
    id: 'last_name',
    match: (label) => /^(last name|sobrenome|surname|family name)$/.test(label) || /\blast name\b/.test(label),
    resolve: (profile) => {
      const { last } = splitName(profile.fullName);
      return last
        ? value('KNOWN', last, 'perfil.nome')
        : value('UNKNOWN', '', 'perfil.nome', 'Cadastre seu nome completo no perfil.');
    },
  },
  {
    id: 'full_name',
    match: (label) => /^(full name|nome completo|name|seu nome)$/.test(label),
    resolve: (profile) =>
      profile.fullName
        ? value('KNOWN', profile.fullName, 'perfil.nome')
        : value('UNKNOWN', '', 'perfil.nome', 'Preencha seu nome no perfil.'),
  },
  {
    id: 'email',
    match: (label) => /\b(e-?mail)\b/.test(label),
    resolve: (profile) =>
      profile.email
        ? value('KNOWN', profile.email, 'perfil.email')
        : value('UNKNOWN', '', 'perfil.email', 'Cadastre seu e-mail no perfil.'),
  },
  {
    id: 'phone',
    match: (label) => /\b(phone|telefone|celular|mobile|whatsapp|contato)\b/.test(label),
    resolve: (profile) =>
      profile.phone
        ? value('KNOWN', profile.phone, 'perfil.telefone')
        : value('UNKNOWN', '', 'perfil.telefone', 'Cadastre seu telefone no perfil.'),
  },
  {
    id: 'linkedin',
    match: (label) => /linkedin/.test(label),
    resolve: (profile) => {
      const url = findLink(profile, 'linkedin');
      return url
        ? value('KNOWN', url, 'perfil.links')
        : value('UNKNOWN', '', 'perfil.links', 'Adicione seu LinkedIn nos links do perfil.');
    },
  },
  {
    id: 'github',
    match: (label) => /github|reposit[oó]rio|portfolio de c[oó]digo/.test(label),
    resolve: (profile) => {
      const url = findLink(profile, 'github');
      return url
        ? value('KNOWN', url, 'perfil.links')
        : value('UNKNOWN', '', 'perfil.links', 'Adicione seu GitHub nos links do perfil.');
    },
  },
  {
    id: 'portfolio',
    match: (label) => /portfolio|website|site pessoal|personal site/.test(label),
    resolve: (profile) => {
      const url = findLink(profile, 'portfolio', 'site', 'behance', 'dribbble') || findLink(profile, 'http');
      return url
        ? value('KNOWN', url, 'perfil.links')
        : value('UNKNOWN', '', 'perfil.links', 'Nenhum site pessoal cadastrado.');
    },
  },
  {
    id: 'location',
    match: (label) => /\b(location|localiza[cç][aã]o|cidade|city|onde (voc[eê] )?mora|endere[cç]o)\b/.test(label),
    resolve: (profile) =>
      profile.location
        ? value('KNOWN', profile.location, 'perfil.localizacao')
        : value('UNKNOWN', '', 'perfil.localizacao', 'Cadastre sua localização no perfil.'),
  },
  {
    id: 'years_experience',
    match: (label) =>
      /(years? of (professional )?experience|anos de experi[eê]ncia|tempo de experi[eê]ncia)/.test(label),
    resolve: (profile) => {
      const years = totalExperienceYears(profile.experiences);
      if (years <= 0) {
        return value(
          'UNKNOWN',
          '',
          'calculado',
          'Não foi possível calcular: suas experiências não têm datas preenchidas.',
        );
      }
      const rounded = Math.floor(years);
      return value(
        'INFERRED',
        String(rounded),
        'calculado a partir das datas das experiências',
        `Cálculo: ${years} ano(s) somando períodos sem sobreposição. Confira antes de enviar.`,
      );
    },
  },
  {
    id: 'current_company',
    match: (label) => /(current (company|employer)|empresa atual)/.test(label),
    resolve: () => value('USER_REQUIRED', '', 'perfil.experiencias', 'Confirme qual empresa deseja informar.'),
  },
  {
    id: 'headline',
    match: (label) => /(headline|t[ií]tulo profissional|cargo atual|current title)/.test(label),
    resolve: (profile) =>
      profile.headline
        ? value('KNOWN', profile.headline, 'perfil.headline')
        : value('UNKNOWN', '', 'perfil.headline', 'Cadastre seu headline no perfil.'),
  },
];

/** "Você tem experiência com X?" → consulta o perfil (§19). */
const EXPERIENCE_QUESTION = /(experi[eê]ncia|experience|conhecimento|familiar|worked with|trabalhou com|domina)/i;

function detectTechnology(label: string): string | null {
  const normalized = normalizeText(label);
  for (const tech of TECH_VOCABULARY) {
    if (tech.length < 2) continue;
    if (containsTerm(normalized, tech)) return tech;
  }
  return null;
}

function resolveSkillQuestion(
  profile: MapperProfile,
  label: string,
  question: QuestionInput,
): Omit<ApplicationFieldPlan, 'key' | 'label' | 'required' | 'type' | 'options'> | null {
  if (!EXPERIENCE_QUESTION.test(label)) return null;

  const tech = detectTechnology(label);
  if (!tech) return null;

  const profileSkills = new Set(profile.skills.map(canonicalSkill));
  const yesOption = question.options?.find((option) => /^(sim|yes|y)$/i.test(option.trim()));
  const noOption = question.options?.find((option) => /^(n[aã]o|no|n)$/i.test(option.trim()));

  if (profileSkills.has(tech)) {
    return value(
      'KNOWN',
      yesOption ?? 'Sim',
      'perfil.skills',
      `"${tech}" consta nas suas competências.`,
    );
  }

  // Ausência no perfil não é prova de ausência na vida real: marcamos como
  // dedução, com o motivo explícito, para o usuário decidir.
  return value(
    'INFERRED',
    noOption ?? 'Não',
    'ausência no perfil',
    `"${tech}" não consta no seu perfil. Se você tem essa experiência, cadastre-a e gere de novo.`,
  );
}

function matchUserOnly(label: string): string | null {
  for (const entry of USER_ONLY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(label))) return entry.note;
  }
  return null;
}

export interface MapOptions {
  /** Respostas já revisadas anteriormente, reaproveitadas por rótulo. */
  savedAnswers?: Map<string, string>;
}

/** Mapeia uma pergunta para uma resposta com estado explícito. */
export function mapQuestion(
  question: QuestionInput,
  profile: MapperProfile,
  options: MapOptions = {},
): ApplicationFieldPlan {
  const label = normalizeText(question.label);
  const key = questionKey(question.label);
  const base = {
    key,
    label: question.label,
    required: question.required,
    type: question.type,
    options: question.options ?? [],
  };

  // 1. Resposta salva pelo usuário vence qualquer heurística.
  const saved = options.savedAnswers?.get(key);
  if (saved) {
    return { ...base, ...value('KNOWN', saved, 'resposta salva', 'Você já respondeu isso antes.') };
  }

  // 2. Perguntas que só o usuário pode responder.
  const userOnlyNote = matchUserOnly(label);
  if (userOnlyNote) {
    return { ...base, ...value('USER_REQUIRED', '', 'usuário', userOnlyNote) };
  }

  // 3. Regras de campo direto.
  for (const rule of RULES) {
    if (rule.match(label, question)) {
      return { ...base, ...rule.resolve(profile, question) };
    }
  }

  // 4. Perguntas sobre experiência com tecnologia.
  const skillAnswer = resolveSkillQuestion(profile, label, question);
  if (skillAnswer) return { ...base, ...skillAnswer };

  // 5. Desconhecida: vai para revisão, nunca para invenção (§18).
  return {
    ...base,
    ...value(
      'USER_REQUIRED',
      '',
      'não mapeado',
      'Pergunta específica desta vaga. O JobPilot não responde por você sem base no perfil.',
    ),
  };
}

/** Conjunto de perguntas usado quando a plataforma não expõe o formulário. */
export const GENERIC_QUESTIONS: QuestionInput[] = [
  { key: 'first_name', label: 'Nome', required: true, type: 'input_text' },
  { key: 'last_name', label: 'Sobrenome', required: true, type: 'input_text' },
  { key: 'email', label: 'E-mail', required: true, type: 'input_text' },
  { key: 'phone', label: 'Telefone', required: false, type: 'input_text' },
  { key: 'location', label: 'Localização', required: false, type: 'input_text' },
  { key: 'linkedin', label: 'LinkedIn', required: false, type: 'input_text' },
  { key: 'github', label: 'GitHub', required: false, type: 'input_text' },
  { key: 'resume', label: 'Currículo (anexo)', required: true, type: 'input_file' },
];

export function mapQuestions(
  questions: QuestionInput[],
  profile: MapperProfile,
  options: MapOptions = {},
): ApplicationFieldPlan[] {
  const seen = new Set<string>();
  const plans: ApplicationFieldPlan[] = [];

  for (const question of questions) {
    if (!question.label?.trim()) continue;
    const plan = mapQuestion(question, profile, options);
    if (seen.has(plan.key)) continue;
    seen.add(plan.key);
    plans.push(plan);
  }

  return plans;
}
