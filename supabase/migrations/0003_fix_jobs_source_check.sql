-- -----------------------------------------------------------------------------
-- Corrige jobs.source: a trava original (0001_init.sql) só aceitava
-- ('manual','texto','url') — os valores de quando só existia cadastro manual
-- de vaga. A Descoberta (0002_discovery.sql) passou a gravar o nome do
-- conector em `source` ('remotive','arbeitnow','remoteok','greenhouse',
-- 'lever','ashby'), mas a trava nunca foi atualizada. Resultado: TODA vaga
-- vinda de descoberta era rejeitada pelo Postgres na hora do insert — sempre,
-- silenciosamente (o app só registrava um aviso no log do servidor).
-- -----------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs add constraint jobs_source_check
  check (source in (
    'manual', 'texto', 'url',
    'greenhouse', 'lever', 'ashby', 'remotive', 'remoteok', 'arbeitnow'
  ));
