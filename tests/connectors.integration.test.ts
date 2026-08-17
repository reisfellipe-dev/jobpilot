/**
 * Teste de integração REAL contra as APIs públicas das fontes.
 *
 * Fica desligado por padrão: depende de rede e de serviços de terceiros, então
 * não pode quebrar o build. Rode manualmente quando quiser confirmar que os
 * contratos das fontes continuam válidos:
 *
 *   JOBPILOT_LIVE_TEST=1 npx vitest run tests/connectors.integration.test.ts
 *
 * É este teste que impede o projeto de prometer integração que não funciona.
 */
import { describe, expect, it } from 'vitest';
import { greenhouseConnector } from '../api/_services/discovery/connectors/greenhouse';
import { leverConnector } from '../api/_services/discovery/connectors/lever';
import { ashbyConnector } from '../api/_services/discovery/connectors/ashby';
import { arbeitnowConnector, remoteOkConnector, remotiveConnector } from '../api/_services/discovery/connectors/aggregators';
import { normalizeRawJob } from '@shared/discovery/normalize';
import type { ConnectorContext, JobSourceConnector } from '@shared/discovery/types';

const LIVE = process.env.JOBPILOT_LIVE_TEST === '1';

function context(identifier = ''): ConnectorContext {
  return { identifier, searchTerms: ['react developer'], since: null, limit: 10 };
}

/** Boards públicos usados apenas como amostra de verificação do contrato. */
const ATS_CASES: Array<{ connector: JobSourceConnector; identifier: string }> = [
  { connector: greenhouseConnector, identifier: 'stripe' },
  { connector: leverConnector, identifier: 'leverdemo' },
  { connector: ashbyConnector, identifier: 'ashby' },
];

const AGGREGATORS: JobSourceConnector[] = [remotiveConnector, remoteOkConnector, arbeitnowConnector];

describe.skipIf(!LIVE)('conectores — integração real', () => {
  it.each(ATS_CASES)('$connector.kind devolve vagas normalizáveis', async ({ connector, identifier }) => {
    const result = await connector.fetchJobs(context(identifier));

    expect(result.jobs.length).toBeGreaterThan(0);

    for (const raw of result.jobs.slice(0, 5)) {
      const job = normalizeRawJob(connector.kind, raw);

      expect(job.title, 'título').not.toBe('');
      expect(job.company, 'empresa').not.toBe('');
      expect(job.sourceUrl, 'URL de origem').toMatch(/^https?:\/\//);
      expect(job.fingerprint, 'impressão digital').not.toBe('');
      expect(job.sourceJobId, 'id na fonte').not.toBe('');

      // A regra central: ausência nunca vira invenção.
      if (job.salary === null) expect(job.fieldOrigins.salary).toBe('absent');
      if (job.location === null) expect(job.fieldOrigins.location).toBe('absent');

      // Descrição precisa virar texto limpo, sem tags.
      expect(job.description).not.toMatch(/<script|<\/p>|<li>/i);
    }
  }, 60_000);

  it.each(AGGREGATORS)('$kind devolve vagas normalizáveis', async (connector) => {
    const result = await connector.fetchJobs(context());

    expect(result.jobs.length).toBeGreaterThan(0);

    for (const raw of result.jobs.slice(0, 5)) {
      const job = normalizeRawJob(connector.kind, raw);
      expect(job.title).not.toBe('');
      expect(job.company).not.toBe('');
      expect(job.fingerprint).not.toBe('');
      expect(job.description).not.toMatch(/<script|<\/p>/i);
    }
  }, 60_000);

  it('board inexistente falha de forma explícita, sem cadastrar fonte fantasma', async () => {
    await expect(
      greenhouseConnector.fetchJobs(context('board-que-nao-existe-jobpilot-teste')),
    ).rejects.toMatchObject({ kind: 'not_found' });
  }, 30_000);

  it('extrai as perguntas reais do formulário no Greenhouse', async () => {
    const { fetchGreenhouseQuestions } = await import('../api/_services/discovery/connectors/greenhouse');
    const jobs = await greenhouseConnector.fetchJobs(context('stripe'));
    const first = jobs.jobs[0];
    expect(first).toBeDefined();

    const questions = await fetchGreenhouseQuestions('stripe', first!.sourceJobId);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((question) => /name/i.test(question.label ?? ''))).toBe(true);
  }, 60_000);
});

describe('conectores — contrato estático', () => {
  it('todo conector declara identidade e documentação', () => {
    for (const connector of [greenhouseConnector, leverConnector, ashbyConnector, ...AGGREGATORS]) {
      expect(connector.kind).toBeTruthy();
      expect(connector.label).toBeTruthy();
      expect(connector.documentationUrl).toMatch(/^https:\/\//);
      expect(typeof connector.fetchJobs).toBe('function');
    }
  });

  it('conectores por empresa exigem identificador e não quebram sem ele', async () => {
    for (const connector of [greenhouseConnector, leverConnector, ashbyConnector]) {
      expect(connector.requiresIdentifier).toBe(true);
      const result = await connector.fetchJobs(context(''));
      expect(result.jobs).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it('agregadores não exigem identificador', () => {
    for (const connector of AGGREGATORS) {
      expect(connector.requiresIdentifier).toBe(false);
    }
  });
});
