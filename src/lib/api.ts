/**
 * Cliente HTTP da API interna.
 * Anexa o JWT do Supabase, normaliza erros e nunca guarda segredos.
 */
import { getAccessToken, supabase } from './supabase';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'rate_limited'
  | 'ai_unavailable'
  | 'ai_not_configured'
  | 'ai_invalid_response'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'internal_error'
  | 'offline';

export interface ValidationIssue {
  field: string;
  message: string;
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Issues de validação, quando o erro veio do Zod no servidor. */
  get issues(): ValidationIssue[] {
    const details = this.details as { issues?: ValidationIssue[] } | null;
    return Array.isArray(details?.issues) ? details.issues : [];
  }

  get isAuthError(): boolean {
    return this.code === 'unauthorized';
  }

  get isAIError(): boolean {
    return this.code === 'ai_unavailable' || this.code === 'ai_not_configured' || this.code === 'ai_invalid_response';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Rotas públicas não exigem token (apenas /health). */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, anonymous = false } = options;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiClientError('offline', 'Você está offline. Reconecte para continuar.', 0);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = await getAccessToken();
    if (!token) {
      throw new ApiClientError('unauthorized', 'Sua sessão expirou. Entre novamente.', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError('offline', 'Não foi possível falar com o servidor. Verifique sua conexão.', 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const code = (errorPayload?.code as ApiErrorCode) ?? 'internal_error';
    const message = errorPayload?.message ?? 'Não foi possível concluir a operação.';

    // Sessão inválida: encerra localmente para evitar estado inconsistente.
    if (response.status === 401) {
      void supabase.auth.signOut();
    }

    throw new ApiClientError(code, message, response.status, errorPayload?.details ?? null);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  health: () => request<{ status: string; config: unknown }>('health', { anonymous: true }),
};

/** Mensagem pronta para exibição, com fallback seguro. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Algo deu errado. Tente novamente.';
}
