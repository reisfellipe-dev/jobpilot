-- =============================================================================
-- JobPilot — Fase 2: Discovery Engine + Smart Application Assistant
-- =============================================================================
-- Migration aditiva e idempotente: não altera nem remove nada da 0001.
-- Toda tabela nova segue as mesmas regras: user_id obrigatório, RLS habilitada,
-- policy `auth.uid() = user_id`, sem service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- companies — agrupa vagas da mesma empresa (§14)
-- Só guarda o que vem da fonte. Nada de dado corporativo inventado.
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  -- Chave de deduplicação: nome normalizado (minúsculo, sem acento nem sufixo).
  normalized_name text not null check (char_length(normalized_name) between 1 and 200),
  website text not null default '' check (char_length(website) <= 500),
  careers_url text not null default '' check (char_length(careers_url) <= 500),
  logo_url text not null default '' check (char_length(logo_url) <= 500),
  location text not null default '' check (char_length(location) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists companies_user_name_idx on public.companies (user_id, normalized_name);
alter table public.companies enable row level security;

drop policy if exists "companies_all_own" on public.companies;
create policy "companies_all_own" on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- job_sources — conectores configurados pelo usuário (§1, §2)
-- `kind` identifica o conector; `identifier` é o board/slug da empresa
-- (nulo em agregadores, que não precisam de configuração por empresa).
-- -----------------------------------------------------------------------------
create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('greenhouse', 'lever', 'ashby', 'remotive', 'remoteok', 'arbeitnow')),
  identifier text not null default '' check (char_length(identifier) <= 200),
  label text not null default '' check (char_length(label) <= 200),
  source_url text not null default '' check (char_length(source_url) <= 500),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  -- Saúde da fonte (§26). Atualizado a cada sincronização.
  last_sync_at timestamptz,
  last_status text not null default 'nunca'
    check (last_status in ('nunca', 'ok', 'parcial', 'erro', 'desabilitada')),
  last_error text not null default '' check (char_length(last_error) <= 1000),
  last_duration_ms integer not null default 0,
  consecutive_failures integer not null default 0,
  total_jobs_found integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_sources_unique_idx
  on public.job_sources (user_id, kind, lower(identifier));
create index if not exists job_sources_enabled_idx on public.job_sources (user_id, enabled);
alter table public.job_sources enable row level security;

drop policy if exists "job_sources_all_own" on public.job_sources;
create policy "job_sources_all_own" on public.job_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists job_sources_set_updated_at on public.job_sources;
create trigger job_sources_set_updated_at before update on public.job_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- source_syncs — histórico de sincronizações (§7, §26, §34)
-- -----------------------------------------------------------------------------
create table if not exists public.source_syncs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.job_sources(id) on delete set null,
  source_kind text not null check (char_length(source_kind) <= 40),
  source_label text not null default '' check (char_length(source_label) <= 200),
  status text not null default 'executando' check (status in ('executando', 'ok', 'erro', 'ignorada')),
  jobs_found integer not null default 0,
  jobs_new integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_duplicated integer not null default 0,
  jobs_filtered integer not null default 0,
  error text not null default '' check (char_length(error) <= 1000),
  duration_ms integer not null default 0,
  trigger_kind text not null default 'manual' check (trigger_kind in ('manual', 'cron')),
  created_at timestamptz not null default now()
);

create index if not exists source_syncs_user_idx on public.source_syncs (user_id, created_at desc);
alter table public.source_syncs enable row level security;

drop policy if exists "source_syncs_all_own" on public.source_syncs;
create policy "source_syncs_all_own" on public.source_syncs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- jobs — expandida com os campos de descoberta (§3, §4)
-- A entidade Job continua única: `origin` distingue o que veio de descoberta.
-- -----------------------------------------------------------------------------
alter table public.jobs add column if not exists origin text not null default 'manual';
alter table public.jobs add column if not exists source text not null default '';
alter table public.jobs add column if not exists source_job_id text not null default '';
alter table public.jobs add column if not exists source_url text not null default '';
alter table public.jobs add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.jobs add column if not exists company_url text not null default '';
alter table public.jobs add column if not exists is_remote boolean;
alter table public.jobs add column if not exists is_hybrid boolean;
alter table public.jobs add column if not exists employment_type text;
alter table public.jobs add column if not exists salary text not null default '';
alter table public.jobs add column if not exists salary_min numeric(12, 2);
alter table public.jobs add column if not exists salary_max numeric(12, 2);
alter table public.jobs add column if not exists salary_currency text;
alter table public.jobs add column if not exists discovered_at timestamptz;
alter table public.jobs add column if not exists published_at timestamptz;
alter table public.jobs add column if not exists application_url text not null default '';
alter table public.jobs add column if not exists application_method text not null default 'unknown';
alter table public.jobs add column if not exists raw_source_data jsonb;
-- Rastreabilidade por campo: {"salary":"source","seniority":"inferred"} (§4, §20)
alter table public.jobs add column if not exists field_origins jsonb not null default '{}'::jsonb;
alter table public.jobs add column if not exists fingerprint text not null default '';
alter table public.jobs add column if not exists saved_at timestamptz;
alter table public.jobs add column if not exists best_match_score smallint;
alter table public.jobs add column if not exists relevance_score smallint;
alter table public.jobs add column if not exists recommended_resume_id uuid references public.resumes(id) on delete set null;
alter table public.jobs add column if not exists matched_at timestamptz;
alter table public.jobs add column if not exists source_count smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_origin_check') then
    alter table public.jobs add constraint jobs_origin_check check (origin in ('manual', 'discovery'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_application_method_check') then
    alter table public.jobs add constraint jobs_application_method_check
      check (application_method in ('unknown', 'ats_form', 'external_site', 'email'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_employment_type_check') then
    alter table public.jobs add constraint jobs_employment_type_check
      check (employment_type is null or employment_type in
        ('clt', 'pj', 'estagio', 'temporario', 'freelance', 'integral', 'meio_periodo', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_scores_check') then
    alter table public.jobs add constraint jobs_scores_check check (
      (best_match_score is null or best_match_score between 0 and 100) and
      (relevance_score is null or relevance_score between 0 and 100)
    );
  end if;
end
$$;

-- Uma vaga por (usuário, impressão digital): a base da deduplicação (§13).
create unique index if not exists jobs_user_fingerprint_idx
  on public.jobs (user_id, fingerprint) where fingerprint <> '';
create index if not exists jobs_discovery_idx
  on public.jobs (user_id, origin, relevance_score desc nulls last, published_at desc nulls last);
create index if not exists jobs_company_idx on public.jobs (company_id);
create index if not exists jobs_source_idx on public.jobs (user_id, source);

-- -----------------------------------------------------------------------------
-- job_source_links — a mesma vaga encontrada em várias fontes (§13)
-- -----------------------------------------------------------------------------
create table if not exists public.job_source_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  source text not null check (char_length(source) <= 40),
  source_job_id text not null default '' check (char_length(source_job_id) <= 200),
  source_url text not null default '' check (char_length(source_url) <= 500),
  application_url text not null default '' check (char_length(application_url) <= 500),
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists job_source_links_unique_idx
  on public.job_source_links (job_id, source, source_job_id);
create index if not exists job_source_links_job_idx on public.job_source_links (job_id);
alter table public.job_source_links enable row level security;

drop policy if exists "job_source_links_all_own" on public.job_source_links;
create policy "job_source_links_all_own" on public.job_source_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- job_matches — score determinístico por (vaga, currículo), cacheado (§9, §28)
-- -----------------------------------------------------------------------------
create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  breakdown jsonb not null default '[]'::jsonb,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  is_recommended boolean not null default false,
  fingerprint text not null default '' check (char_length(fingerprint) <= 128),
  created_at timestamptz not null default now()
);

create unique index if not exists job_matches_unique_idx on public.job_matches (job_id, resume_id);
create index if not exists job_matches_user_idx on public.job_matches (user_id, score desc);
alter table public.job_matches enable row level security;

drop policy if exists "job_matches_all_own" on public.job_matches;
create policy "job_matches_all_own" on public.job_matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- notifications — avisos internos (§23). Sem envio externo na V1.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('discovery', 'match', 'source_error', 'sistema')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;

drop policy if exists "notifications_all_own" on public.notifications;
create policy "notifications_all_own" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- application_field_maps — respostas reutilizáveis por rótulo de campo (§18)
-- Evita reescrever a mesma resposta a cada candidatura.
-- -----------------------------------------------------------------------------
create table if not exists public.application_field_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Rótulo normalizado da pergunta, ex.: "years of experience".
  question_key text not null check (char_length(question_key) between 1 and 300),
  question_label text not null default '' check (char_length(question_label) <= 300),
  answer text not null default '' check (char_length(answer) <= 5000),
  -- KNOWN | UNKNOWN | INFERRED | USER_REQUIRED (§20)
  state text not null default 'KNOWN' check (state in ('KNOWN', 'UNKNOWN', 'INFERRED', 'USER_REQUIRED')),
  profile_path text not null default '' check (char_length(profile_path) <= 120),
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists application_field_maps_unique_idx
  on public.application_field_maps (user_id, question_key);
alter table public.application_field_maps enable row level security;

drop policy if exists "application_field_maps_all_own" on public.application_field_maps;
create policy "application_field_maps_all_own" on public.application_field_maps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists application_field_maps_set_updated_at on public.application_field_maps;
create trigger application_field_maps_set_updated_at before update on public.application_field_maps
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- settings — preferências de descoberta (§6, §11, §22)
-- -----------------------------------------------------------------------------
alter table public.settings add column if not exists auto_discovery boolean not null default false;
alter table public.settings add column if not exists discovery_min_score smallint not null default 55;
alter table public.settings add column if not exists discovery_max_age_days smallint not null default 30;
alter table public.settings add column if not exists discovery_keywords text[] not null default '{}';
alter table public.settings add column if not exists discovery_locations text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_discovery_bounds_check') then
    alter table public.settings add constraint settings_discovery_bounds_check check (
      discovery_min_score between 0 and 100 and discovery_max_age_days between 1 and 365
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Quotas de descoberta: reaproveita a infraestrutura de rate limit da 0001 (§27)
-- Nada a criar — `consume_ai_quota` é genérica por nome de operação.
-- -----------------------------------------------------------------------------
