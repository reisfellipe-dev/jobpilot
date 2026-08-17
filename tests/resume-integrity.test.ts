/**
 * A guarda de integridade é a última linha de defesa contra alucinação (§18).
 * Estes testes descrevem exatamente o que ela precisa impedir.
 */
import { describe, expect, it } from 'vitest';
import { enforceResumeIntegrity } from '@shared/guards/resume-integrity';
import { resumeContentSchema, type ResumeContent } from '@shared/schemas/resume';

function content(overrides: Record<string, unknown> = {}): ResumeContent {
  return resumeContentSchema.parse({
    fullName: 'Ana Souza',
    contact: { email: 'ana@exemplo.com', phone: '', location: 'São Paulo', links: [] },
    experiences: [
      {
        company: 'Acme',
        role: 'Desenvolvedora Front-end',
        description: 'Interfaces em React.',
        startDate: '2021-01',
        endDate: '2024-12',
        isCurrent: false,
        technologies: ['React', 'TypeScript'],
        achievements: [],
        responsibilities: [],
      },
    ],
    education: [{ institution: 'USP', degree: 'Bacharelado', field: 'Computação', status: 'concluido' }],
    projects: [{ name: 'Painel interno', description: '', technologies: ['React'], url: '', githubUrl: '', outcomes: [] }],
    skills: ['React', 'TypeScript'],
    certifications: [{ name: 'Scrum Foundation', issuer: '', year: '', url: '' }],
    languages: [{ name: 'Inglês', level: 'avancado' }],
    ...overrides,
  });
}

describe('enforceResumeIntegrity', () => {
  it('aceita adaptação que apenas reorganiza', () => {
    const original = content();
    const adapted = content({ summary: 'Resumo reescrito com foco na vaga.' });
    const result = enforceResumeIntegrity(adapted, { content: original });

    expect(result.violations).toHaveLength(0);
    expect(result.content.summary).toBe('Resumo reescrito com foco na vaga.');
    expect(result.content.experiences).toHaveLength(1);
  });

  it('remove empresa inventada', () => {
    const original = content();
    const adapted = content({
      experiences: [
        ...original.experiences,
        {
          company: 'Google',
          role: 'Engenheira Sênior',
          description: '',
          startDate: '2020-01',
          endDate: '2021-01',
          isCurrent: false,
          technologies: [],
          achievements: [],
          responsibilities: [],
        },
      ],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.experiences.map((item) => item.company)).toEqual(['Acme']);
    expect(result.violations.some((violation) => violation.detail.includes('Google'))).toBe(true);
  });

  it('restaura cargo alterado', () => {
    const original = content();
    const adapted = content({
      experiences: [{ ...original.experiences[0]!, role: 'Tech Lead Front-end' }],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.experiences[0]!.role).toBe('Desenvolvedora Front-end');
    expect(result.violations.some((violation) => violation.type === 'experiencia')).toBe(true);
  });

  it('restaura datas alteradas', () => {
    const original = content();
    const adapted = content({
      experiences: [{ ...original.experiences[0]!, startDate: '2018-01', endDate: '2024-12' }],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.experiences[0]!.startDate).toBe('2021-01');
    expect(result.violations.some((violation) => violation.type === 'data')).toBe(true);
  });

  it('remove skill que não existe no perfil', () => {
    const original = content();
    const adapted = content({ skills: ['React', 'TypeScript', 'Kubernetes'] });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.skills).not.toContain('Kubernetes');
    expect(result.violations.some((violation) => violation.detail.includes('Kubernetes'))).toBe(true);
  });

  it('aceita skill que existe no perfil, mesmo fora do currículo', () => {
    const original = content();
    const adapted = content({ skills: ['React', 'TypeScript', 'Docker'] });

    const result = enforceResumeIntegrity(adapted, { content: original, extraSkills: ['Docker'] });
    expect(result.content.skills).toContain('Docker');
  });

  it('remove tecnologia acrescentada a uma experiência', () => {
    const original = content();
    const adapted = content({
      experiences: [{ ...original.experiences[0]!, technologies: ['React', 'TypeScript', 'AWS'] }],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.experiences[0]!.technologies).not.toContain('AWS');
  });

  it('reinsere experiência omitida pela IA', () => {
    const original = content();
    const adapted = content({ experiences: [] });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.experiences).toHaveLength(1);
    expect(result.violations.some((violation) => violation.detail.includes('reinserida'))).toBe(true);
  });

  it('remove certificação, formação e idioma inventados', () => {
    const original = content();
    const adapted = content({
      certifications: [{ name: 'AWS Solutions Architect', issuer: '', year: '', url: '' }],
      education: [{ institution: 'MIT', degree: 'Mestrado', field: 'IA', status: 'concluido' }],
      languages: [{ name: 'Alemão', level: 'fluente' }],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.certifications).toHaveLength(0);
    expect(result.content.education).toHaveLength(0);
    expect(result.content.languages).toHaveLength(0);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('remove projeto inventado', () => {
    const original = content();
    const adapted = content({
      projects: [
        ...original.projects,
        { name: 'Startup própria', description: '', technologies: [], url: '', githubUrl: '', outcomes: [] },
      ],
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.projects.map((project) => project.name)).toEqual(['Painel interno']);
  });

  it('nunca deixa a IA alterar identidade e contato', () => {
    const original = content();
    const adapted = content({
      fullName: 'Ana S. Souza Silva',
      contact: { email: 'outro@email.com', phone: '11999999999', location: 'Berlim', links: [] },
    });

    const result = enforceResumeIntegrity(adapted, { content: original });
    expect(result.content.fullName).toBe('Ana Souza');
    expect(result.content.contact.email).toBe('ana@exemplo.com');
    expect(result.content.contact.location).toBe('São Paulo');
  });

  it('não quebra com currículo original vazio', () => {
    const original = resumeContentSchema.parse({});
    const adapted = content();
    const result = enforceResumeIntegrity(adapted, { content: original });

    expect(result.content.experiences).toHaveLength(0);
    expect(result.content.skills).toHaveLength(0);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
