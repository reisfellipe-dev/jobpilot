import { describe, expect, it } from 'vitest';
import {
  canonicalSkill,
  canonicalSkills,
  containsTerm,
  extractMinYears,
  monthIndex,
  normalizeText,
  tokenSimilarity,
  tokenize,
  totalExperienceYears,
} from '@shared/matching/normalize';

describe('normalizeText', () => {
  it('remove acentos, colapsa espaços e normaliza caixa', () => {
    expect(normalizeText('  Desenvolvedor   BACK-END Sênior ')).toBe('desenvolvedor back-end senior');
  });

  it('lida com string vazia', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('canonicalSkill', () => {
  it('resolve sinônimos comuns', () => {
    expect(canonicalSkill('ReactJS')).toBe('react');
    expect(canonicalSkill('React.js')).toBe('react');
    expect(canonicalSkill('  react  ')).toBe('react');
    expect(canonicalSkill('TS')).toBe('typescript');
    expect(canonicalSkill('Postgres')).toBe('postgresql');
    expect(canonicalSkill('K8s')).toBe('kubernetes');
    expect(canonicalSkill('C#')).toBe('c#');
    expect(canonicalSkill('CSharp')).toBe('c#');
  });

  it('remove prefixos de frase que não são a skill', () => {
    expect(canonicalSkill('Conhecimento em Docker')).toBe('docker');
    expect(canonicalSkill('Experiência com AWS')).toBe('aws');
  });

  it('preserva skills desconhecidas normalizadas', () => {
    expect(canonicalSkill('Elixir')).toBe('elixir');
  });

  it('deduplica preservando a ordem', () => {
    expect(canonicalSkills(['React', 'reactjs', 'TypeScript', 'TS'])).toEqual(['react', 'typescript']);
  });

  it('ignora entradas vazias', () => {
    expect(canonicalSkills(['', '   '])).toEqual([]);
  });
});

describe('tokenize', () => {
  it('preserva símbolos técnicos', () => {
    expect(tokenize('C# e C++ com Node.js')).toContain('c#');
    expect(tokenize('C# e C++ com Node.js')).toContain('c++');
    expect(tokenize('C# e C++ com Node.js')).toContain('node.js');
  });

  it('descarta stopwords e números soltos', () => {
    const tokens = tokenize('experiência de 5 anos com React');
    expect(tokens).not.toContain('experiencia');
    expect(tokens).not.toContain('5');
    expect(tokens).toContain('react');
  });
});

describe('containsTerm', () => {
  it('só encontra o termo inteiro', () => {
    expect(containsTerm('domino react e redux', 'react')).toBe(true);
    expect(containsTerm('react native no dia a dia', 'react')).toBe(true);
    expect(containsTerm('reactivex e rxjs', 'react')).toBe(false);
  });

  it('escapa caracteres especiais de regex', () => {
    expect(containsTerm('trabalho com c++ diariamente', 'c++')).toBe(true);
    expect(containsTerm('sem nada aqui', 'c++')).toBe(false);
  });

  it('devolve false para termo vazio', () => {
    expect(containsTerm('qualquer coisa', '')).toBe(false);
  });
});

describe('tokenSimilarity', () => {
  it('dá 1 para textos equivalentes', () => {
    expect(tokenSimilarity('Desenvolvedor Front-end', 'desenvolvedor front-end')).toBeCloseTo(1, 5);
  });

  it('dá 0 quando não há sobreposição', () => {
    expect(tokenSimilarity('Analista Financeiro', 'Engenheiro de Dados')).toBe(0);
  });

  it('dá valor intermediário para sobreposição parcial', () => {
    const similarity = tokenSimilarity('Desenvolvedor Front-end React', 'Desenvolvedor React');
    expect(similarity).toBeGreaterThan(0.5);
    expect(similarity).toBeLessThan(1);
  });

  it('trata entradas vazias sem quebrar', () => {
    expect(tokenSimilarity('', 'React')).toBe(0);
  });
});

describe('monthIndex', () => {
  it('converte AAAA-MM e AAAA', () => {
    expect(monthIndex('2024-01')).toBe(2024 * 12);
    expect(monthIndex('2024')).toBe(2024 * 12);
    expect(monthIndex('2024-12')).toBe(2024 * 12 + 11);
  });

  it('rejeita entradas inválidas', () => {
    expect(monthIndex('2024-13')).toBeNull();
    expect(monthIndex('janeiro/2024')).toBeNull();
    expect(monthIndex('')).toBeNull();
    expect(monthIndex(null)).toBeNull();
  });
});

describe('totalExperienceYears', () => {
  const now = 2025 * 12 + 0; // janeiro/2025

  it('soma períodos sequenciais', () => {
    const years = totalExperienceYears(
      [
        { startDate: '2020-01', endDate: '2021-12' },
        { startDate: '2022-01', endDate: '2023-12' },
      ],
      now,
    );
    expect(years).toBeCloseTo(4, 1);
  });

  it('não conta períodos sobrepostos duas vezes', () => {
    const years = totalExperienceYears(
      [
        { startDate: '2020-01', endDate: '2022-12' },
        { startDate: '2021-01', endDate: '2022-12' },
      ],
      now,
    );
    expect(years).toBeCloseTo(3, 1);
  });

  it('usa a data atual quando o emprego é atual', () => {
    // jan/2023 a jan/2025 conta 25 meses (ambos os extremos são trabalhados).
    const years = totalExperienceYears([{ startDate: '2023-01', isCurrent: true }], now);
    expect(years).toBeCloseTo(2.1, 1);
  });

  it('devolve 0 sem datas válidas', () => {
    expect(totalExperienceYears([{ startDate: '', endDate: '' }], now)).toBe(0);
    expect(totalExperienceYears([], now)).toBe(0);
  });

  it('nunca projeta experiência no futuro', () => {
    const years = totalExperienceYears([{ startDate: '2024-01', endDate: '2030-01' }], now);
    expect(years).toBeLessThanOrEqual(1.1);
  });
});

describe('extractMinYears', () => {
  it('encontra o menor tempo mencionado', () => {
    expect(extractMinYears('Mínimo de 3 anos de experiência')).toBe(3);
    expect(extractMinYears('5+ anos atuando com backend')).toBe(5);
    expect(extractMinYears('De 2 a 4 anos de experiência')).toBe(2);
  });

  it('devolve null quando não há menção', () => {
    expect(extractMinYears('Experiência sólida com React')).toBeNull();
    expect(extractMinYears('')).toBeNull();
  });

  it('ignora valores absurdos', () => {
    expect(extractMinYears('empresa com 100 anos de mercado')).toBeNull();
  });
});
