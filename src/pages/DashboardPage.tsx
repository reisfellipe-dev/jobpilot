import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Compass, FilePlus2, Send, Sparkles, Target } from 'lucide-react';
import { useDashboard } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader, SectionTitle, Stat } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ScoreBadge } from '@/components/ui/Score';
import { APPLICATION_STATUS_LABEL, type ApplicationStatus } from '@shared/constants';
import { formatRelative } from '@/lib/format';
import { DiscoveryBanner } from '@/components/discovery/DiscoveryBanner';

const QUICK_ACTIONS = [
  { to: '/descobrir', label: 'Descobrir', icon: Compass },
  { to: '/vagas?nova=1', label: 'Nova vaga', icon: Briefcase },
  { to: '/curriculos?novo=1', label: 'Novo currículo', icon: FilePlus2 },
  { to: '/candidaturas?nova=1', label: 'Nova candidatura', icon: Send },
];

export function DashboardPage() {
  const { data, isPending, error, refetch } = useDashboard();

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Dashboard" description="Onde está cada candidatura e o que fazer agora." />

      <DiscoveryBanner />

      {/* Atalhos - prioridade no mobile (§32) */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="panel flex flex-col items-center justify-center gap-2 px-2 py-4 text-center transition-colors hover:border-line-strong hover:bg-elevated"
          >
            <action.icon className="size-4 text-accent" aria-hidden />
            <span className="text-xs font-medium text-ink">{action.label}</span>
          </Link>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : !data ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Vagas analisadas" value={data.jobs.analyzed} hint={`${data.jobs.total} no total`} />
            <Stat label="Candidaturas" value={data.applications.total} hint={`${data.jobs.open} vaga(s) sem análise`} />
            <Stat
              label="Entrevistas"
              value={data.applications.interviews}
              tone={data.applications.interviews > 0 ? 'info' : 'neutral'}
            />
            <Stat
              label="Ofertas"
              value={data.applications.offers}
              tone={data.applications.offers > 0 ? 'success' : 'neutral'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <SectionTitle
                title="Melhores matches"
                description="Vagas com maior aderência ao seu melhor currículo."
                action={
                  <Link to="/vagas" className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline">
                    Ver vagas
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                }
              />
              <div className="mt-4">
                {data.bestMatches.length === 0 ? (
                  <EmptyState
                    icon={<Target />}
                    title="Nenhuma vaga analisada ainda"
                    description="Cole a descrição de uma vaga e receba o score de aderência de cada currículo."
                    action={
                      <Link to="/vagas?nova=1">
                        <Button variant="primary" size="sm" icon={<Sparkles />}>
                          Analisar primeira vaga
                        </Button>
                      </Link>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.bestMatches.map((match) => (
                      <li key={match.jobId}>
                        <Link
                          to={`/vagas/${match.jobId}`}
                          className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-elevated"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{match.jobTitle}</p>
                            <p className="truncate text-xs text-ink-muted">
                              {match.company || 'Empresa não informada'} · {match.resumeName}
                            </p>
                          </div>
                          <ScoreBadge score={match.score} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <div className="space-y-5 lg:col-span-2">
              <Card>
                <SectionTitle title="Pipeline" description="Suas candidaturas por etapa." />
                <ul className="mt-4 space-y-2">
                  {(Object.entries(data.applications.byStatus) as Array<[ApplicationStatus, number]>)
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => (
                      <li key={status} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-muted">{APPLICATION_STATUS_LABEL[status]}</span>
                        <span className="text-sm font-medium tabular-nums text-ink">{count}</span>
                      </li>
                    ))}
                  {data.applications.total === 0 && (
                    <li className="py-4 text-center text-xs text-ink-faint">Nenhuma candidatura registrada.</li>
                  )}
                </ul>
              </Card>

              <Card>
                <SectionTitle title="Resumo" />
                <dl className="mt-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Score médio das análises</dt>
                    <dd className="font-medium text-ink">
                      {data.averageMatchScore === null ? '—' : `${data.averageMatchScore}/100`}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Currículos cadastrados</dt>
                    <dd className="font-medium text-ink">{data.resumesCount}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-ink-muted">Currículo mais usado</dt>
                    <dd className="text-right font-medium text-ink">
                      {data.mostUsedResume ? (
                        <>
                          <span className="block truncate">{data.mostUsedResume.name}</span>
                          <Badge tone="accent" className="mt-1">
                            {data.mostUsedResume.count}x
                          </Badge>
                        </>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>

          <Card>
            <SectionTitle
              title="Candidaturas recentes"
              action={
                <Link to="/candidaturas" className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline">
                  Ver Kanban
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              }
            />
            {data.recentApplications.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-faint">Nada por aqui ainda.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {data.recentApplications.map((application) => (
                  <li key={application.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{application.jobTitle}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {application.company || 'Empresa não informada'} · {formatRelative(application.updatedAt)}
                      </p>
                    </div>
                    {application.score !== null && <ScoreBadge score={application.score} />}
                    <Badge>{APPLICATION_STATUS_LABEL[application.status as ApplicationStatus] ?? application.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
