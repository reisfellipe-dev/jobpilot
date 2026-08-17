/**
 * Roteamento real da função serverless: despacho, guarda de autenticação e
 * formato de erro. Usa objetos de requisição/resposta simulados — nenhuma rede.
 */
import { describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { routes } from '../api/index';

interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function makeRequest(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): VercelRequest {
  return {
    method,
    url: `/api/${path}`,
    query: { route: path },
    headers: options.headers ?? {},
    body: options.body,
  } as unknown as VercelRequest;
}

async function call(request: VercelRequest): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined, headers: {} };
  const response = {
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return response;
    },
    status(code: number) {
      captured.status = code;
      return response;
    },
    json(payload: unknown) {
      captured.body = payload;
      return response;
    },
    end() {
      return response;
    },
  } as unknown as VercelResponse;

  await handler(request, response);
  return captured;
}

describe('GET /api/health (rota pública)', () => {
  it('responde 200 com o diagnóstico', async () => {
    const result = await call(makeRequest('GET', 'health'));

    expect(result.status).toBe(200);
    const body = result.body as { status: string; config: { providers: unknown } };
    expect(body.status).toBe('ok');
    expect(body.config.providers).toBeDefined();
  });

  it('não expõe valores de chave', async () => {
    const previous = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_valor_secreto_de_teste';

    const result = await call(makeRequest('GET', 'health'));
    expect(JSON.stringify(result.body)).not.toContain('gsk_valor_secreto_de_teste');

    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  });

  it('nunca é cacheada', async () => {
    const result = await call(makeRequest('GET', 'health'));
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('guarda de autenticação', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['GET', 'profile'],
    ['GET', 'resumes'],
    ['GET', 'jobs'],
    ['GET', 'applications'],
    ['GET', 'dashboard'],
    ['GET', 'settings'],
    ['GET', 'export'],
    ['GET', 'ai/status'],
    ['POST', 'ai/extract-resume'],
    ['POST', 'ai/adapt-resume'],
    ['POST', 'account/erase'],
  ];

  it.each(protectedRoutes)('%s /api/%s exige autenticação', async (method, path) => {
    const result = await call(makeRequest(method, path, { body: {} }));

    expect(result.status).toBe(401);
    expect((result.body as { error: { code: string } }).error.code).toBe('unauthorized');
  });

  it('recusa header Authorization malformado sem tocar no banco', async () => {
    const result = await call(makeRequest('GET', 'profile', { headers: { authorization: 'Bearer x' } }));
    expect(result.status).toBe(401);
  });

  it('recusa esquema de autenticação diferente de Bearer', async () => {
    const result = await call(
      makeRequest('GET', 'profile', { headers: { authorization: 'Basic dXNlcjpzZW5oYQ==' } }),
    );
    expect(result.status).toBe(401);
  });
});

describe('ordem de registro das rotas', () => {
  /**
   * O roteador devolve a PRIMEIRA rota que casa. Uma rota com parâmetro
   * ("applications/:id") casa com um caminho literal de mesmo tamanho
   * ("applications/field-answers"), então a literal precisa vir antes.
   * Este teste falha se alguém reordenar os grupos em api/index.ts.
   */
  it('nenhuma rota literal é capturada por uma rota com parâmetro', () => {
    const problems: string[] = [];

    for (let i = 0; i < routes.length; i += 1) {
      const generic = routes[i]!;
      const genericParts = generic.path.split('/');
      if (!genericParts.some((part) => part.startsWith(':'))) continue;

      for (let j = i + 1; j < routes.length; j += 1) {
        const literal = routes[j]!;
        if (literal.method !== generic.method) continue;

        const literalParts = literal.path.split('/');
        if (literalParts.length !== genericParts.length) continue;
        if (literalParts.some((part) => part.startsWith(':'))) continue;

        const captured = genericParts.every(
          (part, index) => part.startsWith(':') || part === literalParts[index],
        );
        if (captured) {
          problems.push(`${generic.method} ${generic.path} captura ${literal.path}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('não existem duas rotas idênticas', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const item of routes) {
      const key = `${item.method} ${item.path}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('somente /health é pública', () => {
    const publicRoutes = routes.filter((item) => item.isPublic).map((item) => item.path);
    expect(publicRoutes).toEqual(['health']);
  });
});

describe('erros de roteamento', () => {
  it('rota inexistente devolve 404 no formato padrão', async () => {
    const result = await call(makeRequest('GET', 'nao-existe'));

    expect(result.status).toBe(404);
    const body = result.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('nao-existe');
  });

  it('método não permitido devolve 405, não 404', async () => {
    const result = await call(makeRequest('DELETE', 'health'));

    expect(result.status).toBe(405);
    expect((result.body as { error: { code: string } }).error.code).toBe('method_not_allowed');
  });

  it('método desconhecido é rejeitado', async () => {
    const result = await call(makeRequest('TRACE', 'health'));
    expect(result.status).toBe(405);
  });

  it('OPTIONS encerra sem corpo', async () => {
    const result = await call(makeRequest('OPTIONS', 'health'));
    expect(result.status).toBe(204);
  });

  it('deriva a rota da URL quando o parâmetro dinâmico não chega', async () => {
    const request = {
      method: 'GET',
      url: '/api/health',
      query: {},
      headers: {},
    } as unknown as VercelRequest;

    const result = await call(request);
    expect(result.status).toBe(200);
  });

  it('rotas com parâmetro só casam com o número certo de segmentos', async () => {
    const tooDeep = await call(makeRequest('GET', 'resumes/abc/versions/extra'));
    expect(tooDeep.status).toBe(404);
  });
});
