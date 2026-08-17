/**
 * Rate limit das rotas de IA (§44).
 *
 * Implementado em Postgres (funcao SECURITY DEFINER + tabela ai_usage) para
 * nao introduzir Redis nem custo extra de infraestrutura. O contador vive no
 * banco, entao vale para todas as instancias serverless simultaneamente.
 */
import { ApiError } from '../_lib/errors';
import type { Db } from '../_lib/supabase';

export type AIOperationName =
  | 'resume.extract'
  | 'job.extract'
  | 'job.analyze'
  | 'resume.adapt'
  | 'answer.generate';

export interface QuotaConfig {
  limit: number;
  windowSeconds: number;
  dailyLimit: number;
}

/** Limites por usuario. Generosos para uso pessoal, restritivos contra abuso. */
export const AI_QUOTAS: Record<AIOperationName, QuotaConfig> = {
  'resume.extract': { limit: 12, windowSeconds: 3600, dailyLimit: 150 },
  'job.extract': { limit: 25, windowSeconds: 3600, dailyLimit: 150 },
  'job.analyze': { limit: 25, windowSeconds: 3600, dailyLimit: 150 },
  'resume.adapt': { limit: 12, windowSeconds: 3600, dailyLimit: 150 },
  'answer.generate': { limit: 40, windowSeconds: 3600, dailyLimit: 150 },
};

interface QuotaResponse {
  allowed: boolean;
  reason?: string;
  limit?: number;
  used?: number;
  window_seconds?: number;
  usage_id?: string;
}

function formatWindow(seconds: number): string {
  if (seconds >= 86_400) return '24 horas';
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} hora(s)`;
  return `${Math.round(seconds / 60)} minuto(s)`;
}

/**
 * Reserva uma unidade de quota. Devolve o id do registro de uso, que deve ser
 * fechado com `finalizeAIUsage` ao final da operacao.
 */
export async function consumeAIQuota(db: Db, operation: AIOperationName): Promise<string> {
  const quota = AI_QUOTAS[operation];
  const { data, error } = await db.rpc('consume_ai_quota', {
    p_operation: operation,
    p_limit: quota.limit,
    p_window_seconds: quota.windowSeconds,
    p_daily_limit: quota.dailyLimit,
  });

  if (error) {
    throw new ApiError('internal_error', 'Não foi possível validar o limite de uso da IA.', {
      db: error.message,
    });
  }

  const result = (data ?? {}) as QuotaResponse;
  if (!result.allowed) {
    const window = formatWindow(result.window_seconds ?? quota.windowSeconds);
    throw new ApiError(
      'rate_limited',
      result.reason === 'daily_limit'
        ? `Você atingiu o limite diário de ${result.limit} operações de IA. Tente novamente em algumas horas.`
        : `Limite de ${result.limit} operações desse tipo a cada ${window} atingido. Tente novamente mais tarde.`,
      { reason: result.reason ?? 'operation_limit', limit: result.limit ?? quota.limit, used: result.used ?? 0 },
    );
  }

  return result.usage_id ?? '';
}

/** Fecha o registro de uso com o provider realmente utilizado (§6). */
export async function finalizeAIUsage(
  db: Db,
  usageId: string,
  data: { provider: string | null; model: string | null; inputTokens: number; outputTokens: number; succeeded: boolean },
): Promise<void> {
  if (!usageId) return;
  const { error } = await db.rpc('finalize_ai_usage', {
    p_usage_id: usageId,
    p_provider: data.provider,
    p_model: data.model,
    p_tokens_in: data.inputTokens,
    p_tokens_out: data.outputTokens,
    p_succeeded: data.succeeded,
  });
  // Falha ao registrar uso nao pode derrubar a operacao do usuario.
  if (error) console.warn('[ratelimit] falha ao finalizar uso de IA:', error.message);
}
