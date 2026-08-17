import type { ZodType, ZodTypeDef } from 'zod';
import type { AIProviderName } from '../../../shared/constants';

/**
 * Schema visto pelo seu tipo de SAIDA.
 * Fixar o tipo de entrada em `unknown` impede que a inferencia do TypeScript
 * escolha o tipo de entrada do Zod (antes de defaults e transforms).
 */
export type OutputSchema<T> = ZodType<T, ZodTypeDef, unknown>;

export type AIErrorCode =
  | 'not_configured'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'unavailable'
  | 'context_length'
  | 'invalid_response'
  | 'json_mode_unsupported'
  | 'unknown';

/** Erro normalizado de provider - a aplicacao nunca ve erros crus de HTTP. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly provider: AIProviderName | null;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    code: AIErrorCode,
    message: string,
    options: { provider?: AIProviderName | null; retryable?: boolean; status?: number | null } = {},
  ) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.provider = options.provider ?? null;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIGenerateRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Pede JSON ao provider quando o modelo suportar. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface AIResult {
  text: string;
  provider: AIProviderName;
  model: string;
  usage: AIUsage;
}

export interface AIStructuredResult<T> extends Omit<AIResult, 'text'> {
  data: T;
  raw: string;
  /** Quantas tentativas foram necessarias ate obter JSON valido. */
  attempts: number;
  repaired: boolean;
}

export interface AIStructuredRequest<T> extends AIGenerateRequest {
  schema: OutputSchema<T>;
  /** Descricao do formato esperado, injetada no prompt. */
  schemaHint: string;
}

/**
 * Contrato unico de provider (§3).
 * A aplicacao conhece apenas esta interface - nunca Groq ou NVIDIA diretamente.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  isConfigured(): boolean;
  supportsJsonMode(): boolean;
  generate(request: AIGenerateRequest): Promise<AIResult>;
  generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResult<T>>;
  /** Modo analitico: temperatura baixa e saida estruturada obrigatoria. */
  analyze<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResult<T>>;
}
