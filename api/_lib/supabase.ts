/**
 * Cliente Supabase por requisicao.
 *
 * DECISAO DE SEGURANCA: o backend usa a ANON KEY combinada ao JWT do usuario.
 * Consequencia: toda query feita pelo servidor continua sujeita a Row Level
 * Security. Nao existe service_role neste projeto, portanto nao existe caminho
 * de codigo capaz de ler dados de outro usuario, nem por engano.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, unauthorized } from './errors.js';
import { getEnv } from './env.js';

export type Db = SupabaseClient;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  return token.length > 10 ? token : null;
}

export function createUserClient(accessToken: string): Db {
  const env = getEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new ApiError('internal_error', 'Supabase não está configurado no servidor.');
  }
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Valida o JWT junto ao Supabase. Nunca confia no payload enviado pelo cliente. */
export async function authenticate(accessToken: string): Promise<{ user: AuthenticatedUser; db: Db }> {
  const db = createUserClient(accessToken);
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data?.user) throw unauthorized();
  return { user: { id: data.user.id, email: data.user.email ?? '' }, db };
}

/** Converte erros do PostgREST em ApiError com mensagem util. */
export function mapDbError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const code = error.code ?? '';
  if (code === 'PGRST116') return new ApiError('not_found', 'Registro não encontrado.');
  if (code === '23505') return new ApiError('conflict', 'Já existe um registro com esses dados.');
  if (code === '23503') return new ApiError('bad_request', 'Referência inválida: o registro relacionado não existe.');
  if (code === '23514') return new ApiError('validation_failed', 'Dados fora dos limites aceitos.');
  if (code === '42501' || code === 'PGRST301') {
    return new ApiError('forbidden', 'Acesso negado a este recurso.');
  }
  return new ApiError('internal_error', 'Falha ao acessar os dados.', { db: error.message });
}

export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw mapDbError(result.error as { code?: string; message: string });
  }
  if (result.data === null) throw new ApiError('not_found', 'Registro não encontrado.');
  return result.data;
}
