/**
 * Acesso centralizado a variaveis de ambiente do servidor.
 * Nenhuma chave de IA sai daqui em direcao ao navegador.
 */
import type { AIProviderName } from '../../shared/constants';

function read(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = read(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = read(name).toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export type JsonModeSetting = 'auto' | 'on' | 'off';

function readJsonMode(name: string): JsonModeSetting {
  const raw = read(name).toLowerCase();
  if (raw === 'on' || raw === 'true' || raw === '1') return 'on';
  if (raw === 'off' || raw === 'false' || raw === '0') return 'off';
  return 'auto';
}

export interface ProviderEnv {
  apiKey: string;
  model: string;
  baseUrl: string;
  jsonMode: JsonModeSetting;
}

export interface ServerEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  aiProvider: AIProviderName | 'auto';
  aiFallbackEnabled: boolean;
  aiTimeoutMs: number;
  aiMaxOutputTokens: number;
  groq: ProviderEnv;
  nvidia: ProviderEnv;
}

export function getEnv(): ServerEnv {
  const provider = read('AI_PROVIDER').toLowerCase();
  const aiProvider: AIProviderName | 'auto' =
    provider === 'groq' || provider === 'nvidia' ? provider : 'auto';

  return {
    supabaseUrl: read('SUPABASE_URL') || read('VITE_SUPABASE_URL'),
    supabaseAnonKey: read('SUPABASE_ANON_KEY') || read('VITE_SUPABASE_ANON_KEY'),
    aiProvider,
    aiFallbackEnabled: readBool('AI_FALLBACK_ENABLED', true),
    aiTimeoutMs: readInt('AI_TIMEOUT_MS', 45_000, 5_000, 120_000),
    aiMaxOutputTokens: readInt('AI_MAX_OUTPUT_TOKENS', 4000, 256, 16_000),
    groq: {
      apiKey: read('GROQ_API_KEY'),
      model: read('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      baseUrl: read('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1',
      jsonMode: readJsonMode('GROQ_JSON_MODE'),
    },
    nvidia: {
      apiKey: read('NVIDIA_API_KEY'),
      model: read('NVIDIA_MODEL') || 'meta/llama-3.3-70b-instruct',
      baseUrl: read('NVIDIA_BASE_URL') || 'https://integrate.api.nvidia.com/v1',
      jsonMode: readJsonMode('NVIDIA_JSON_MODE'),
    },
  };
}

/** Diagnostico exibido em /api/health - nunca inclui valores de chave. */
export function describeEnv(env: ServerEnv) {
  return {
    supabaseConfigured: Boolean(env.supabaseUrl && env.supabaseAnonKey),
    aiProvider: env.aiProvider,
    fallbackEnabled: env.aiFallbackEnabled,
    providers: {
      groq: { configured: Boolean(env.groq.apiKey), model: env.groq.model },
      nvidia: { configured: Boolean(env.nvidia.apiKey), model: env.nvidia.model },
    },
  };
}
