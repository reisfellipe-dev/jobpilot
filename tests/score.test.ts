import { describe, expect, it } from 'vitest';
import {
  MAX_SEMANTIC_ADJUSTMENT,
  SCORE_WEIGHTS,
  applySemanticAdjustment,
  buildResumeIndex,
  evaluateRequirement,
  matchSkill,
  rankResumes,
  scoreResumeAgainstJob,
  scoreTier,
  type ScoringJob,
  type ScoringResume,
} from '@shared/matching/score';
import { emptyResumeContent, resumeContentSchema } from '@shared/schemas/resume';

const NOW = 2025 * 12; // janeiro/2025, fixo para tornar os testes determinísticos

function makeResume(overrides: Partial<ScoringResume> = {}): ScoringResume {
  return {
    id: 'r1',
    name: 'Front-end React',
    objective: 'Vagas de front-end',
    seniority: 'pleno',
    skills: ['React', 'TypeScript', 'CSS'],
    targetRoles: ['Desenvolvedor Front-end'],
    content: resumeContentSchema.parse({
      summary: 'Desenvolvedora front-end com foco em React e TypeScript.',
      experiences: [
        {
          company: 'Acme',
          role: 'Desenvolvedora Front-end',
          description: 'Interfaces com React, TypeScript e testes.',
          startDate: '2021-01',
          endDate: '2024-12',
          technologies: ['React', 'TypeScript', 'Jest'],
          achievements: [],
          responsibilities: [],
        },
      ],
      skills: ['React', 'TypeScript', 'CSS'],
    }),
    ...overrides,
  };
}

const JOB: ScoringJob = {
  title: 'Desenvolvedor Front-end React',
  seniority: 'pleno',
  workMode: 'remoto',
  location: 'São Paulo',
  requirements: ['Experiência com React', 'Domínio de TypeScript', 'Conhecimento em GraphQL'],
  niceToHave: ['Next.js'],
  technologies: ['React', 'TypeScript', 'GraphQL'],
  description: 'Buscamos pessoa desenvolvedora com 3 anos de experiência.',
};

describe('pesos do score', () => {
  it('somam exatamente 100', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBe(100);
  });
});

describe('matchSkill', () => {
  const index = buildResumeIndex(makeResume(), { nowIndex: NOW });

  it('reconhece skill exata mesmo com grafia diferente', () => {
    expect(matchSkill(index, 'ReactJS')).toBe('atendido');
    expect(matchSkill(index, 'TypeScript')).toBe('atendido');
  });

  it('marca como ausente o que não existe', () => {
    expect(matchSkill(index, 'GraphQL')).toBe('ausente');
    expect(matchSkill(index, 'Kubernetes')).toBe('ausente');
  });

  it('marca como parcial quando só aparece no texto', () => {
    const withText = buildResumeIndex(
      makeResume({
        skills: [],
        content: resumeContentSchema.parse({
          summary: 'Trabalhei com Docker em ambientes de desenvolvimento.',
          skills: [],
        }),
      }),
      { nowIndex: NOW },
    );
    expect(matchSkill(withText, 'Docker')).toBe('parcial');
  });

  it('devolve ausente para skill vazia', () => {
    expect(matchSkill(index, '')).toBe('ausente');
  });
});

describe('scoreResumeAgainstJob', () => {
  it('produz score alto para currículo aderente', () => {
    const result = scoreResumeAgainstJob(JOB, null, makeResume(), {
      profileWorkModes: ['remoto'],
      nowIndex: NOW,
    });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.matchedSkills).toContain('react');
    expect(result.missingSkills).toContain('graphql');
  });

  it('produz score baixo para currículo de outra área', () => {
    const unrelated = makeResume({
      id: 'r2',
      name: 'Analista Financeiro',
      targetRoles: ['Analista Financeiro'],
      skills: ['Excel', 'SAP'],
      seniority: 'junior',
      content: resumeContentSchema.parse({
        summary: 'Analista financeiro com foco em conciliação.',
        skills: ['Excel', 'SAP'],
        experiences: [
          {
            company: 'Banco X',
            role: 'Analista Financeiro',
            startDate: '2023-01',
            endDate: '2024-01',
            technologies: ['Excel'],
          },
        ],
      }),
    });

    const strong = scoreResumeAgainstJob(JOB, null, makeResume(), { nowIndex: NOW });
    const weak = scoreResumeAgainstJob(JOB, null, unrelated, { nowIndex: NOW });
    expect(weak.score).toBeLessThan(strong.score);
  });

  it('mantém o score dentro de 0..100 mesmo no pior caso', () => {
    const empty: ScoringResume = { id: 'empty', name: '', skills: [], targetRoles: [], content: emptyResumeContent() };
    const result = scoreResumeAgainstJob(JOB, null, empty, { nowIndex: NOW });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('lida com vaga sem nenhuma informação sem quebrar', () => {
    const emptyJob: ScoringJob = { title: '' };
    const result = scoreResumeAgainstJob(emptyJob, null, makeResume(), { nowIndex: NOW });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toHaveLength(7);
  });

  it('a soma dos componentes é igual ao score final (explicabilidade)', () => {
    const result = scoreResumeAgainstJob(JOB, null, makeResume(), { nowIndex: NOW });
    const sum = result.breakdown.reduce((total, item) => total + item.points, 0);
    expect(Math.round(sum)).toBe(result.score);
  });

  it('nenhum componente ultrapassa o próprio peso', () => {
    const result = scoreResumeAgainstJob(JOB, null, makeResume(), { nowIndex: NOW });
    for (const item of result.breakdown) {
      expect(item.points).toBeLessThanOrEqual(item.weight + 0.001);
      expect(item.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('penaliza senioridade muito abaixo da pedida', () => {
    const senior = scoreResumeAgainstJob({ ...JOB, seniority: 'senior' }, null, makeResume({ seniority: 'senior' }), {
      nowIndex: NOW,
    });
    const estagio = scoreResumeAgainstJob({ ...JOB, seniority: 'senior' }, null, makeResume({ seniority: 'estagio' }), {
      nowIndex: NOW,
    });
    expect(estagio.score).toBeLessThan(senior.score);
  });

  it('usa os requisitos da análise da IA quando existem', () => {
    const result = scoreResumeAgainstJob(
      JOB,
      { requiredSkills: ['React'], preferredSkills: [], keywords: [], minYearsExperience: 1 },
      makeResume(),
      { nowIndex: NOW },
    );
    const required = result.breakdown.find((item) => item.key === 'requiredSkills');
    expect(required?.matched).toEqual(['react']);
    expect(required?.missing).toEqual([]);
  });

  it('trata modalidade incompatível como penalidade, não como erro', () => {
    const result = scoreResumeAgainstJob({ ...JOB, workMode: 'presencial' }, null, makeResume(), {
      profileWorkModes: ['remoto'],
      nowIndex: NOW,
    });
    const workMode = result.breakdown.find((item) => item.key === 'workMode');
    expect(workMode?.ratio).toBeLessThan(0.5);
  });
});

describe('evaluateRequirement', () => {
  const index = buildResumeIndex(makeResume(), { nowIndex: NOW });

  it('marca como atendido quando a skill aparece no requisito', () => {
    const result = evaluateRequirement('Experiência sólida com React', index);
    expect(result.status).toBe('atendido');
    expect(result.evidence).toContain('react');
  });

  it('marca como ausente quando nada bate', () => {
    expect(evaluateRequirement('Certificação AWS Solutions Architect', index).status).toBe('ausente');
  });

  it('não quebra com requisito vazio', () => {
    expect(evaluateRequirement('', index).status).toBe('ausente');
  });
});

describe('rankResumes', () => {
  it('ordena do maior para o menor score', () => {
    const resumes = [
      makeResume({ id: 'a', name: 'Front-end React' }),
      makeResume({
        id: 'b',
        name: 'Back-end Java',
        targetRoles: ['Desenvolvedor Back-end'],
        skills: ['Java', 'Spring'],
        content: resumeContentSchema.parse({ skills: ['Java', 'Spring'] }),
      }),
    ];
    const ranked = rankResumes(JOB, null, resumes, { nowIndex: NOW });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.resumeId).toBe('a');
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });

  it('devolve lista vazia quando não há currículos', () => {
    expect(rankResumes(JOB, null, [], { nowIndex: NOW })).toEqual([]);
  });

  it('inicia sem ajuste semântico', () => {
    const ranked = rankResumes(JOB, null, [makeResume()], { nowIndex: NOW });
    expect(ranked[0]!.semanticAdjustment).toBe(0);
    expect(ranked[0]!.baseScore).toBe(ranked[0]!.score);
    expect(ranked[0]!.semantic).toBeNull();
  });
});

describe('applySemanticAdjustment', () => {
  it('respeita o teto de ±10 pontos', () => {
    expect(applySemanticAdjustment(50, 50)).toBe(50 + MAX_SEMANTIC_ADJUSTMENT);
    expect(applySemanticAdjustment(50, -50)).toBe(50 - MAX_SEMANTIC_ADJUSTMENT);
  });

  it('nunca sai do intervalo 0..100', () => {
    expect(applySemanticAdjustment(98, 10)).toBe(100);
    expect(applySemanticAdjustment(3, -10)).toBe(0);
  });

  it('arredonda ajustes fracionários', () => {
    expect(applySemanticAdjustment(50, 2.6)).toBe(53);
  });
});

describe('scoreTier', () => {
  it('classifica as faixas', () => {
    expect(scoreTier(90)).toBe('alto');
    expect(scoreTier(60)).toBe('medio');
    expect(scoreTier(20)).toBe('baixo');
  });
});
