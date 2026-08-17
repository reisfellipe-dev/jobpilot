/**
 * Detecção de fonte e mapeamento de campos de candidatura (§2, §18, §19, §20, §42).
 * O que estes testes protegem: o sistema nunca responder por conta própria.
 */
import { describe, expect, it } from 'vitest';
import { detectSource, unknownHostMessage } from '../api/_services/discovery/connectors/detect';
import { GENERIC_QUESTIONS, mapQuestion, mapQuestions, questionKey, type MapperProfile } from '../api/_services/applications/field-mapping';
import { getApplicationConnector } from '../api/_services/applications/connectors';
import { UNSUPPORTED_SOURCE_INFO } from '@shared/discovery/types';

function profile(overrides: Partial<MapperProfile> = {}): MapperProfile {
  return {
    fullName: 'Ana Souza Lima',
    email: 'ana@exemplo.com',
    phone: '+55 11 99999-0000',
    location: 'São Paulo, SP',
    headline: 'Desenvolvedora Front-end',
    summary: 'Atuo com interfaces web.',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/ana' },
      { label: 'GitHub', url: 'https://github.com/ana' },
    ],
    skills: ['React', 'TypeScript'],
    experiences: [{ startDate: '2021-01', endDate: '2024-12', isCurrent: false }],
    desiredRoles: ['Front-end'],
    seniority: 'pleno',
    ...overrides,
  };
}

const question = (label: string, extra: Partial<Parameters<typeof mapQuestion>[0]> = {}) => ({
  key: label,
  label,
  required: false,
  type: 'input_text',
  ...extra,
});

// =============================================================================
// Detecção de fonte
// =============================================================================
describe('detectSource', () => {
  it('reconhece Greenhouse em vários formatos de URL', () => {
    for (const url of [
      'https://boards.greenhouse.io/acme',
      'https://job-boards.greenhouse.io/acme/jobs/123',
      'https://boards.greenhouse.io/embed/job_board?for=acme',
    ]) {
      const result = detectSource(url);
      expect(result.status, url).toBe('supported');
      if (result.status === 'supported') {
        expect(result.kind).toBe('greenhouse');
        expect(result.identifier).toBe('acme');
      }
    }
  });

  it('reconhece Lever e Ashby', () => {
    const lever = detectSource('https://jobs.lever.co/acme/abc-123');
    expect(lever.status).toBe('supported');
    if (lever.status === 'supported') expect(lever.kind).toBe('lever');

    const ashby = detectSource('https://jobs.ashbyhq.com/acme');
    expect(ashby.status).toBe('supported');
    if (ashby.status === 'supported') expect(ashby.kind).toBe('ashby');
  });

  it('recusa plataformas sem integração possível, explicando o motivo (§42)', () => {
    for (const url of [
      'https://www.linkedin.com/jobs/view/123',
      'https://empresa.gupy.io/jobs/456',
      'https://br.indeed.com/viewjob?jk=1',
      'https://www.catho.com.br/vagas/1',
    ]) {
      const result = detectSource(url);
      expect(result.status, url).toBe('unsupported');
      if (result.status === 'unsupported') {
        expect(result.info.reason.length).toBeGreaterThan(20);
      }
    }
  });

  it('host desconhecido devolve orientação, não promessa', () => {
    const result = detectSource('https://carreiras.empresaqualquer.com.br/vagas');
    expect(result.status).toBe('unknown');
    const message = unknownHostMessage('carreiras.empresaqualquer.com.br');
    expect(message).toContain('Greenhouse');
    expect(message).not.toMatch(/em breve|futuramente ser[aá] suportad/i);
  });

  it('URL inválida não quebra', () => {
    expect(detectSource('não é uma url').status).toBe('unknown');
    expect(detectSource('').status).toBe('unknown');
  });

  it('toda fonte não suportada tem motivo declarado', () => {
    for (const info of UNSUPPORTED_SOURCE_INFO) {
      expect(info.reason.length).toBeGreaterThan(20);
      expect(info.label.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Conectores de candidatura
// =============================================================================
describe('getApplicationConnector', () => {
  it('NENHUM conector promete envio automático (§16, §17)', () => {
    for (const source of ['greenhouse', 'lever', 'ashby', 'remotive', 'remoteok', 'arbeitnow', null]) {
      const connector = getApplicationConnector(source);
      expect(connector.canAutoSubmit, String(source)).toBe(false);
      expect(connector.autoSubmitReason.length).toBeGreaterThan(20);
    }
  });

  it('fonte desconhecida cai no conector externo', () => {
    expect(getApplicationConnector('fonte-inexistente').kind).toBe('generic');
  });
});

// =============================================================================
// Mapeamento de campos
// =============================================================================
describe('mapQuestion — dados diretos do perfil', () => {
  it('preenche nome, sobrenome e e-mail como KNOWN', () => {
    expect(mapQuestion(question('First Name'), profile())).toMatchObject({ state: 'KNOWN', value: 'Ana' });
    expect(mapQuestion(question('Last Name'), profile())).toMatchObject({ state: 'KNOWN', value: 'Souza Lima' });
    expect(mapQuestion(question('Email'), profile())).toMatchObject({ state: 'KNOWN', value: 'ana@exemplo.com' });
  });

  it('reconhece rótulos em português', () => {
    expect(mapQuestion(question('Telefone'), profile()).value).toBe('+55 11 99999-0000');
    expect(mapQuestion(question('Localização'), profile()).value).toBe('São Paulo, SP');
  });

  it('encontra LinkedIn e GitHub nos links', () => {
    expect(mapQuestion(question('LinkedIn Profile'), profile()).value).toBe('https://linkedin.com/in/ana');
    expect(mapQuestion(question('GitHub'), profile()).value).toBe('https://github.com/ana');
  });

  it('campo sem dado no perfil vira UNKNOWN com orientação — nunca inventado', () => {
    const result = mapQuestion(question('Email'), profile({ email: '' }));
    expect(result.state).toBe('UNKNOWN');
    expect(result.value).toBe('');
    expect(result.note).toContain('perfil');
  });
});

describe('mapQuestion — anos de experiência', () => {
  it('calcula e marca como INFERRED, com o cálculo explícito', () => {
    const result = mapQuestion(question('Years of experience'), profile());
    expect(result.state).toBe('INFERRED');
    expect(Number(result.value)).toBeGreaterThanOrEqual(3);
    expect(result.note).toContain('Cálculo');
  });

  it('sem datas nas experiências, admite que não sabe', () => {
    const result = mapQuestion(question('Anos de experiência'), profile({ experiences: [] }));
    expect(result.state).toBe('UNKNOWN');
    expect(result.value).toBe('');
  });
});

describe('mapQuestion — perguntas sobre tecnologia (§19)', () => {
  it('responde SIM com evidência quando a skill está no perfil', () => {
    const result = mapQuestion(question('Você possui experiência com React?'), profile());
    expect(result.state).toBe('KNOWN');
    expect(result.value).toBe('Sim');
    expect(result.note).toContain('react');
  });

  it('responde NÃO como INFERIDO quando a skill não consta', () => {
    const result = mapQuestion(question('Do you have experience with Kubernetes?'), profile());
    expect(result.state).toBe('INFERRED');
    expect(result.value).toBe('Não');
    expect(result.note).toContain('não consta');
  });

  it('usa as opções reais do formulário quando existem', () => {
    const result = mapQuestion(
      question('Você tem experiência com React?', { options: ['Yes', 'No'], type: 'select' }),
      profile(),
    );
    expect(result.value).toBe('Yes');
  });
});

describe('mapQuestion — perguntas que só o usuário responde (§20)', () => {
  it('pretensão salarial nunca é estimada (§21)', () => {
    const result = mapQuestion(question('What is your salary expectation?'), profile());
    expect(result.state).toBe('USER_REQUIRED');
    expect(result.value).toBe('');
    expect(result.note).toContain('não estima salário');
  });

  it('visto e autorização de trabalho ficam com o usuário', () => {
    expect(mapQuestion(question('Do you require visa sponsorship?'), profile()).state).toBe('USER_REQUIRED');
    expect(mapQuestion(question('Autorização para trabalhar no país'), profile()).state).toBe('USER_REQUIRED');
  });

  it('dados sensíveis de autodeclaração não são preenchidos', () => {
    const result = mapQuestion(question('Gender'), profile());
    expect(result.state).toBe('USER_REQUIRED');
    expect(result.note).toContain('sensível');
  });

  it('upload de currículo é sempre do usuário', () => {
    const result = mapQuestion(question('Resume/CV', { type: 'input_file', required: true }), profile());
    expect(result.state).toBe('USER_REQUIRED');
  });

  it('pergunta desconhecida vai para revisão, não para invenção (§18)', () => {
    const result = mapQuestion(
      question('Descreva um conflito que você resolveu no último trimestre'),
      profile(),
    );
    expect(result.state).toBe('USER_REQUIRED');
    expect(result.value).toBe('');
    expect(result.note).toContain('sem base no perfil');
  });
});

describe('mapQuestions', () => {
  it('reaproveita resposta salva anteriormente', () => {
    const saved = new Map([[questionKey('How did you hear about us?'), 'Pelo site da empresa']]);
    const [field] = mapQuestions([question('How did you hear about us?')], profile(), { savedAnswers: saved });
    expect(field).toMatchObject({ state: 'KNOWN', value: 'Pelo site da empresa', origin: 'resposta salva' });
  });

  it('não duplica campos com o mesmo rótulo', () => {
    const fields = mapQuestions([question('Email'), question('E-mail'), question('Email')], profile());
    expect(fields.filter((field) => field.value === 'ana@exemplo.com')).toHaveLength(1);
  });

  it('ignora perguntas sem rótulo', () => {
    expect(mapQuestions([question('   ')], profile())).toHaveLength(0);
  });

  it('o conjunto genérico cobre os campos essenciais', () => {
    const fields = mapQuestions(GENERIC_QUESTIONS, profile());
    const keys = fields.map((field) => field.label.toLowerCase());
    expect(keys.some((key) => key.includes('mail'))).toBe(true);
    expect(keys.some((key) => key.includes('nome'))).toBe(true);
    expect(fields.every((field) => ['KNOWN', 'INFERRED', 'UNKNOWN', 'USER_REQUIRED'].includes(field.state))).toBe(true);
  });

  it('perfil vazio produz campos vazios e revisáveis, nunca inventados', () => {
    const empty = profile({ fullName: '', email: '', phone: '', location: '', links: [], skills: [], experiences: [] });
    const fields = mapQuestions(GENERIC_QUESTIONS, empty);
    expect(fields.every((field) => field.value === '' || field.state === 'USER_REQUIRED')).toBe(true);
  });
});
