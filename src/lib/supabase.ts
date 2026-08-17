import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * A anon key é pública por design: ela apenas identifica o projeto.
 * O isolamento entre usuários vem da Row Level Security no Postgres.
 * Nenhuma credencial de IA existe neste bundle (§4).
 */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'jobpilot.auth',
    flowType: 'pkce',
  },
});

/** Token de acesso atual; null quando não há sessão válida. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
