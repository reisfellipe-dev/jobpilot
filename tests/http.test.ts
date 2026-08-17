/** Autenticação, tradução de erros do banco e limites de uso. */
import { describe, expect, it } from 'vitest';
import { extractBearerToken, mapDbError } from '../api/_lib/supabase';
import { ApiError, badRequest, forbidden, notFound, unauthorized } from '../api/_lib/errors';
import { AI_QUOTAS } from '../api/_services/ratelimit';
import { describeEnv, getEnv } from '../api/_lib/env';

describe('extractBearerToken', () => {
  it('extrai o token de um header válido', () => {
    expect(extractBearerToken('Bearer abcdefghijklmno')).toBe('abcdefghijklmno');
    expect(extractBearerToken('bearer abcdefghijklmno')).toBe('abcdefghijklmno');
  });

  it('aceita header em forma de lista', () => {
    expect(extractBearerToken(['Bearer abcdefghijklmno'])).toBe('abcdefghijklmno');
  });

  it('recusa headers inválidos', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('abcdefghijklmno')).toBeNull();
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractBearerToken('Bearer curto')).toBeNull();
  });
});

describe('mapDbError', () => {
  it('traduz códigos do Postgres para erros de API', () => {
    expect(mapDbError({ code: 'PGRST116', message: 'no rows' }).code).toBe('not_found');
    expect(mapDbError({ code: '23505', message: 'duplicate' }).code).toBe('conflict');
    expect(mapDbError({ code: '23503', message: 'fk' }).code).toBe('bad_request');
    expect(mapDbError({ code: '23514', message: 'check' }).code).toBe('validation_failed');
    expect(mapDbError({ code: '42501', message: 'rls' }).code).toBe('forbidden');
  });

  it('violação de RLS nunca vira 500 silencioso', () => {
    const error = mapDbError({ code: '42501', message: 'new row violates row-level security policy' });
    expect(error.status).toBe(403);
  });

  it('não expõe a mensagem crua do banco na resposta padrão', () => {
    const error = mapDbError({ code: '99999', message: 'relation "secrets" does not exist' });
    expect(error.message).toBe('Falha ao acessar os dados.');
    expect(error.status).toBe(500);
  });
});

describe('ApiError', () => {
  it('mapeia cada código para o status HTTP correto', () => {
    expect(new ApiError('unauthorized', 'x').status).toBe(401);
    expect(new ApiError('forbidden', 'x').status).toBe(403);
    expect(new ApiError('not_found', 'x').status).toBe(404);
    expect(new ApiError('rate_limited', 'x').status).toBe(429);
    expect(new ApiError('validation_failed', 'x').status).toBe(422);
    expect(new ApiError('ai_unavailable', 'x').status).toBe(503);
    expect(new ApiError('internal_error', 'x').status).toBe(500);
  });

  it('os atalhos produzem o código esperado', () => {
    expect(badRequest('x').code).toBe('bad_request');
    expect(unauthorized().code).toBe('unauthorized');
    expect(forbidden().code).toBe('forbidden');
    expect(notFound().code).toBe('not_found');
  });
});

describe('limites de uso da IA (§44)', () => {
  it('toda operação tem limite por janela e teto diário', () => {
    for (const [operation, quota] of Object.entries(AI_QUOTAS)) {
      expect(quota.limit, operation).toBeGreaterThan(0);
      expect(quota.windowSeconds, operation).toBeGreaterThan(0);
      expect(quota.dailyLimit, operation).toBeGreaterThanOrEqual(quota.limit);
    }
  });

  it('as operações mais caras têm limites menores', () => {
    expect(AI_QUOTAS['resume.adapt'].limit).toBeLessThan(AI_QUOTAS['answer.generate'].limit);
    expect(AI_QUOTAS['resume.extract'].limit).toBeLessThan(AI_QUOTAS['job.analyze'].limit);
  });
});

describe('configuração de ambiente', () => {
  it('o diagnóstico nunca expõe valores de chave', () => {
    const previous = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_supersecreto';

    const described = JSON.stringify(describeEnv(getEnv()));
    expect(described).not.toContain('gsk_supersecreto');
    expect(described).toContain('configured');

    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  });

  it('usa "auto" quando AI_PROVIDER é inválido', () => {
    const previous = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'openai';
    expect(getEnv().aiProvider).toBe('auto');

    if (previous === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previous;
  });

  it('mantém o timeout dentro de limites sãos', () => {
    const previous = process.env.AI_TIMEOUT_MS;
    process.env.AI_TIMEOUT_MS = '999999';
    expect(getEnv().aiTimeoutMs).toBeLessThanOrEqual(120_000);

    process.env.AI_TIMEOUT_MS = 'abc';
    expect(getEnv().aiTimeoutMs).toBe(45_000);

    if (previous === undefined) delete process.env.AI_TIMEOUT_MS;
    else process.env.AI_TIMEOUT_MS = previous;
  });
});
