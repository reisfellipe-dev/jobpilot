/**
 * AIService: decide qual provider usar, aplica fallback controlado e
 * devolve sempre um resultado tipado (§3/§6/§46).
 *
 * Regras de fallback:
 *  - So existe fallback quando a preferencia efetiva e "auto".
 *  - Operacoes marcadas como `heavy` exigem consentimento do usuario
 *    (settings.allow_fallback) para nao gerar custo extra sem controle (§6).
 *  - `context_length` nunca faz fallback: o conteudo falharia nos dois providers.
 */
import type { AIProviderName } from '../../../shared/constants.js';
import { getEnv, type ServerEnv } from '../../_lib/env.js';
import { ApiError } from '../../_lib/errors.js';
import { GroqProvider } from './providers/groq.js';
import { NvidiaProvider } from './providers/nvidia.js';
import { AIError, type AIProvider, type AIUsage, type OutputSchema } from './types.js';

export type CostTier = 'light' | 'heavy';

export interface AIUserPreferences {
  /** Preferencia do usuario; 'auto' delega ao servidor. */
  providerPreference: AIProviderName | 'auto';
  allowFallback: boolean;
}

export interface AIOperation<T> {
  /** Identificador usado no rate limit e na trilha de uso. */
  operation: string;
  system: string;
  user: string;
  schema: OutputSchema<T>;
  schemaHint: string;
  temperature?: number;
  maxTokens?: number;
  costTier: CostTier;
}

export interface AIRunResult<T> {
  data: T;
  provider: AIProviderName;
  model: string;
  usage: AIUsage;
  attempts: number;
  repaired: boolean;
  fallbackUsed: boolean;
}

export class AIService {
  private readonly env: ServerEnv;
  private readonly providers: Record<AIProviderName, AIProvider>;

  constructor(env: ServerEnv = getEnv()) {
    this.env = env;
    this.providers = {
      groq: new GroqProvider(env.groq, env.aiTimeoutMs, env.aiMaxOutputTokens),
      nvidia: new NvidiaProvider(env.nvidia, env.aiTimeoutMs, env.aiMaxOutputTokens),
    };
  }

  /** Preferencia efetiva: o usuario pode restringir, nunca ampliar alem do configurado. */
  private resolveOrder(prefs: AIUserPreferences): AIProviderName[] {
    const serverChoice = this.env.aiProvider;
    const userChoice = prefs.providerPreference;

    let order: AIProviderName[];
    if (serverChoice !== 'auto') order = [serverChoice];
    else if (userChoice !== 'auto') order = [userChoice];
    else order = ['groq', 'nvidia'];

    const configured = order.filter((name) => this.providers[name].isConfigured());
    if (configured.length > 0) return configured;

    // Preferencia escolhida nao esta configurada: tenta qualquer provider disponivel.
    return (['groq', 'nvidia'] as AIProviderName[]).filter((name) => this.providers[name].isConfigured());
  }

  private canFallback(prefs: AIUserPreferences, tier: CostTier, error: AIError): boolean {
    if (!this.env.aiFallbackEnabled) return false;
    if (this.env.aiProvider !== 'auto') return false;
    if (prefs.providerPreference !== 'auto') return false;
    if (tier === 'heavy' && !prefs.allowFallback) return false;
    if (error.code === 'context_length') return false;
    return true;
  }

  status() {
    return {
      serverPreference: this.env.aiProvider,
      fallbackEnabled: this.env.aiFallbackEnabled,
      providers: (['groq', 'nvidia'] as AIProviderName[]).map((name) => ({
        name,
        configured: this.providers[name].isConfigured(),
        model: this.providers[name].model,
        jsonMode: this.providers[name].supportsJsonMode(),
      })),
      available: (['groq', 'nvidia'] as AIProviderName[]).some((name) => this.providers[name].isConfigured()),
    };
  }

  isAvailable(): boolean {
    return this.status().available;
  }

  async run<T>(operation: AIOperation<T>, prefs: AIUserPreferences): Promise<AIRunResult<T>> {
    const order = this.resolveOrder(prefs);
    if (order.length === 0) {
      throw new ApiError(
        'ai_not_configured',
        'Nenhum provider de IA está configurado. Defina GROQ_API_KEY ou NVIDIA_API_KEY.',
      );
    }

    let lastError: AIError | null = null;

    for (let i = 0; i < order.length; i += 1) {
      const name = order[i]!;
      const provider = this.providers[name];
      try {
        const result = await provider.analyze({
          system: operation.system,
          user: operation.user,
          schema: operation.schema,
          schemaHint: operation.schemaHint,
          ...(operation.temperature !== undefined ? { temperature: operation.temperature } : {}),
          ...(operation.maxTokens !== undefined ? { maxTokens: operation.maxTokens } : {}),
        });
        return {
          data: result.data,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          attempts: result.attempts,
          repaired: result.repaired,
          fallbackUsed: i > 0,
        };
      } catch (error) {
        const aiError =
          error instanceof AIError
            ? error
            : new AIError('unknown', error instanceof Error ? error.message : 'Falha desconhecida na IA.', {
                provider: name,
              });
        lastError = aiError;
        console.warn(`[ai] provider ${name} falhou em ${operation.operation}: ${aiError.code} - ${aiError.message}`);

        const hasNext = i < order.length - 1;
        if (!hasNext || !this.canFallback(prefs, operation.costTier, aiError)) break;
      }
    }

    throw toApiError(lastError, operation.costTier);
  }
}

/** Traduz falhas de IA para erros de API amigaveis (§45). */
export function toApiError(error: AIError | null, tier: CostTier): ApiError {
  if (!error) {
    return new ApiError('ai_unavailable', 'Serviço de IA temporariamente indisponível.');
  }
  switch (error.code) {
    case 'not_configured':
      return new ApiError('ai_not_configured', error.message);
    case 'auth':
      return new ApiError('ai_not_configured', 'A credencial do provider de IA foi recusada. Verifique a chave configurada.');
    case 'rate_limit':
      return new ApiError('rate_limited', 'O provider de IA atingiu o limite de uso. Tente novamente em alguns minutos.');
    case 'context_length':
      return new ApiError(
        'bad_request',
        'O conteúdo enviado é grande demais para o modelo configurado. Reduza o texto e tente de novo.',
      );
    case 'invalid_response':
      return new ApiError(
        'ai_invalid_response',
        'A IA não devolveu uma resposta válida depois das tentativas de correção. Tente novamente.',
      );
    case 'timeout':
      return new ApiError(
        'ai_unavailable',
        tier === 'heavy'
          ? 'A IA demorou demais para responder nesta operação. Tente novamente com um conteúdo menor.'
          : 'A IA demorou demais para responder. Tente novamente.',
      );
    default:
      return new ApiError('ai_unavailable', 'Serviço de IA temporariamente indisponível.');
  }
}

let singleton: AIService | null = null;
export function getAIService(): AIService {
  if (!singleton) singleton = new AIService();
  return singleton;
}
