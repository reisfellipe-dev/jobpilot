/** Validação de payloads: o backend nunca confia no que chega do frontend (§11/§43). */
import { describe, expect, it } from 'vitest';
import { profileInputSchema, experienceInputSchema, skillInputSchema } from '@shared/schemas/profile';
import { resumeContentSchema, resumeInputSchema } from '@shared/schemas/resume';
import { jobInputSchema } from '@shared/schemas/job';
import { applicationInputSchema } from '@shared/schemas/application';
import { uuidSchema } from '@shared/schemas/common';
import { parseWith } from '../api/_lib/router';
import { ApiError } from '../api/_lib/errors';

const UUID = '11111111-2222-4333-8444-555555555555';

describe('uuidSchema', () => {
  it('aceita uuid válido e rejeita o resto', () => {
    expect(uuidSchema.safeParse(UUID).success).toBe(true);
    expect(uuidSchema.safeParse('123').success).toBe(false);
    expect(uuidSchema.safeParse("' OR 1=1 --").success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
  });
});

describe('profileInputSchema', () => {
  it('aplica defaults para um objeto vazio', () => {
    const parsed = profileInputSchema.parse({});
    expect(parsed.fullName).toBe('');
    expect(parsed.desiredRoles).toEqual([]);
    expect(parsed.education).toEqual([]);
  });

  it('valida e-mail apenas quando preenchido', () => {
    expect(profileInputSchema.safeParse({ email: '' }).success).toBe(true);
    expect(profileInputSchema.safeParse({ email: 'ana@exemplo.com' }).success).toBe(true);
    expect(profileInputSchema.safeParse({ email: 'não-é-email' }).success).toBe(false);
  });

  it('deduplica e limpa listas de texto', () => {
    const parsed = profileInputSchema.parse({ desiredRoles: [' Front-end ', 'front-end', '', 'Back-end'] });
    expect(parsed.desiredRoles).toEqual(['Front-end', 'Back-end']);
  });

  it('rejeita senioridade fora do domínio', () => {
    expect(profileInputSchema.safeParse({ seniority: 'ninja' }).success).toBe(false);
  });

  it('rejeita texto acima do limite', () => {
    expect(profileInputSchema.safeParse({ summary: 'a'.repeat(5000) }).success).toBe(false);
  });
});

describe('experienceInputSchema', () => {
  it('exige empresa e cargo', () => {
    expect(experienceInputSchema.safeParse({ company: '', role: 'Dev' }).success).toBe(false);
    expect(experienceInputSchema.safeParse({ company: 'Acme', role: '' }).success).toBe(false);
    expect(experienceInputSchema.safeParse({ company: 'Acme', role: 'Dev' }).success).toBe(true);
  });

  it('valida o formato de data', () => {
    expect(experienceInputSchema.safeParse({ company: 'A', role: 'B', startDate: '2024-01' }).success).toBe(true);
    expect(experienceInputSchema.safeParse({ company: 'A', role: 'B', startDate: '2024' }).success).toBe(true);
    expect(experienceInputSchema.safeParse({ company: 'A', role: 'B', startDate: '01/2024' }).success).toBe(false);
    expect(experienceInputSchema.safeParse({ company: 'A', role: 'B', startDate: '2024-13' }).success).toBe(false);
  });
});

describe('skillInputSchema', () => {
  it('mantém o nível dentro de 1..5', () => {
    expect(skillInputSchema.safeParse({ name: 'React', level: 0 }).success).toBe(false);
    expect(skillInputSchema.safeParse({ name: 'React', level: 6 }).success).toBe(false);
    expect(skillInputSchema.parse({ name: 'React' }).level).toBe(3);
  });
});

describe('resumeInputSchema', () => {
  it('exige nome', () => {
    expect(resumeInputSchema.safeParse({ name: '' }).success).toBe(false);
    expect(resumeInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(resumeInputSchema.safeParse({ name: 'CV Front-end' }).success).toBe(true);
  });

  it('cria conteúdo vazio por padrão', () => {
    const parsed = resumeInputSchema.parse({ name: 'CV' });
    expect(parsed.content.experiences).toEqual([]);
    expect(parsed.content.skills).toEqual([]);
    expect(parsed.priority).toBe(50);
    expect(parsed.isDefault).toBe(false);
  });

  it('limita a prioridade', () => {
    expect(resumeInputSchema.safeParse({ name: 'CV', priority: 500 }).success).toBe(false);
    expect(resumeInputSchema.safeParse({ name: 'CV', priority: -1 }).success).toBe(false);
  });
});

describe('resumeContentSchema', () => {
  it('tolera currículo completamente vazio', () => {
    const parsed = resumeContentSchema.parse({});
    expect(parsed.experiences).toEqual([]);
    expect(parsed.contact.email).toBe('');
  });

  it('descarta skills vazias e duplicadas', () => {
    const parsed = resumeContentSchema.parse({ skills: ['React', 'react', '', '  '] });
    expect(parsed.skills).toEqual(['React']);
  });

  it('rejeita estrutura corrompida', () => {
    expect(resumeContentSchema.safeParse({ experiences: 'não é lista' }).success).toBe(false);
    expect(resumeContentSchema.safeParse({ skills: [{ nome: 'React' }] }).success).toBe(false);
  });
});

describe('jobInputSchema', () => {
  it('exige cargo', () => {
    expect(jobInputSchema.safeParse({ title: '' }).success).toBe(false);
    expect(jobInputSchema.safeParse({ title: 'Dev Front-end' }).success).toBe(true);
  });

  it('valida URL somente quando preenchida', () => {
    expect(jobInputSchema.safeParse({ title: 'Dev', url: '' }).success).toBe(true);
    expect(jobInputSchema.safeParse({ title: 'Dev', url: 'https://vaga.com/1' }).success).toBe(true);
    expect(jobInputSchema.safeParse({ title: 'Dev', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(jobInputSchema.safeParse({ title: 'Dev', url: 'vaga.com' }).success).toBe(false);
  });

  it('rejeita status fora do pipeline', () => {
    expect(jobInputSchema.safeParse({ title: 'Dev', status: 'arquivada' }).success).toBe(false);
  });

  it('aceita vaga mínima e completa os defaults', () => {
    const parsed = jobInputSchema.parse({ title: 'Dev' });
    expect(parsed.status).toBe('nova');
    expect(parsed.requirements).toEqual([]);
    expect(parsed.description).toBe('');
  });
});

describe('applicationInputSchema', () => {
  it('exige jobId em formato uuid', () => {
    expect(applicationInputSchema.safeParse({ jobId: 'abc' }).success).toBe(false);
    expect(applicationInputSchema.safeParse({ jobId: UUID }).success).toBe(true);
  });

  it('mantém o score entre 0 e 100', () => {
    expect(applicationInputSchema.safeParse({ jobId: UUID, score: 101 }).success).toBe(false);
    expect(applicationInputSchema.safeParse({ jobId: UUID, score: -1 }).success).toBe(false);
    expect(applicationInputSchema.safeParse({ jobId: UUID, score: 87 }).success).toBe(true);
  });

  it('valida a data de envio', () => {
    expect(applicationInputSchema.safeParse({ jobId: UUID, appliedAt: '2025-13-40' }).success).toBe(false);
    expect(applicationInputSchema.safeParse({ jobId: UUID, appliedAt: '2025-01-20' }).success).toBe(true);
  });
});

describe('parseWith', () => {
  it('devolve o tipo de saída com defaults aplicados', () => {
    const parsed = parseWith(jobInputSchema, { title: 'Dev' });
    expect(parsed.status).toBe('nova');
  });

  it('converte falha de validação em ApiError 422 com issues', () => {
    try {
      parseWith(jobInputSchema, { title: '' });
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('validation_failed');
      expect(apiError.status).toBe(422);
      expect((apiError.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    }
  });

  it('rejeita payload que não é objeto', () => {
    expect(() => parseWith(jobInputSchema, 'string solta')).toThrow(ApiError);
    expect(() => parseWith(jobInputSchema, null)).toThrow(ApiError);
  });
});
