/**
 * Construtores de contexto minimo (§29).
 * Cada operacao recebe apenas o que precisa - reduz custo, latencia e exposicao
 * de dados pessoais ao provider de IA.
 */
import { MISSING_MARKER } from '../../../../shared/constants.js';
import type { Experience, Profile, Project, Skill } from '../../../../shared/schemas/profile.js';
import type { Resume } from '../../../../shared/schemas/resume.js';
import type { Job } from '../../../../shared/schemas/job.js';
import type { JobAnalysis } from '../../../../shared/schemas/job.js';

function line(label: string, value: string | null | undefined): string {
  const clean = (value ?? '').trim();
  return `${label}: ${clean || MISSING_MARKER}`;
}

function list(label: string, values: string[] | undefined, max = 40): string {
  const items = (values ?? []).filter(Boolean).slice(0, max);
  return `${label}: ${items.length ? items.join(', ') : MISSING_MARKER}`;
}

function period(start?: string | null, end?: string | null, isCurrent?: boolean): string {
  const from = (start ?? '').trim() || MISSING_MARKER;
  const to = isCurrent ? 'atual' : (end ?? '').trim() || MISSING_MARKER;
  return `${from} a ${to}`;
}

export function truncate(text: string, max: number): string {
  const clean = (text ?? '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}\n[...conteúdo truncado para respeitar o limite de contexto...]`;
}

export interface ProfileContextInput {
  profile: Profile;
  experiences: Experience[];
  projects: Project[];
  skills: Skill[];
}

/** Perfil completo - usado em geracao de textos de candidatura. */
export function buildProfileContext(input: ProfileContextInput, options: { includeContact?: boolean } = {}): string {
  const { profile, experiences, projects, skills } = input;
  const parts: string[] = ['=== PERFIL PROFISSIONAL (FONTE DE VERDADE) ==='];

  parts.push(line('Nome', profile.fullName));
  if (options.includeContact) {
    parts.push(line('E-mail', profile.email));
    parts.push(line('Telefone', profile.phone));
  }
  parts.push(line('Localização', profile.location));
  parts.push(line('Headline', profile.headline));
  parts.push(line('Senioridade declarada', profile.seniority ?? ''));
  parts.push(list('Cargos desejados', profile.desiredRoles));
  parts.push(list('Modalidades aceitas', profile.workModes));
  parts.push(line('Resumo', profile.summary));

  parts.push('\n--- EXPERIÊNCIAS ---');
  if (experiences.length === 0) parts.push(MISSING_MARKER);
  for (const exp of experiences.slice(0, 12)) {
    parts.push(
      [
        `• ${exp.role || MISSING_MARKER} — ${exp.company || MISSING_MARKER} (${period(exp.startDate, exp.endDate, exp.isCurrent)})`,
        exp.description ? `  Descrição: ${truncate(exp.description, 700)}` : '',
        exp.technologies.length ? `  Tecnologias: ${exp.technologies.join(', ')}` : '',
        exp.responsibilities.length ? `  Responsabilidades: ${exp.responsibilities.slice(0, 8).join('; ')}` : '',
        exp.achievements.length ? `  Conquistas: ${exp.achievements.slice(0, 8).join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  parts.push('\n--- PROJETOS ---');
  if (projects.length === 0) parts.push(MISSING_MARKER);
  for (const project of projects.slice(0, 10)) {
    parts.push(
      [
        `• ${project.name}`,
        project.description ? `  ${truncate(project.description, 500)}` : '',
        project.technologies.length ? `  Tecnologias: ${project.technologies.join(', ')}` : '',
        project.outcomes.length ? `  Resultados: ${project.outcomes.slice(0, 6).join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  parts.push('\n--- FORMAÇÃO ---');
  if (profile.education.length === 0) parts.push(MISSING_MARKER);
  for (const edu of profile.education.slice(0, 10)) {
    parts.push(
      `• ${edu.degree || MISSING_MARKER} em ${edu.field || MISSING_MARKER} — ${edu.institution} (${period(edu.startDate, edu.endDate)}, ${edu.status})`,
    );
  }

  parts.push('\n--- OUTROS ---');
  parts.push(list('Skills cadastradas', skills.map((skill) => skill.name), 80));
  parts.push(list('Certificações', profile.certifications.map((cert) => cert.name), 30));
  parts.push(list('Idiomas', profile.languages.map((lang) => `${lang.name} (${lang.level})`), 15));

  return parts.join('\n');
}

/** Conteudo de um curriculo especifico. */
export function buildResumeContext(resume: Pick<Resume, 'name' | 'objective' | 'seniority' | 'skills' | 'targetRoles' | 'content'>): string {
  const content = resume.content;
  const parts: string[] = ['=== CURRÍCULO ==='];
  parts.push(line('Nome do currículo', resume.name));
  parts.push(line('Objetivo', resume.objective));
  parts.push(line('Senioridade', resume.seniority ?? ''));
  parts.push(list('Cargos-alvo', resume.targetRoles));
  parts.push(line('Headline', content.headline));
  parts.push(line('Resumo', content.summary));
  parts.push(list('Skills', [...resume.skills, ...content.skills], 100));

  parts.push('\n--- EXPERIÊNCIAS DO CURRÍCULO ---');
  if (content.experiences.length === 0) parts.push(MISSING_MARKER);
  for (const exp of content.experiences.slice(0, 12)) {
    parts.push(
      [
        `• ${exp.role || MISSING_MARKER} — ${exp.company || MISSING_MARKER} (${period(exp.startDate, exp.endDate, exp.isCurrent)})`,
        exp.description ? `  ${truncate(exp.description, 600)}` : '',
        exp.technologies.length ? `  Tecnologias: ${exp.technologies.join(', ')}` : '',
        exp.achievements.length ? `  Conquistas: ${exp.achievements.slice(0, 6).join('; ')}` : '',
        exp.responsibilities.length ? `  Responsabilidades: ${exp.responsibilities.slice(0, 6).join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  if (content.projects.length > 0) {
    parts.push('\n--- PROJETOS DO CURRÍCULO ---');
    for (const project of content.projects.slice(0, 8)) {
      parts.push(
        `• ${project.name || MISSING_MARKER}${project.technologies.length ? ` (${project.technologies.join(', ')})` : ''}${project.description ? `\n  ${truncate(project.description, 400)}` : ''}`,
      );
    }
  }

  if (content.education.length > 0) {
    parts.push('\n--- FORMAÇÃO ---');
    for (const edu of content.education.slice(0, 8)) {
      parts.push(`• ${edu.degree || MISSING_MARKER} — ${edu.institution || MISSING_MARKER}`);
    }
  }

  return parts.join('\n');
}

/** Resumo curtissimo de curriculo, usado quando varios sao comparados (§29). */
export function buildResumeSummary(resume: Pick<Resume, 'id' | 'name' | 'objective' | 'seniority' | 'skills' | 'targetRoles' | 'content'>): string {
  const roles = resume.content.experiences
    .slice(0, 4)
    .map((exp) => `${exp.role || '?'}@${exp.company || '?'}`)
    .join(', ');
  const skills = [...resume.skills, ...resume.content.skills].slice(0, 25).join(', ');
  return [
    `id: ${resume.id}`,
    `nome: ${resume.name}`,
    `objetivo: ${resume.objective || MISSING_MARKER}`,
    `senioridade: ${resume.seniority ?? MISSING_MARKER}`,
    `cargos-alvo: ${resume.targetRoles.join(', ') || MISSING_MARKER}`,
    `skills: ${skills || MISSING_MARKER}`,
    `experiências: ${roles || MISSING_MARKER}`,
  ].join(' | ');
}

/** Vaga em formato compacto. */
export function buildJobContext(job: Pick<Job, 'company' | 'title' | 'description' | 'location' | 'workMode' | 'seniority' | 'requirements' | 'niceToHave' | 'technologies' | 'benefits' | 'salaryRange'>, maxDescription = 8000): string {
  const parts: string[] = ['=== VAGA ==='];
  parts.push(line('Cargo', job.title));
  parts.push(line('Empresa', job.company));
  parts.push(line('Local', job.location));
  parts.push(line('Modalidade', job.workMode ?? ''));
  parts.push(line('Senioridade', job.seniority ?? ''));
  parts.push(list('Requisitos cadastrados', job.requirements));
  parts.push(list('Diferenciais cadastrados', job.niceToHave));
  parts.push(list('Tecnologias', job.technologies));
  if (job.description) parts.push(`\n--- DESCRIÇÃO ORIGINAL ---\n${truncate(job.description, maxDescription)}`);
  return parts.join('\n');
}

/** Analise ja realizada da vaga - evita reprocessar contexto. */
export function buildAnalysisContext(analysis: JobAnalysis): string {
  return [
    '=== ANÁLISE DA VAGA ===',
    line('Resumo', analysis.summary),
    line('Cargo normalizado', analysis.normalizedTitle),
    line('Senioridade detectada', analysis.seniority),
    line('Modalidade detectada', analysis.workMode),
    list('Requisitos obrigatórios', analysis.requiredSkills),
    list('Requisitos desejáveis', analysis.preferredSkills),
    list('Tecnologias', analysis.technologies),
    list('Soft skills', analysis.softSkills),
    list('Palavras-chave (ATS)', analysis.keywords),
    `Tempo mínimo de experiência: ${analysis.minYearsExperience ?? MISSING_MARKER}`,
  ].join('\n');
}
