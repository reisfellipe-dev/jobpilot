/** Deduplicação, recência, relevância e estratégia de busca (§8, §10, §13, §24). */
import { describe, expect, it } from 'vitest';
import {
  buildFingerprint,
  groupDuplicates,
  isLikelyDuplicate,
  locationBucket,
  normalizeCompanyName,
  normalizeJobTitle,
  normalizeJobUrl,
} from '@shared/discovery/fingerprint';
import { explainMatch, recencyInfo, relevanceScore, RELEVANCE_WEIGHTS } from '@shared/discovery/ranking';
import { buildSearchStrategy, preFilter } from '@shared/discovery/query-strategy';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();

describe('normalizeCompanyName', () => {
  it('remove sufixos societários', () => {
    expect(normalizeCompanyName('Acme Tecnologia Ltda')).toBe('acme');
    expect(normalizeCompanyName('Acme Inc.')).toBe('acme');
    expect(normalizeCompanyName('ACME Solutions LLC')).toBe('acme');
  });

  it('trata acentuação e pontuação', () => {
    expect(normalizeCompanyName('Inovação & Cia.')).toBe(normalizeCompanyName('Inovacao e Cia'));
  });

  it('não zera nomes de uma palavra só', () => {
    expect(normalizeCompanyName('Nubank')).toBe('nubank');
  });
});

describe('normalizeJobTitle', () => {
  it('expande abreviações comuns', () => {
    expect(normalizeJobTitle('Sr. Frontend Engineer')).toBe(normalizeJobTitle('Senior Frontend Engineer'));
    expect(normalizeJobTitle('Jr Developer')).toBe(normalizeJobTitle('Junior Developer'));
  });

  it('unifica grafias de front-end e back-end', () => {
    expect(normalizeJobTitle('Front-End Developer')).toBe(normalizeJobTitle('Frontend Developer'));
    expect(normalizeJobTitle('Desenvolvedor Back End')).toContain('backend');
  });

  it('remove local anexado ao título', () => {
    expect(normalizeJobTitle('React Developer - São Paulo')).toBe('react developer');
    expect(normalizeJobTitle('React Developer (Remote)')).toBe('react developer');
  });
});

describe('locationBucket', () => {
  it('agrupa todas as variações de remoto', () => {
    expect(locationBucket('Remote')).toBe('remote');
    expect(locationBucket('Remoto - Brasil')).toBe('remote');
    expect(locationBucket('Anywhere')).toBe('remote');
  });

  it('usa a cidade como agrupador', () => {
    expect(locationBucket('São Paulo, SP')).toBe('sao paulo');
  });

  it('ausência vira "na"', () => {
    expect(locationBucket(null)).toBe('na');
    expect(locationBucket('')).toBe('na');
  });
});

describe('buildFingerprint', () => {
  it('é igual para a mesma vaga em fontes diferentes', () => {
    const a = buildFingerprint({ title: 'Sr. Frontend Engineer', company: 'Acme Ltda', location: 'Remote' });
    const b = buildFingerprint({ title: 'Senior Frontend Engineer', company: 'ACME', location: 'Remoto - Brasil' });
    expect(a).toBe(b);
  });

  it('difere para cargos diferentes na mesma empresa', () => {
    const a = buildFingerprint({ title: 'Frontend Engineer', company: 'Acme' });
    const b = buildFingerprint({ title: 'Backend Engineer', company: 'Acme' });
    expect(a).not.toBe(b);
  });

  it('difere para a mesma vaga em cidades diferentes', () => {
    const a = buildFingerprint({ title: 'Dev', company: 'Acme', location: 'São Paulo' });
    const b = buildFingerprint({ title: 'Dev', company: 'Acme', location: 'Recife' });
    expect(a).not.toBe(b);
  });

  it('devolve string vazia sem dados suficientes', () => {
    expect(buildFingerprint({ title: '', company: '' })).toBe('');
  });
});

describe('normalizeJobUrl', () => {
  it('remove parâmetros de rastreamento', () => {
    expect(normalizeJobUrl('https://acme.com/jobs/1?utm_source=x&gh_src=y')).toBe('acme.com/jobs/1');
  });

  it('ignora www, esquema e barra final', () => {
    expect(normalizeJobUrl('https://www.acme.com/jobs/1/')).toBe('acme.com/jobs/1');
  });

  it('preserva parâmetros significativos', () => {
    expect(normalizeJobUrl('https://acme.com/jobs?gh_jid=123')).toContain('gh_jid=123');
  });
});

describe('isLikelyDuplicate', () => {
  it('detecta a mesma vaga com títulos equivalentes', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Sr. Frontend Engineer', company: 'Acme Ltda', location: 'Remote' },
        { title: 'Senior Frontend Engineer', company: 'Acme', location: 'Remoto' },
      ),
    ).toBe(true);
  });

  it('URL idêntica é prova direta', () => {
    expect(
      isLikelyDuplicate(
        { title: 'A', company: 'X', sourceUrl: 'https://acme.com/j/1?utm_source=a' },
        { title: 'B', company: 'Y', sourceUrl: 'https://www.acme.com/j/1' },
      ),
    ).toBe(true);
  });

  it('empresas diferentes nunca são duplicadas', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Frontend Engineer', company: 'Acme' },
        { title: 'Frontend Engineer', company: 'Globex' },
      ),
    ).toBe(false);
  });

  it('cargos diferentes na mesma empresa não são duplicados', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Frontend Engineer', company: 'Acme' },
        { title: 'Data Engineer', company: 'Acme' },
      ),
    ).toBe(false);
  });

  it('mesma vaga em cidades diferentes é vaga diferente', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Frontend Engineer', company: 'Acme', location: 'São Paulo' },
        { title: 'Frontend Engineer', company: 'Acme', location: 'Recife' },
      ),
    ).toBe(false);
  });
});

describe('groupDuplicates', () => {
  it('agrupa a mesma vaga encontrada em três fontes (§13)', () => {
    const groups = groupDuplicates([
      { title: 'Senior Frontend Engineer', company: 'Acme', location: 'Remote', sourceUrl: 'https://a.com/1' },
      { title: 'Sr. Frontend Engineer', company: 'Acme Ltda', location: 'Remoto', sourceUrl: 'https://b.com/2' },
      { title: 'Senior Frontend Engineer', company: 'ACME Inc', location: 'Remote', sourceUrl: 'https://c.com/3' },
      { title: 'Backend Engineer', company: 'Acme', location: 'Remote', sourceUrl: 'https://a.com/4' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.duplicates).toHaveLength(2);
    expect(groups[1]!.duplicates).toHaveLength(0);
  });

  it('lista vazia devolve nenhum grupo', () => {
    expect(groupDuplicates([])).toEqual([]);
  });
});

describe('recencyInfo', () => {
  it('classifica publicações recentes com nota máxima', () => {
    const info = recencyInfo(new Date(NOW - 2 * 3_600_000).toISOString(), NOW);
    expect(info.score).toBe(1);
    expect(info.tier).toBe('hoje');
    expect(info.label).toContain('horas');
  });

  it('reduz a nota conforme a vaga envelhece', () => {
    const day = recencyInfo(new Date(NOW - 20 * 3_600_000).toISOString(), NOW).score;
    const week = recencyInfo(new Date(NOW - 6 * 24 * 3_600_000).toISOString(), NOW).score;
    const month = recencyInfo(new Date(NOW - 25 * 24 * 3_600_000).toISOString(), NOW).score;
    const old = recencyInfo(new Date(NOW - 200 * 24 * 3_600_000).toISOString(), NOW).score;

    expect(day).toBeGreaterThan(week);
    expect(week).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(old);
  });

  it('data ausente recebe valor neutro, não penalidade (§3)', () => {
    const info = recencyInfo(null, NOW);
    expect(info.score).toBe(0.5);
    expect(info.tier).toBe('desconhecido');
    expect(info.label).toBe('Data não informada');
  });

  it('data inválida não quebra o cálculo', () => {
    expect(recencyInfo('ontem à tarde', NOW).tier).toBe('desconhecido');
  });

  it('humaniza o intervalo em português', () => {
    expect(recencyInfo(new Date(NOW - 3_600_000).toISOString(), NOW).label).toBe('há 1 hora');
    expect(recencyInfo(new Date(NOW - 24 * 3_600_000).toISOString(), NOW).label).toBe('há 1 dia');
    expect(recencyInfo(new Date(NOW - 60 * 24 * 3_600_000).toISOString(), NOW).label).toBe('há 2 meses');
  });
});

describe('relevanceScore', () => {
  it('combina aderência e recência com pesos declarados', () => {
    const result = relevanceScore({ matchScore: 100, publishedAt: new Date(NOW).toISOString(), now: NOW });
    expect(result.score).toBe(100);
    expect(result.tier).toBe('muito_alta');
    expect(result.parts[0]!.weight).toBe(RELEVANCE_WEIGHTS.match);
  });

  it('vaga antiga com o mesmo match perde posição', () => {
    const recente = relevanceScore({ matchScore: 80, publishedAt: new Date(NOW).toISOString(), now: NOW });
    const antiga = relevanceScore({
      matchScore: 80,
      publishedAt: new Date(NOW - 200 * 24 * 3_600_000).toISOString(),
      now: NOW,
    });
    expect(recente.score).toBeGreaterThan(antiga.score);
  });

  it('nunca sai do intervalo 0..100', () => {
    expect(relevanceScore({ matchScore: 150, publishedAt: null, now: NOW }).score).toBeLessThanOrEqual(100);
    expect(relevanceScore({ matchScore: -20, publishedAt: null, now: NOW }).score).toBeGreaterThanOrEqual(0);
  });
});

describe('explainMatch', () => {
  it('devolve explicação em texto, não só número (§25)', () => {
    const explanation = explainMatch({
      score: 92,
      resumeName: 'Front-end React',
      matchedSkills: ['react', 'typescript'],
      partialSkills: [],
      missingSkills: ['next.js'],
      breakdown: [
        { key: 'requiredSkills', label: 'Requisitos obrigatórios', weight: 40, ratio: 0.9, points: 36, detail: '', matched: [], missing: [] },
      ],
    });

    expect(explanation.headline).toContain('Front-end React');
    expect(explanation.headline).toContain('requisito');
    expect(explanation.strengths).toEqual(['react', 'typescript']);
    expect(explanation.gaps).toEqual(['next.js']);
  });
});

describe('buildSearchStrategy', () => {
  const base = {
    desiredRoles: ['Desenvolvedor Front-end'],
    seniority: 'junior' as const,
    skills: ['React', 'TypeScript', 'CSS'],
    workModes: ['remoto' as const],
    location: 'São Paulo',
    desiredLocation: 'Remoto',
  };

  it('monta termos a partir do cargo desejado e da tecnologia principal', () => {
    const strategy = buildSearchStrategy(base);
    expect(strategy.terms.length).toBeGreaterThan(0);
    expect(strategy.terms.length).toBeLessThanOrEqual(8);
    expect(strategy.terms.some((term) => /front-end/i.test(term))).toBe(true);
    expect(strategy.technologies).toContain('react');
  });

  it('termos manuais do usuário têm prioridade', () => {
    const strategy = buildSearchStrategy({ ...base, overrideKeywords: ['Engenheiro de Dados'] });
    expect(strategy.terms[0]).toBe('Engenheiro de Dados');
    expect(strategy.explanation.join(' ')).toContain('definidos por você');
  });

  it('sem cargo declarado, deduz o papel pelas tecnologias', () => {
    const strategy = buildSearchStrategy({ ...base, desiredRoles: [] });
    expect(strategy.terms.length).toBeGreaterThan(0);
    expect(strategy.explanation.join(' ')).toContain('deduzidos');
  });

  it('perfil vazio não gera busca genérica silenciosa', () => {
    const strategy = buildSearchStrategy({
      desiredRoles: [],
      seniority: null,
      skills: [],
      workModes: [],
      location: '',
      desiredLocation: '',
    });
    expect(strategy.terms).toEqual([]);
    expect(strategy.explanation.join(' ')).toContain('completar o perfil');
  });

  it('marca busca somente remota quando o perfil só aceita remoto', () => {
    expect(buildSearchStrategy(base).remoteOnly).toBe(true);
    expect(buildSearchStrategy({ ...base, workModes: ['remoto', 'hibrido'] }).remoteOnly).toBe(false);
  });
});

describe('preFilter', () => {
  const strategy = buildSearchStrategy({
    desiredRoles: ['Desenvolvedor Front-end'],
    seniority: 'pleno',
    skills: ['React', 'TypeScript'],
    workModes: ['remoto'],
    location: 'São Paulo',
    desiredLocation: 'Remoto',
  });

  it('mantém vaga com tecnologia em comum', () => {
    const result = preFilter(
      { title: 'Frontend Engineer', technologies: ['react'], description: '' },
      strategy,
    );
    expect(result.keep).toBe(true);
    expect(result.reason).toContain('react');
  });

  it('mantém vaga com cargo compatível mesmo sem tecnologia listada', () => {
    const result = preFilter(
      { title: 'Desenvolvedor Front-end', technologies: [], description: '' },
      strategy,
    );
    expect(result.keep).toBe(true);
  });

  it('descarta vaga de área completamente diferente', () => {
    const result = preFilter(
      { title: 'Auxiliar de Cozinha', technologies: [], description: 'Preparo de alimentos.' },
      strategy,
    );
    expect(result.keep).toBe(false);
    expect(result.affinity).toBe(0);
  });

  it('resgata vaga que menciona a tecnologia só na descrição', () => {
    const result = preFilter(
      { title: 'Analista de Sistemas', technologies: [], description: 'Manutenção de telas em react e jquery.' },
      strategy,
    );
    expect(result.keep).toBe(true);
  });

  it('sem critérios no perfil, nada é descartado', () => {
    const empty = buildSearchStrategy({
      desiredRoles: [],
      seniority: null,
      skills: [],
      workModes: [],
      location: '',
      desiredLocation: '',
    });
    expect(preFilter({ title: 'Qualquer coisa', technologies: [], description: '' }, empty).keep).toBe(true);
  });
});
