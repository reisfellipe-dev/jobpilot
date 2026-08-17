/** Renderização do currículo estruturado em texto simples (exportação e cópia). */
import type { ResumeContent } from '@shared/schemas/resume';
import { formatPeriod } from './format';

function section(title: string, body: string[]): string[] {
  if (body.length === 0) return [];
  return ['', title.toUpperCase(), '-'.repeat(title.length), ...body];
}

export function renderResumeText(content: ResumeContent): string {
  const lines: string[] = [];

  if (content.fullName) lines.push(content.fullName.toUpperCase());
  if (content.headline) lines.push(content.headline);

  const contact = [content.contact.email, content.contact.phone, content.contact.location].filter(Boolean);
  if (contact.length > 0) lines.push(contact.join(' | '));
  if (content.contact.links.length > 0) {
    lines.push(content.contact.links.map((link) => `${link.label}: ${link.url}`).join(' | '));
  }

  if (content.summary) lines.push(...section('Resumo', [content.summary]));

  lines.push(
    ...section(
      'Experiência profissional',
      content.experiences.flatMap((experience) => {
        const header = `${experience.role || 'Cargo não informado'} — ${experience.company || 'Empresa não informada'} (${formatPeriod(experience.startDate, experience.endDate, experience.isCurrent)})`;
        const body: string[] = [header];
        if (experience.description) body.push(experience.description);
        for (const item of experience.responsibilities) body.push(`  • ${item}`);
        for (const item of experience.achievements) body.push(`  • ${item}`);
        if (experience.technologies.length > 0) body.push(`  Tecnologias: ${experience.technologies.join(', ')}`);
        body.push('');
        return body;
      }),
    ),
  );

  lines.push(
    ...section(
      'Projetos',
      content.projects.flatMap((project) => {
        const body: string[] = [project.name || 'Projeto'];
        if (project.description) body.push(project.description);
        if (project.technologies.length > 0) body.push(`  Tecnologias: ${project.technologies.join(', ')}`);
        for (const outcome of project.outcomes) body.push(`  • ${outcome}`);
        body.push('');
        return body;
      }),
    ),
  );

  lines.push(
    ...section(
      'Formação',
      content.education.map((education) =>
        `${education.degree || 'Curso'}${education.field ? ` em ${education.field}` : ''} — ${education.institution ?? ''} (${formatPeriod(education.startDate, education.endDate)})`.trim(),
      ),
    ),
  );

  if (content.skills.length > 0) lines.push(...section('Competências', [content.skills.join(', ')]));

  lines.push(
    ...section(
      'Certificações',
      content.certifications.map((certification) =>
        [certification.name, certification.issuer, certification.year].filter(Boolean).join(' — '),
      ),
    ),
  );

  lines.push(
    ...section(
      'Idiomas',
      content.languages.map((language) => `${language.name ?? ''} — ${language.level}`.trim()),
    ),
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
