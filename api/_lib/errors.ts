/** Erros de API com codigo estavel para o frontend traduzir. */
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
  | 'internal_error';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  ai_unavailable: 503,
  ai_not_configured: 503,
  ai_invalid_response: 502,
  method_not_allowed: 405,
  payload_too_large: 413,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details ?? null;
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError('bad_request', message, details);
export const unauthorized = (message = 'Sessão inválida ou expirada.') => new ApiError('unauthorized', message);
export const forbidden = (message = 'Você não tem acesso a este recurso.') => new ApiError('forbidden', message);
export const notFound = (message = 'Recurso não encontrado.') => new ApiError('not_found', message);
