import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import type { JobStatus, Seniority, WorkMode } from '@shared/constants';
import { JOB_STATUS_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL } from '@shared/constants';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { TextInput } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/Modal';
import { AddJobModal } from '@/components/jobs/AddJobModal';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { useDeleteJob, useJobs } from '@/hooks/queries';

type Filter = 'todas' | JobStatus;

const STATUS_TONE: Record<JobStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  nova: 'neutral',
  analisada: 'accent',
  aplicada: 'success',
  descartada: 'danger',
};

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: jobs, isPending, error, refetch } = useJobs();
  const remove = useDeleteJob();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('todas');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (searchParams.get('nova') === '1') {
      setAddOpen(true);
      searchParams.delete('nova');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (jobs ?? []).filter((job) => {
      if (filter !== 'todas' && job.status !== filter) return false;
      if (!term) return true;
      return (
        job.title.toLowerCase().includes(term) ||
        job.company.toLowerCase().includes(term) ||
        job.technologies.some((tech) => tech.toLowerCase().includes(term))
      );
    });
  }, [jobs, filter, search]);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { todas: 0, nova: 0, analisada: 0, aplicada: 0, descartada: 0 };
    for (const job of jobs ?? []) {
      base.todas += 1;
      base[job.status] += 1;
    }
    return base;
  }, [jobs]);

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: 'Excluir vaga?',
      description: `"${title}", suas análises e a candidatura vinculada serão removidas.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    remove.mutate(id, { onSuccess: () => toast.success('Vaga excluída') });
  };

  return (
    <>
      {dialog}
      <PageHeader
        title="Vagas"
        description="Cole uma vaga, analise e descubra qual currículo usar."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
            Nova vaga
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title="Nenhuma vaga cadastrada"
          description="Cole a descrição de uma vaga para receber o score de aderência de cada currículo."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
              Adicionar primeira vaga
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cargo, empresa ou tecnologia"
                aria-label="Buscar vagas"
                className="pl-9"
              />
            </div>

            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'todas', label: 'Todas', count: counts.todas },
                { value: 'nova', label: 'Novas', count: counts.nova },
                { value: 'analisada', label: 'Analisadas', count: counts.analisada },
                { value: 'aplicada', label: 'Aplicadas', count: counts.aplicada },
                { value: 'descartada', label: 'Descartadas', count: counts.descartada },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma vaga encontrada" description="Ajuste a busca ou o filtro de status." />
          ) : (
            <div className="space-y-3">
              {filtered.map((job) => (
                <Card key={job.id} className="flex items-start gap-3 p-4">
                  <Link to={`/vagas/${job.id}`} className="min-w-0 flex-1 group">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-ink group-hover:text-accent-ink">
                        {job.title}
                      </h2>
                      <Badge tone={STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {job.company || 'Empresa não informada'}
                      {job.location ? ` · ${job.location}` : ''}
                      {job.workMode ? ` · ${WORK_MODE_LABEL[job.workMode as WorkMode]}` : ''}
                      {job.seniority ? ` · ${SENIORITY_LABEL[job.seniority as Seniority]}` : ''}
                    </p>
                    {job.technologies.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {job.technologies.slice(0, 8).map((tech) => (
                          <Badge key={tech}>{tech}</Badge>
                        ))}
                        {job.technologies.length > 8 && <Badge>+{job.technologies.length - 8}</Badge>}
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-ink-faint">Adicionada {formatRelative(job.createdAt)}</p>
                  </Link>

                  <div className="flex shrink-0 flex-col gap-1">
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-2 text-ink-faint transition hover:bg-elevated hover:text-ink"
                        aria-label={`Abrir anúncio de ${job.title}`}
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(job.id, job.title)}
                      className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                      aria-label={`Excluir ${job.title}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <AddJobModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
