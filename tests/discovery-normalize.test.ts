/**
 * Normalização de vagas vindas de fontes externas (§3, §4, §21).
 * O foco dos testes é a regra mais importante: ausência não vira invenção.
 */
import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, looksLikeHtml, toPlainText } from '@shared/discovery/html';
import {
  extractSections,
  extractTechnologies,
  inferSeniority,
  inferWorkMode,
  normalizeEmploymentType,
  normalizeRawJob,
  toIsoDate,
} from '@shared/discovery/normalize';
import type { RawJob } from '@shared/discovery/types';

function rawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    sourceJobId: '123',
    title: 'Desenvolvedor Front-end React',
    company: 'Acme Tecnologia Ltda',
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    raw: { id: 123 },
    ...overrides,
  };
}

describe('htmlToText', () => {
  it('converte listas em linhas com marcador', () => {
    const text = htmlToText('<ul><li>React</li><li>TypeScript</li></ul>');
    expect(text).toContain('• React');
    expect(text).toContain('• TypeScript');
  });

  it('remove script e style por completo', () => {
    const text = htmlToText('<p>Vaga</p><script>alert(1)</script><style>.a{}</style>');
    expect(text).toContain('Vaga');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('.a{');
  });

  it('nunca devolve tags — o HTML da fonte jamais é renderizado', () => {
    const text = htmlToText('<p onclick="x()">Olá <b>mundo</b></p><img src=x onerror=alert(1)>');
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text).toContain('Olá');
  });

  it('decodifica entidades nomeadas e numéricas', () => {
    expect(decodeEntities('R&amp;D &#8211; Engenharia &#x27;nova&#x27;')).toBe("R&D – Engenharia 'nova'");
  });

  it('preserva quebras de parágrafo sem excesso', () => {
    const text = htmlToText('<p>um</p><p>dois</p><p>três</p>');
    expect(text.split('\n\n')).toHaveLength(3);
  });

  it('lida com entrada vazia ou nula', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
    expect(toPlainText(undefined)).toBe('');
  });

  it('detecta se o conteúdo é HTML', () => {
    expect(looksLikeHtml('<p>oi</p>')).toBe(true);
    expect(looksLikeHtml('texto puro')).toBe(false);
  });
});

describe('extractTechnologies', () => {
  it('encontra tecnologias mencionadas no texto', () => {
    const found = extractTechnologies('Buscamos alguém com React, TypeScript e PostgreSQL.');
    expect(found).toContain('react');
    expect(found).toContain('typescript');
    expect(found).toContain('postgresql');
  });

  it('resolve variações para a forma canônica', () => {
    const found = extractTechnologies('Experiência com ReactJS e Node.js');
    expect(found).toContain('react');
    expect(found).toContain('node.js');
  });

  it('NÃO confunde "rest of the team" com REST', () => {
    const found = extractTechnologies('You will work with the rest of the team on delivery.');
    expect(found).not.toContain('rest');
  });

  it('reconhece REST quando o contexto é técnico', () => {
    expect(extractTechnologies('Construção de REST APIs')).toContain('rest');
  });

  it('NÃO confunde "R$" com a linguagem R', () => {
    const found = extractTechnologies('Salário de R$ 8.000 a R$ 12.000 por mês.');
    expect(found).not.toContain('r');
  });

  it('NÃO confunde "go to production" com Golang', () => {
    expect(extractTechnologies('Features go to production weekly.')).not.toContain('go');
  });

  it('reconhece Golang em contexto inequívoco', () => {
    expect(extractTechnologies('Vaga para Golang developer')).toContain('go');
  });

  it('inclui tags entregues pela fonte mesmo fora do vocabulário', () => {
    const found = extractTechnologies('texto sem tecnologia', ['Elasticsearch', 'FerramentaInterna']);
    expect(found).toContain('elasticsearch');
    expect(found).toContain('ferramentainterna');
  });
});

describe('inferSeniority', () => {
  it('lê a senioridade do título', () => {
    expect(inferSeniority('Desenvolvedor Júnior')).toBe('junior');
    expect(inferSeniority('Senior Software Engineer')).toBe('senior');
    expect(inferSeniority('Tech Lead Frontend')).toBe('lead');
    expect(inferSeniority('Estágio em Desenvolvimento')).toBe('estagio');
    expect(inferSeniority('Engenheiro Pleno')).toBe('pleno');
  });

  it('estágio vence senioridade citada no mesmo título', () => {
    expect(inferSeniority('Estágio em time de engenharia sênior')).toBe('estagio');
  });

  it('devolve null quando o título não indica nível', () => {
    expect(inferSeniority('Desenvolvedor de Software')).toBeNull();
  });
});

describe('inferWorkMode', () => {
  it('prioriza o dado da fonte sobre qualquer dedução', () => {
    const result = inferWorkMode({ isRemote: false, isHybrid: false, location: 'Remote' }, 'Remote Dev', 'remoto');
    expect(result.isRemote).toBe(false);
    expect(result.inferred).toBe(false);
  });

  it('deduz remoto do texto quando a fonte não informa', () => {
    const result = inferWorkMode({ location: '100% remoto' }, 'Dev', '');
    expect(result.isRemote).toBe(true);
    expect(result.inferred).toBe(true);
  });

  it('híbrido tem precedência sobre remoto', () => {
    const result = inferWorkMode({ location: 'Híbrido - São Paulo' }, 'Dev remoto', '');
    expect(result.isHybrid).toBe(true);
    expect(result.isRemote).toBe(false);
  });

  it('devolve null quando nada indica modalidade', () => {
    const result = inferWorkMode({ location: 'São Paulo' }, 'Dev', 'descrição neutra');
    expect(result.isRemote).toBeNull();
    expect(result.inferred).toBe(false);
  });
});

describe('extractSections', () => {
  it('separa requisitos de diferenciais pelos cabeçalhos', () => {
    const description = [
      'Sobre a vaga',
      'Trabalhamos com produto.',
      'Requisitos',
      '• Experiência com React',
      '• TypeScript',
      'Diferenciais',
      '• Next.js',
      'Benefícios',
      '• Vale refeição',
    ].join('\n');

    const sections = extractSections(description);
    expect(sections.requirements).toEqual(['Experiência com React', 'TypeScript']);
    expect(sections.niceToHave).toEqual(['Next.js']);
    // Benefícios encerram a seção: não viram requisito.
    expect(sections.requirements).not.toContain('Vale refeição');
  });

  it('reconhece cabeçalhos em inglês', () => {
    const sections = extractSections(
      ['Requirements', '• 3 years of React', 'Nice to have', '• GraphQL'].join('\n'),
    );
    expect(sections.requirements).toEqual(['3 years of React']);
    expect(sections.niceToHave).toEqual(['GraphQL']);
  });

  it('sem cabeçalho, os bullets viram requisitos', () => {
    const sections = extractSections(['• React', '• TypeScript'].join('\n'));
    expect(sections.requirements).toEqual(['React', 'TypeScript']);
    expect(sections.niceToHave).toEqual([]);
  });

  it('deduplica itens repetidos', () => {
    const sections = extractSections(['Requisitos', '• React', '• react', '• React'].join('\n'));
    expect(sections.requirements).toHaveLength(1);
  });

  it('descrição sem bullets não gera requisitos falsos', () => {
    expect(extractSections('Um parágrafo corrido sem lista alguma.').requirements).toEqual([]);
  });
});

describe('toIsoDate', () => {
  it('aceita epoch em segundos e milissegundos', () => {
    expect(toIsoDate(1700000000)).toBe(new Date(1700000000000).toISOString());
    expect(toIsoDate(1700000000000)).toBe(new Date(1700000000000).toISOString());
  });

  it('aceita ISO e devolve null para lixo', () => {
    expect(toIsoDate('2025-03-10T12:00:00Z')).toBe('2025-03-10T12:00:00.000Z');
    expect(toIsoDate('ontem')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate('')).toBeNull();
  });
});

describe('normalizeEmploymentType', () => {
  it('normaliza valores da fonte e do texto', () => {
    expect(normalizeEmploymentType('Full-time')).toBe('integral');
    expect(normalizeEmploymentType('Internship')).toBe('estagio');
    expect(normalizeEmploymentType(null, 'Contratação CLT com benefícios')).toBe('clt');
    expect(normalizeEmploymentType(null, 'texto neutro')).toBeNull();
  });
});

describe('normalizeRawJob', () => {
  it('marca a procedência de cada campo (§4)', () => {
    const job = normalizeRawJob(
      'greenhouse',
      rawJob({ title: 'Desenvolvedor Front-end Sênior', location: 'São Paulo', publishedAt: '2025-01-10T00:00:00Z' }),
    );

    expect(job.fieldOrigins.location).toBe('source');
    expect(job.fieldOrigins.publishedAt).toBe('source');
    // Senioridade nunca vem da fonte: quando existe, é sempre dedução nossa.
    expect(job.seniority).toBe('senior');
    expect(job.fieldOrigins.seniority).toBe('inferred');
    expect(job.fieldOrigins.salary).toBe('absent');
  });

  it('senioridade ausente no título fica marcada como ausente, não deduzida', () => {
    const job = normalizeRawJob('greenhouse', rawJob({ title: 'Desenvolvedor de Software' }));
    expect(job.seniority).toBeNull();
    expect(job.fieldOrigins.seniority).toBe('absent');
  });

  it('NUNCA inventa salário (§21)', () => {
    const job = normalizeRawJob(
      'greenhouse',
      rawJob({ descriptionHtml: '<p>Salário compatível com o mercado</p>' }),
    );
    expect(job.salary).toBeNull();
    expect(job.salaryMin).toBeNull();
    expect(job.salaryMax).toBeNull();
    expect(job.fieldOrigins.salary).toBe('absent');
  });

  it('usa o salário quando a fonte informa', () => {
    const job = normalizeRawJob('ashby', rawJob({ salaryText: 'R$ 8.000 - R$ 12.000', salaryMin: 8000 }));
    expect(job.salary).toBe('R$ 8.000 - R$ 12.000');
    expect(job.fieldOrigins.salary).toBe('source');
  });

  it('mantém localização nula quando a fonte não informa (§3)', () => {
    const job = normalizeRawJob('remoteok', rawJob({ location: null }));
    expect(job.location).toBeNull();
    expect(job.fieldOrigins.location).toBe('absent');
  });

  it('trata string vazia de localização como ausência', () => {
    const job = normalizeRawJob('remoteok', rawJob({ location: '   ' }));
    expect(job.location).toBeNull();
  });

  it('gera impressão digital estável', () => {
    const a = normalizeRawJob('greenhouse', rawJob());
    const b = normalizeRawJob('lever', rawJob({ sourceJobId: 'outro' }));
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe('');
  });

  it('sobrevive a uma vaga praticamente vazia', () => {
    const job = normalizeRawJob('arbeitnow', {
      sourceJobId: 'x',
      title: 'Dev',
      company: 'Empresa',
      sourceUrl: '',
      raw: null,
    });
    expect(job.title).toBe('Dev');
    expect(job.requirements).toEqual([]);
    expect(job.technologies).toEqual([]);
    expect(job.description).toBe('');
  });

  it('usa a URL da vaga como destino de candidatura quando não há outra', () => {
    const job = normalizeRawJob('greenhouse', rawJob({ applicationUrl: null }));
    expect(job.applicationUrl).toBe(job.sourceUrl);
  });
});
