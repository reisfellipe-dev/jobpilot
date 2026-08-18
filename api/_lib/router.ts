import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError, type z, type ZodTypeAny } from 'zod';
import { ApiError, unauthorized } from './errors.js';
import { authenticate, extractBearerToken, type AuthenticatedUser, type Db } from './supabase.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Ctx {
  method: HttpMethod;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  user: AuthenticatedUser;
  db: Db;
  token: string;
}

export interface Route {
  method: HttpMethod;
  /** Ex.: 'resumes/:id/versions'. Segmentos com ':' viram params. */
  path: string;
  handler: (ctx: Ctx) => Promise<unknown>;
  /** Rotas publicas nao exigem autenticacao (apenas /health). */
  isPublic?: boolean;
}

export const route = (method: HttpMethod, path: string, handler: Route['handler'], isPublic = false): Route => ({
  method,
  path,
  handler,
  isPublic,
});

function matchPath(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split('/').filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const segment = segments[i]!;
    if (part.startsWith(':')) {
      if (!segment) return null;
      params[part.slice(1)] = segment;
    } else if (part !== segment) {
      return null;
    }
  }
  return params;
}

/**
 * Valida um payload com Zod e converte a falha em erro 422 legivel.
 * Generico sobre o schema (nao sobre T) para que o tipo devolvido seja sempre
 * o tipo de SAIDA - com defaults e transforms ja aplicados.
 */
export function parseWith<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.slice(0, 20).map((issue) => ({
        field: issue.path.join('.') || '(raiz)',
        message: issue.message,
      }));
      throw new ApiError('validation_failed', 'Os dados enviados são inválidos.', { issues });
    }
    throw error;
  }
}

function normalizeQuery(query: VercelRequest['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === 'route') continue;
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
  }
  return out;
}

function extractSegments(req: VercelRequest): string[] {
  const raw = req.query.route;
  if (Array.isArray(raw)) return raw.filter((segment) => segment.length > 0);
  if (typeof raw === 'string' && raw.length > 0) return raw.split('/').filter(Boolean);
  // Fallback: deriva do URL quando o parametro dinamico nao chega (dev local).
  const url = req.url ?? '';
  const path = url.split('?')[0] ?? '';
  return path.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
}

function isHttpMethod(value: string): value is HttpMethod {
  return value === 'GET' || value === 'POST' || value === 'PATCH' || value === 'PUT' || value === 'DELETE';
}

export async function handleRequest(req: VercelRequest, res: VercelResponse, routes: Route[]): Promise<void> {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const rawMethod = (req.method ?? 'GET').toUpperCase();
  if (rawMethod === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!isHttpMethod(rawMethod)) {
      throw new ApiError('method_not_allowed', `Método ${rawMethod} não suportado.`);
    }

    const segments = extractSegments(req);
    let matched: { route: Route; params: Record<string, string> } | null = null;
    let pathExists = false;

    for (const candidate of routes) {
      const params = matchPath(candidate.path, segments);
      if (params === null) continue;
      pathExists = true;
      if (candidate.method === rawMethod) {
        matched = { route: candidate, params };
        break;
      }
    }

    if (!matched) {
      throw pathExists
        ? new ApiError('method_not_allowed', `Método ${rawMethod} não permitido nesta rota.`)
        : new ApiError('not_found', `Rota /api/${segments.join('/')} não existe.`);
    }

    let user: AuthenticatedUser = { id: '', email: '' };
    let db = null as unknown as Db;
    let token = '';

    if (!matched.route.isPublic) {
      const bearer = extractBearerToken(req.headers.authorization);
      if (!bearer) throw unauthorized('Autenticação obrigatória.');
      const auth = await authenticate(bearer);
      user = auth.user;
      db = auth.db;
      token = bearer;
    }

    const result = await matched.route.handler({
      method: rawMethod,
      params: matched.params,
      query: normalizeQuery(req.query),
      body: req.body,
      user,
      db,
      token,
    });

    if (result === undefined || result === null) {
      res.status(204).end();
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
}

function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(`[api] ${error.code}: ${error.message}`, error.details ?? '');
    }
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    });
    return;
  }

  console.error('[api] erro inesperado', error);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Erro interno. Tente novamente em instantes.', details: null },
  });
}
