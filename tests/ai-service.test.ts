/**
 * Comportamento do AIService: seleção de provider, fallback controlado,
 * degradação de JSON mode e tradução de erros (§3, §5, §6, §7, §45, §46).
 * Nenhuma rede real é usada: o fetch global é substituído.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AIService, toApiError, type AIOperation, type AIUserPreferences } from '../api/_services/ai/service';
import { AIError } from '../api/_services/ai/types';
import type { ServerEnv } from '../api/_lib/env';
import { ApiError } from '../api/_lib/errors';

const SCHEMA = z.object({ ok: z.boolean(), nota: z.string().default('') });

const OPERATION: AIOperation<z.infer<typeof SCHEMA>> = {
  operation: 'job.analyze',
  system: 'sistema',
  user: 'usuário',
  schema: SCHEMA,
  schemaHint: '{ "ok": boolean }',
  costTier: 'light',
};

const AUTO_PREFS: AIUserPreferences = { providerPreference: 'auto', allowFallback: true };

function makeEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'anon',
    aiProvider: 'auto',
    aiFallbackEnabled: true,
    aiTimeoutMs: 5000,
    aiMaxOutputTokens: 1000,
    groq: { apiKey: 'groq-key', model: 'groq-model', baseUrl: 'https://groq.test/v1', jsonMode: 'auto' },
    nvidia: { apiKey: 'nvidia-key', model: 'nvidia-model', baseUrl: 'https://nvidia.test/v1', jsonMode: 'auto' },
    ...overrides,
  };
}

function chatResponse(content: string, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isGroq(url: unknown): boolean {
  return String(url).includes('groq.test');
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('seleção de provider', () => {
  it('usa Groq como principal quando tudo está configurado', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}'));
    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.provider).toBe('groq');
    expect(result.fallbackUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isGroq(fetchMock.mock.calls[0]![0])).toBe(true);
  });

  it('respeita a preferência do usuário por um provider específico', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}'));
    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, { providerPreference: 'nvidia', allowFallback: true });

    expect(result.provider).toBe('nvidia');
    expect(isGroq(fetchMock.mock.calls[0]![0])).toBe(false);
  });

  it('a preferência fixada no servidor prevalece sobre a do usuário', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}'));
    const service = new AIService(makeEnv({ aiProvider: 'nvidia' }));
    const result = await service.run(OPERATION, { providerPreference: 'groq', allowFallback: true });

    expect(result.provider).toBe('nvidia');
  });

  it('usa o provider disponível quando o preferido não tem chave', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}'));
    const env = makeEnv({ groq: { apiKey: '', model: 'm', baseUrl: 'https://groq.test/v1', jsonMode: 'auto' } });
    const service = new AIService(env);
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.provider).toBe('nvidia');
  });

  it('falha com erro claro quando nenhum provider está configurado', async () => {
    const env = makeEnv({
      groq: { apiKey: '', model: 'm', baseUrl: 'https://groq.test/v1', jsonMode: 'auto' },
      nvidia: { apiKey: '', model: 'm', baseUrl: 'https://nvidia.test/v1', jsonMode: 'auto' },
    });
    const service = new AIService(env);

    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({ code: 'ai_not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.isAvailable()).toBe(false);
  });
});

describe('fallback controlado', () => {
  it('cai para a NVIDIA quando a Groq está indisponível', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? errorResponse(503, 'service unavailable') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.provider).toBe('nvidia');
    expect(result.fallbackUsed).toBe(true);
  });

  it('cai para a NVIDIA quando a credencial da Groq é recusada', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? errorResponse(401, 'invalid api key') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);
    expect(result.provider).toBe('nvidia');
  });

  it('NÃO faz fallback automático em operação pesada sem consentimento (§6)', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? errorResponse(503, 'down') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv());
    await expect(
      service.run({ ...OPERATION, costTier: 'heavy' }, { providerPreference: 'auto', allowFallback: false }),
    ).rejects.toBeInstanceOf(ApiError);

    // Só a Groq foi chamada: nenhuma chamada extra de custo.
    expect(fetchMock.mock.calls.every((call) => isGroq(call[0]))).toBe(true);
  });

  it('faz fallback em operação pesada quando o usuário autoriza', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? errorResponse(503, 'down') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv());
    const result = await service.run({ ...OPERATION, costTier: 'heavy' }, AUTO_PREFS);
    expect(result.provider).toBe('nvidia');
  });

  it('não faz fallback quando o conteúdo excede o contexto', async () => {
    fetchMock.mockImplementation(async () => errorResponse(400, 'maximum context length exceeded'));

    const service = new AIService(makeEnv());
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({ code: 'bad_request' });
    expect(fetchMock.mock.calls.every((call) => isGroq(call[0]))).toBe(true);
  });

  it('não faz fallback quando ele está desabilitado no servidor', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? errorResponse(503, 'down') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv({ aiFallbackEnabled: false }));
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toBeInstanceOf(ApiError);
  });

  it('mostra mensagem amigável quando os dois providers caem (§45)', async () => {
    fetchMock.mockImplementation(async () => errorResponse(503, 'down'));

    const service = new AIService(makeEnv());
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({
      code: 'ai_unavailable',
      message: 'Serviço de IA temporariamente indisponível.',
    });
  });

  it('traduz limite de requisições do provider', async () => {
    fetchMock.mockImplementation(async () => errorResponse(429, 'rate limit reached'));

    const service = new AIService(makeEnv());
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('trata falha de rede sem vazar detalhe interno', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });

    const service = new AIService(makeEnv());
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({ code: 'ai_unavailable' });
  });
});

describe('resposta estruturada', () => {
  it('extrai JSON envolto em markdown', async () => {
    fetchMock.mockImplementation(async () => chatResponse('```json\n{"ok":true,"nota":"boa"}\n```'));
    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.data).toEqual({ ok: true, nota: 'boa' });
    expect(result.attempts).toBe(1);
  });

  it('pede correção e aceita a segunda tentativa', async () => {
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? chatResponse('não consegui gerar json') : chatResponse('{"ok":true}');
    });

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.data.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('desiste do provider após duas respostas inválidas e usa o fallback', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isGroq(url) ? chatResponse('texto solto sem json') : chatResponse('{"ok":true}'),
    );

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.provider).toBe('nvidia');
    expect(fetchMock.mock.calls.filter((call) => isGroq(call[0]))).toHaveLength(2);
  });

  it('rejeita JSON que não bate com o schema', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":"talvez"}'));

    const service = new AIService(makeEnv());
    await expect(service.run(OPERATION, AUTO_PREFS)).rejects.toMatchObject({ code: 'ai_invalid_response' });
  });

  it('soma o consumo de tokens de todas as tentativas', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}', { prompt_tokens: 100, completion_tokens: 20 }));

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(20);
  });
});

describe('capacidade de JSON mode (§7)', () => {
  it('repete sem response_format quando o modelo não suporta', async () => {
    const bodies: string[] = [];
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      bodies.push(body);
      if (body.includes('response_format')) return errorResponse(400, "'response_format' is not supported");
      return chatResponse('{"ok":true}');
    });

    const service = new AIService(makeEnv());
    const result = await service.run(OPERATION, AUTO_PREFS);

    expect(result.data.ok).toBe(true);
    expect(bodies[0]).toContain('response_format');
    expect(bodies[1]).not.toContain('response_format');
  });

  it('não envia response_format quando desligado por configuração', async () => {
    fetchMock.mockImplementation(async () => chatResponse('{"ok":true}'));
    const env = makeEnv({
      groq: { apiKey: 'k', model: 'm', baseUrl: 'https://groq.test/v1', jsonMode: 'off' },
    });

    const service = new AIService(env);
    await service.run(OPERATION, AUTO_PREFS);

    expect(String(fetchMock.mock.calls[0]![1].body)).not.toContain('response_format');
  });
});

describe('status e tradução de erros', () => {
  it('descreve os providers sem expor chaves', () => {
    const status = new AIService(makeEnv()).status();
    const serialized = JSON.stringify(status);

    expect(status.available).toBe(true);
    expect(status.providers).toHaveLength(2);
    expect(serialized).not.toContain('groq-key');
    expect(serialized).not.toContain('nvidia-key');
  });

  it('mapeia cada código de erro de IA para a resposta de API adequada', () => {
    expect(toApiError(new AIError('not_configured', 'x'), 'light').code).toBe('ai_not_configured');
    expect(toApiError(new AIError('auth', 'x'), 'light').code).toBe('ai_not_configured');
    expect(toApiError(new AIError('rate_limit', 'x'), 'light').code).toBe('rate_limited');
    expect(toApiError(new AIError('context_length', 'x'), 'light').code).toBe('bad_request');
    expect(toApiError(new AIError('invalid_response', 'x'), 'light').code).toBe('ai_invalid_response');
    expect(toApiError(new AIError('timeout', 'x'), 'heavy').code).toBe('ai_unavailable');
    expect(toApiError(new AIError('unknown', 'x'), 'light').code).toBe('ai_unavailable');
    expect(toApiError(null, 'light').code).toBe('ai_unavailable');
  });

  it('não repassa a mensagem crua do provider ao usuário', () => {
    const apiError = toApiError(new AIError('unknown', 'Internal stack trace: token sk-123'), 'light');
    expect(apiError.message).not.toContain('sk-123');
  });
});
