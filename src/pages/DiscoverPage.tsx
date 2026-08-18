/**
 * Tela Descobrir (§12, §31, §32).
 *
 * Fluxo desenhado para o celular: um botão grande, feedback durante a busca,
 * contagem do resultado, filtros horizontais e cards compactos.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Compass,
  Info,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { DiscoveredJob, DiscoveryFilters } from '@shared/discovery/schemas';
import { SOURCE_KINDS, SOURCE_LABEL } from '@shared/discovery/types';
import { SENIORITY_LEVELS, SENIORITY_LABEL } from '@shared/constants';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { JobCard } from '@/components/discovery/JobCard';
import { PrepareApplicationModal } from '@/components/discovery/PrepareApplicationModal';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import {
  useDiscoveryJobs,
  useDiscoveryStrategy,
  useDiscoverySummary,
  useJobDecision,
  useRunDiscovery,
} from '@/hooks/discovery';
import type { DiscoveryRunResult } from '@shared/discovery/schemas';

type QuickFilter = 'todas' | 'alto_match' | 'remoto' | 'recentes' | 'com_salario';

const QUICK_FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'alto_match', label: 'Match > 85%' },
  { value: 'remoto', label: 'Remoto' },
  { value: 'recentes', label: 'Últimos 7 dias' },
  { value: 'com_salario', label: 'Com salário' },
];

function quickToFilters(quick: QuickFilter): Partial<DiscoveryFilters> {
  switch (quick) {
    case 'alto_match':
      return { minScore: 85 };
    case 'remoto':
      return { workMode: 'remoto' };
    case 'recentes':
      return { maxAgeDays: 7 };
    case 'com_salario':
      return { hasSalary: true };
    default:
      return {};
  }
}

export function DiscoverPage() {
  const toast = useToast();
  const [quick, setQuick] = useState<QuickFilter>('todas');
  const [search, setSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState<Partial<DiscoveryFilters>>({});
  const [sort, setSort] = useState<DiscoveryFilters['sort']>('relevancia');
  const [prepareJob, setPrepareJob] = useState<DiscoveredJob | null>(null);
  const [lastRun, setLastRun] = useState<DiscoveryRunResult | null>(null);
  const [strategyOpen, setStrategyOpen] = useState(false);

  const filters = useMemo<Partial<DiscoveryFilters>>(
    () => ({
      ...quickToFilters(quick),
      ...advanced,
      ...(search.trim() ? { search: search.trim() } : {}),
      sort,
      limit: 40,
    }),
    [quick, advanced, search, sort],
  );

  const { data, isPending, error, refetch } = useDiscoveryJobs(filters);
  const { data: summary } = useDiscoverySummary();
  const { data: strategy } = useDiscoveryStrategy(strategyOpen);
  const runDiscovery = useRunDiscovery();
  const decide = useJobDecision();

  // Limpa o resumo da última execução ao trocar de filtro.
  useEffect(() => {
    setLastRun(null);
  }, [quick, search]);

  const handleRun = (full = false) => {
    runDiscovery.mutate(
      { full },
      {
        onSuccess: (result) => {
          setLastRun(result);
          if (result.totalNew === 0 && result.totalFound === 0) {
            toast.info('Nenhuma vaga nova', 'As fontes não retornaram novidades desde a última busca.');
          } else {
            toast.success(
              `${result.totalNew} nova(s) vaga(s)`,
              result.highMatches > 0 ? `${result.highMatches} com match acima de 85%.` : undefined,
            );
          }
          void refetch();
        },
        onError: (caught) =>
          toast.error('Falha na busca', caught instanceof Error ? caught.message : undefined),
      },
    );
  };

  const handleDecision = (job: DiscoveredJob, action: 'salvar' | 'descartar') => {
    decide.mutate(
      { id: job.id, action },
      {
        onSuccess: () => {
          toast.success(action === 'salvar' ? 'Vaga salva em Vagas' : 'Vaga descartada');
          void refetch();
        },
      },
    );
  };

  const jobs = data?.jobs ?? [];
  const hasSources = (summary?.activeSources ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Descobrir"
        description="Vagas encontradas nas fontes públicas conectadas ao seu perfil."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={runDiscovery.isPending ? undefined : <Radar />}
              onClick={() => handleRun(false)}
              loading={runDiscovery.isPending}
            >
              {runDiscovery.isPending ? 'Buscando vagas…' : 'Buscar novas vagas'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleRun(true)}
              loading={runDiscovery.isPending}
              title="Ignora o corte incremental e revarre cada fonte inteira, do zero."
            >
              Revarrer tudo
            </Button>
          </div>
        }
      />

      {/* Resumo do estado atual */}
      {summary && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge tone={summary.available > 0 ? 'accent' : 'neutral'}>
            {summary.available} disponíve{summary.available === 1 ? 'l' : 'is'}
          </Badge>
          {summary.highMatches > 0 && <Badge tone="success">{summary.highMatches} com match alto</Badge>}
          <span>
            {summary.activeSources} fonte(s) ativa(s)
            {summary.lastSyncAt ? ` · última busca ${formatRelative(summary.lastSyncAt)}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setStrategyOpen(!strategyOpen)}
            className="inline-flex items-center gap-1 text-accent-ink hover:underline"
          >
            <Info className="size-3" aria-hidden />
            Como estamos buscando
          </button>
        </div>
      )}

      {/* Estratégia de busca explicada (§10, §25) */}
      {strategyOpen && strategy && (
        <div className="mb-4 rounded-lg border border-line bg-elevated p-3 text-xs">
          <p className="mb-2 font-medium text-ink">Estratégia derivada do seu perfil</p>
          <ul className="space-y-1 text-ink-muted">
            {strategy.explanation.map((line, index) => (
              <li key={index}>• {line}</li>
            ))}
          </ul>
          {strategy.terms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {strategy.terms.map((term) => (
                <Badge key={term}>{term}</Badge>
              ))}
            </div>
          )}
          <p className="mt-2 text-ink-faint">
            Ajuste em <Link to="/configuracoes" className="text-accent-ink hover:underline">Configurações → Descoberta</Link>.
          </p>
        </div>
      )}

      {/* Resultado da última execução (§35: falha parcial é informada) */}
      {lastRun && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-accent-ink">
              <p className="font-medium">
                {lastRun.totalNew} nova(s) · {lastRun.totalUpdated} atualizada(s) · {lastRun.totalFound} analisada(s)
                em {(lastRun.durationMs / 1000).toFixed(1)}s
              </p>
              <ul className="mt-1.5 space-y-0.5 text-accent-ink/80">
                {lastRun.results.map((item) => (
                  <li key={`${item.kind}-${item.sourceId}`}>
                    {item.label}:{' '}
                    {item.status === 'ok'
                      ? `${item.jobsNew} nova(s) de ${item.jobsFound}` +
                        (item.jobsFiltered > 0 ? ` (${item.jobsFiltered} descartada(s) pelo perfil)` : '') +
                        (item.jobsDuplicated > 0 ? ` · ${item.jobsDuplicated} duplicada(s)` : '')
                      : item.error}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setLastRun(null)}
              className="rounded p-1 text-accent-ink/70 hover:bg-accent/20"
              aria-label="Fechar resumo"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          {lastRun.failedSources.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
              Algumas fontes não puderam ser atualizadas: {lastRun.failedSources.join(', ')}.
            </p>
          )}
        </div>
      )}

      {/* Filtros rápidos — rolagem horizontal no celular (§31) */}
      <div className="mb-3 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cargo ou empresa"
            aria-label="Buscar vagas descobertas"
            className="pl-9"
          />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {QUICK_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setQuick(item.value)}
              aria-pressed={quick === item.value}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors',
                quick === item.value
                  ? 'border-accent/40 bg-accent-soft text-accent-ink'
                  : 'border-line bg-elevated text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
              advancedOpen || Object.keys(advanced).length > 0
                ? 'border-accent/40 bg-accent-soft text-accent-ink'
                : 'border-line bg-elevated text-ink-muted hover:text-ink',
            )}
          >
            <SlidersHorizontal className="size-3" aria-hidden />
            Filtros
          </button>
        </div>

        {advancedOpen && (
          <div className="grid gap-3 rounded-lg border border-line bg-elevated p-3 sm:grid-cols-4">
            <SelectInput
              label="Ordenar por"
              value={sort}
              onChange={(event) => setSort(event.target.value as DiscoveryFilters['sort'])}
              options={[
                { value: 'relevancia', label: 'Relevância' },
                { value: 'match', label: 'Maior match' },
                { value: 'recente', label: 'Mais recente' },
                { value: 'empresa', label: 'Empresa' },
              ]}
            />
            <SelectInput
              label="Senioridade"
              value={advanced.seniority ?? ''}
              onChange={(event) =>
                setAdvanced({ ...advanced, seniority: (event.target.value || undefined) as DiscoveryFilters['seniority'] })
              }
              options={SENIORITY_LEVELS.map((level) => ({ value: level, label: SENIORITY_LABEL[level] }))}
              placeholder="Qualquer"
            />
            <SelectInput
              label="Fonte"
              value={advanced.source ?? ''}
              onChange={(event) =>
                setAdvanced({ ...advanced, source: (event.target.value || undefined) as DiscoveryFilters['source'] })
              }
              options={SOURCE_KINDS.map((kind) => ({ value: kind, label: SOURCE_LABEL[kind] }))}
              placeholder="Todas"
            />
            <TextInput
              label="Tecnologia"
              value={advanced.technology ?? ''}
              onChange={(event) => setAdvanced({ ...advanced, technology: event.target.value || undefined })}
              placeholder="react"
            />
            {Object.keys(advanced).length > 0 && (
              <div className="sm:col-span-4">
                <Button size="sm" onClick={() => setAdvanced({})}>
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resultados */}
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : !hasSources ? (
        <EmptyState
          icon={<Compass />}
          title="Nenhuma fonte conectada"
          description="Conecte quadros públicos de vagas ou adicione empresas que usam Greenhouse, Lever ou Ashby."
          action={
            <Link to="/configuracoes">
              <Button variant="primary" size="sm">
                Configurar fontes
              </Button>
            </Link>
          }
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title={summary && summary.available > 0 ? 'Nada com esses filtros' : 'Nenhuma vaga descoberta ainda'}
          description={
            summary && summary.available > 0
              ? 'Ajuste os filtros para ver mais oportunidades.'
              : 'Toque em "Buscar novas vagas" para consultar as fontes conectadas.'
          }
          action={
            summary && summary.available > 0 ? (
              <Button size="sm" onClick={() => { setQuick('todas'); setAdvanced({}); setSearch(''); }}>
                Limpar filtros
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={<Radar />} onClick={() => handleRun(false)} loading={runDiscovery.isPending}>
                Buscar agora
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            {data?.total ?? jobs.length} oportunidade(s) encontrada(s)
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                busy={decide.isPending}
                onPrepare={() => setPrepareJob(job)}
                onSave={() => handleDecision(job, 'salvar')}
                onDiscard={() => handleDecision(job, 'descartar')}
              />
            ))}
          </div>

          {/* Atribuição exigida pelos termos de uso das fontes */}
          {data && data.attribution.length > 0 && (
            <p className="mt-6 text-center text-[11px] text-ink-faint">
              Vagas fornecidas por{' '}
              {data.attribution.map((item, index) => (
                <span key={item.url}>
                  {index > 0 && ', '}
                  <a href={item.url} target="_blank" rel="noopener" className="text-ink-muted hover:underline">
                    {item.label}
                  </a>
                </span>
              ))}
              .
            </p>
          )}
        </>
      )}

      {runDiscovery.isPending && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6" role="status">
          <div className="panel-elevated flex items-center gap-2.5 px-4 py-2.5">
            <RefreshCw className="size-4 animate-spin text-accent" aria-hidden />
            <span className="text-xs text-ink">Consultando as fontes…</span>
          </div>
        </div>
      )}

      <PrepareApplicationModal job={prepareJob} open={prepareJob !== null} onClose={() => setPrepareJob(null)} />
    </>
  );
}
