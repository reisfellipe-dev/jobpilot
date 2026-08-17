/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase. Público por design. */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave anônima do Supabase. Pública por design: a proteção real é a RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
