-- =============================================================================
-- JobPilot - schema inicial
-- =============================================================================
-- Principios:
--   1. TODA tabela de dados do usuario tem `user_id` e RLS habilitada.
--   2. Nenhuma policy usa `true`: o acesso e sempre `auth.uid() = user_id`.
--   3. O backend usa a ANON KEY + JWT do usuario, entao a RLS tambem vale
--      no servidor. Nao existe service_role neste projeto.
--   4. Funcoes SECURITY DEFINER sempre fixam `search_path`.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles - fonte de verdade do perfil profissional (§13)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 140),
  email text not null default '' check (char_length(email) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  location text not null default '' check (char_length(location) <= 140),
  headline text not null default '' check (char_length(headline) <= 180),
  summary text not null default '' check (char_length(summary) <= 4000),
  education jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  desired_roles text[] not null default '{}',
  seniority text check (seniority in ('estagio','trainee','junior','pleno','senior','especialista','lead','gerente')),
  work_modes text[] not null default '{}',
  desired_location text not null default '' check (char_length(desired_location) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- experiences (§14)
-- -----------------------------------------------------------------------------
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 1 and 160),
  role text not null check (char_length(role) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  start_date text,
  end_date text,
  is_current boolean not null default false,
  technologies text[] not null default '{}',
  achievements text[] not null default '{}',
  responsibilities text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experiences_user_idx on public.experiences (user_id, sort_order, start_date desc);
alter table public.experiences enable row level security;

drop policy if exists "experiences_all_own" on public.experiences;
create policy "experiences_all_own" on public.experiences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists experiences_set_updated_at on public.experiences;
create trigger experiences_set_updated_at before update on public.experiences
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- projects (§15)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  technologies text[] not null default '{}',
  url text not null default '',
  github_url text not null default '',
  outcomes text[] not null default '{}',
  start_date text,
  end_date text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, sort_order);
alter table public.projects enable row level security;

drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- skills
-- -----------------------------------------------------------------------------
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'outro'
    check (category in ('linguagem','framework','banco','cloud','ferramenta','metodologia','soft','outro')),
  level smallint not null default 3 check (level between 1 and 5),
  years_experience numeric(4,1) check (years_experience is null or (years_experience >= 0 and years_experience <= 60)),
  created_at timestamptz not null default now()
);

create unique index if not exists skills_user_name_idx on public.skills (user_id, lower(name));
alter table public.skills enable row level security;

drop policy if exists "skills_all_own" on public.skills;
create policy "skills_all_own" on public.skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- resumes (§16)
-- -----------------------------------------------------------------------------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  objective text not null default '' check (char_length(objective) <= 300),
  seniority text check (seniority in ('estagio','trainee','junior','pleno','senior','especialista','lead','gerente')),
  description text not null default '' check (char_length(description) <= 1000),
  skills text[] not null default '{}',
  target_roles text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  is_default boolean not null default false,
  file_path text not null default '' check (char_length(file_path) <= 400),
  file_name text not null default '' check (char_length(file_name) <= 240),
  file_mime text not null default '' check (char_length(file_mime) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_user_idx on public.resumes (user_id, priority desc, updated_at desc);
-- Garante no maximo um curriculo padrao por usuario.
create unique index if not exists resumes_single_default_idx on public.resumes (user_id) where is_default;
alter table public.resumes enable row level security;

drop policy if exists "resumes_all_own" on public.resumes;
create policy "resumes_all_own" on public.resumes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at before update on public.resumes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- jobs (§20)
-- -----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null default '' check (char_length(company) <= 160),
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 40000),
  url text not null default '',
  location text not null default '' check (char_length(location) <= 160),
  work_mode text check (work_mode in ('remoto','hibrido','presencial')),
  seniority text check (seniority in ('estagio','trainee','junior','pleno','senior','especialista','lead','gerente')),
  requirements text[] not null default '{}',
  nice_to_have text[] not null default '{}',
  technologies text[] not null default '{}',
  benefits text[] not null default '{}',
  salary_range text not null default '' check (char_length(salary_range) <= 120),
  posted_at date,
  status text not null default 'nova' check (status in ('nova','analisada','aplicada','descartada')),
  source text not null default 'manual' check (source in ('manual','texto','url')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_idx on public.jobs (user_id, created_at desc);
create index if not exists jobs_user_status_idx on public.jobs (user_id, status);
alter table public.jobs enable row level security;

drop policy if exists "jobs_all_own" on public.jobs;
create policy "jobs_all_own" on public.jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- job_analyses (§21/§22/§30) - cache por fingerprint de contexto
-- -----------------------------------------------------------------------------
create table if not exists public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) <= 128),
  analysis jsonb not null default '{}'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  recommended_resume_id uuid references public.resumes(id) on delete set null,
  recommendation_reason text not null default '' check (char_length(recommendation_reason) <= 2000),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 120),
  created_at timestamptz not null default now()
);

create unique index if not exists job_analyses_fingerprint_idx on public.job_analyses (job_id, fingerprint);
create index if not exists job_analyses_user_idx on public.job_analyses (user_id, created_at desc);
alter table public.job_analyses enable row level security;

drop policy if exists "job_analyses_all_own" on public.job_analyses;
create policy "job_analyses_all_own" on public.job_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- resume_versions (§19/§24) - curriculos adaptados para vagas
-- -----------------------------------------------------------------------------
create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  label text not null default '' check (char_length(label) <= 160),
  content jsonb not null default '{}'::jsonb,
  changes jsonb not null default '[]'::jsonb,
  keywords_added text[] not null default '{}',
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists resume_versions_user_idx on public.resume_versions (user_id, created_at desc);
create index if not exists resume_versions_resume_idx on public.resume_versions (resume_id, created_at desc);
alter table public.resume_versions enable row level security;

drop policy if exists "resume_versions_all_own" on public.resume_versions;
create policy "resume_versions_all_own" on public.resume_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- applications (§25)
-- -----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  score smallint check (score is null or (score between 0 and 100)),
  status text not null default 'salva'
    check (status in ('salva','analisada','preparada','enviada','entrevista','oferta','recusada')),
  applied_at date,
  notes text not null default '' check (char_length(notes) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists applications_user_job_idx on public.applications (user_id, job_id);
create index if not exists applications_user_status_idx on public.applications (user_id, status, updated_at desc);
alter table public.applications enable row level security;

drop policy if exists "applications_all_own" on public.applications;
create policy "applications_all_own" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- application_answers (§26)
-- -----------------------------------------------------------------------------
create table if not exists public.application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null
    check (kind in ('cover_letter','recruiter_message','about_me','why_company','why_position','salary','custom')),
  question text not null default '' check (char_length(question) <= 2000),
  answer text not null default '' check (char_length(answer) <= 20000),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists application_answers_app_idx on public.application_answers (application_id, created_at desc);
alter table public.application_answers enable row level security;

drop policy if exists "application_answers_all_own" on public.application_answers;
create policy "application_answers_all_own" on public.application_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- settings
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_provider_preference text not null default 'auto' check (ai_provider_preference in ('auto','groq','nvidia')),
  allow_fallback boolean not null default true,
  tone text not null default 'profissional' check (tone in ('profissional','direto','entusiasmado','tecnico')),
  language text not null default 'pt-BR' check (language in ('pt-BR','en-US')),
  ai_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings_all_own" on public.settings;
create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- ai_usage - trilha de uso e base do rate limit (§44)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (char_length(operation) <= 60),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 120),
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  succeeded boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_window_idx on public.ai_usage (user_id, operation, created_at desc);
create index if not exists ai_usage_daily_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;

-- O usuario pode LER o proprio consumo, mas nao pode inserir/alterar registros
-- manualmente: quem escreve e a funcao SECURITY DEFINER abaixo.
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Rate limit atomico por usuario/operacao + teto diario global (§44)
-- -----------------------------------------------------------------------------
create or replace function public.consume_ai_quota(
  p_operation text,
  p_limit integer,
  p_window_seconds integer,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_window_count integer;
  v_daily_count integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  -- Serializa concorrencia por usuario+operacao dentro da transacao.
  perform pg_advisory_xact_lock(hashtext(v_user::text || ':' || p_operation));

  select count(*) into v_window_count
  from public.ai_usage
  where user_id = v_user
    and operation = p_operation
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_window_count >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'operation_limit',
      'limit', p_limit,
      'used', v_window_count,
      'window_seconds', p_window_seconds
    );
  end if;

  select count(*) into v_daily_count
  from public.ai_usage
  where user_id = v_user
    and created_at > now() - interval '24 hours';

  if p_daily_limit is not null and v_daily_count >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'limit', p_daily_limit,
      'used', v_daily_count,
      'window_seconds', 86400
    );
  end if;

  insert into public.ai_usage (user_id, operation, succeeded)
  values (v_user, p_operation, false)
  returning id into v_id;

  return jsonb_build_object(
    'allowed', true,
    'usage_id', v_id,
    'limit', p_limit,
    'used', v_window_count + 1,
    'daily_used', v_daily_count + 1,
    'daily_limit', p_daily_limit
  );
end;
$$;

revoke all on function public.consume_ai_quota(text, integer, integer, integer) from public;
grant execute on function public.consume_ai_quota(text, integer, integer, integer) to authenticated;

-- Fecha o registro de uso com o resultado real da chamada.
create or replace function public.finalize_ai_usage(
  p_usage_id uuid,
  p_provider text,
  p_model text,
  p_tokens_in integer,
  p_tokens_out integer,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.ai_usage
  set provider = left(coalesce(p_provider, ''), 40),
      model = left(coalesce(p_model, ''), 120),
      tokens_in = greatest(coalesce(p_tokens_in, 0), 0),
      tokens_out = greatest(coalesce(p_tokens_out, 0), 0),
      succeeded = coalesce(p_succeeded, false)
  where id = p_usage_id
    and user_id = v_user;  -- ownership obrigatorio
end;
$$;

revoke all on function public.finalize_ai_usage(uuid, text, text, integer, integer, boolean) from public;
grant execute on function public.finalize_ai_usage(uuid, text, text, integer, integer, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Bootstrap de novos usuarios: cria profile e settings automaticamente.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Storage: bucket privado de curriculos (§37)
-- Convencao de caminho: <user_id>/<resume_id>/<arquivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  8388608,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "resumes_storage_select_own" on storage.objects;
create policy "resumes_storage_select_own" on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_storage_insert_own" on storage.objects;
create policy "resumes_storage_insert_own" on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_storage_update_own" on storage.objects;
create policy "resumes_storage_update_own" on storage.objects for update
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_storage_delete_own" on storage.objects;
create policy "resumes_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
