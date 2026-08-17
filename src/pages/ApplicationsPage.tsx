import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, Plus, Send, Trash2 } from 'lucide-react';
import type { ApplicationStatus } from '@shared/constants';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, ANSWER_KIND_LABEL } from '@shared/constants';
import type { ApplicationListItem } from '@shared/schemas/application';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader, SectionTitle, type Tone } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, InlineError, ListSkeleton } from '@/components/ui/States';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { SelectInput, TextArea } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { ScoreBadge } from '@/components/ui/Score';
import { formatDate, formatRelative, todayISO } from '@/lib/format';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import {
  useAnswers,
  useApplications,
  useCreateApplication,
  useDeleteAnswer,
  useDeleteApplication,
  useJobs,
  useResumes,
  useUpdateApplication,
  useUpdateApplicationStatus,
} from '@/hooks/queries';

const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  salva: 'neutral',
  analisada: 'info',
  preparada: 'accent',
  enviada: 'warning',
  entrevista: 'info',
  oferta: 'success',
  recusada: 'danger',
};

export function ApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: applications, isPending, error, refetch } = useApplications();
  const { data: jobs } = useJobs();
  const createApplication = useCreateApplication();
  const toast = useToast();

  const [mobileStatus, setMobileStatus] = useState<ApplicationStatus>('salva');
  const [detail, setDetail] = useState<ApplicationListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [newJobId, setNewJobId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('nova') === '1') {
      setCreating(true);
      searchParams.delete('nova');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const grouped = useMemo(() => {
    const base = Object.fromEntries(
      APPLICATION_STATUSES.map((status) => [status, [] as ApplicationListItem[]]),
    ) as Record<ApplicationStatus, ApplicationListItem[]>;
    for (const application of applications ?? []) {
      const list = base[application.status];
      if (list) list.push(application);
    }
    return base;
  }, [applications]);

  const availableJobs = useMemo(() => {
    const used = new Set((applications ?? []).map((item) => item.jobId));
    return (jobs ?? []).filter((job) => !used.has(job.id));
  }, [jobs, applications]);

  const submitCreate = () => {
    setCreateError(null);
    if (!newJobId) {
      setCreateError('Escolha uma vaga.');
      return;
    }
    createApplication.mutate(
      { jobId: newJobId, resumeId: null, resumeVersionId: null, score: null, status: 'salva', appliedAt: null, notes: '' },
      {
        onSuccess: () => {
          setCreating(false);
          setNewJobId('');
          toast.success('Candidatura criada');
        },
        onError: (caught) => setCreateError(caught instanceof Error ? caught.message : 'Não foi possível criar.'),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Candidaturas"
        description="Acompanhe cada processo do início ao fim."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
            Nova
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : !applications || applications.length === 0 ? (
        <EmptyState
          icon={<Send />}
          title="Nenhuma candidatura registrada"
          description="Analise uma vaga e registre a candidatura para acompanhar o processo por aqui."
          action={
            <Link to="/vagas">
              <Button variant="primary" size="sm">
                Ver vagas
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile: uma etapa por vez (§25) */}
          <div className="lg:hidden">
            <Tabs<ApplicationStatus>
              value={mobileStatus}
              onChange={setMobileStatus}
              className="mb-4"
              items={APPLICATION_STATUSES.map((status) => ({
                value: status,
                label: APPLICATION_STATUS_LABEL[status],
                count: grouped[status].length,
              }))}
            />
            <div className="space-y-3">
              {grouped[mobileStatus].length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-faint">
                  Nenhuma candidatura em “{APPLICATION_STATUS_LABEL[mobileStatus]}”.
                </p>
              ) : (
                grouped[mobileStatus].map((application) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    onOpen={() => setDetail(application)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Desktop: Kanban com rolagem horizontal */}
          <div className="hidden lg:block">
            <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
              {APPLICATION_STATUSES.map((status) => (
                <div key={status} className="flex w-72 shrink-0 flex-col">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="text-xs font-medium text-ink">{APPLICATION_STATUS_LABEL[status]}</span>
                    <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-ink-faint">
                      {grouped[status].length}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 rounded-xl bg-surface/50 p-2">
                    {grouped[status].length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-ink-faint">Vazio</p>
                    ) : (
                      grouped[status].map((application) => (
                        <ApplicationCard
                          key={application.id}
                          application={application}
                          compact
                          onOpen={() => setDetail(application)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nova candidatura"
        description="Escolha uma vaga já cadastrada."
        size="sm"
        footer={
          <>
            <Button onClick={() => setCreating(false)} disabled={createApplication.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitCreate} loading={createApplication.isPending}>
              Criar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {availableJobs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Todas as vagas cadastradas já têm candidatura.{' '}
              <Link to="/vagas" className="text-accent-ink hover:underline">
                Cadastre uma nova vaga
              </Link>{' '}
              para continuar.
            </p>
          ) : (
            <SelectInput
              label="Vaga"
              value={newJobId}
              onChange={(event) => setNewJobId(event.target.value)}
              options={availableJobs.map((job) => ({
                value: job.id,
                label: `${job.title}${job.company ? ` — ${job.company}` : ''}`,
              }))}
              placeholder="Selecione…"
            />
          )}
          {createError && <InlineError error={new Error(createError)} />}
        </div>
      </Modal>

      {detail && <ApplicationDetail application={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function ApplicationCard({
  application,
  onOpen,
  compact,
}: {
  application: ApplicationListItem;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-xl border border-line bg-elevated p-3 text-left transition-colors hover:border-line-strong',
        compact ? 'space-y-1.5' : 'space-y-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 flex-1 truncate font-medium text-ink', compact ? 'text-xs' : 'text-sm')}>
          {application.job?.title ?? 'Vaga removida'}
        </p>
        {application.score !== null && application.score !== undefined && <ScoreBadge score={application.score} />}
      </div>
      <p className="truncate text-[11px] text-ink-muted">
        {application.job?.company || 'Empresa não informada'}
        {application.resume ? ` · ${application.resume.name}` : ''}
      </p>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={STATUS_TONE[application.status]}>{APPLICATION_STATUS_LABEL[application.status]}</Badge>
        <span className="text-[10px] text-ink-faint">{formatRelative(application.updatedAt)}</span>
      </div>
    </button>
  );
}

function ApplicationDetail({ application, onClose }: { application: ApplicationListItem; onClose: () => void }) {
  const { data: resumes } = useResumes();
  const { data: answers } = useAnswers(application.id);
  const updateStatus = useUpdateApplicationStatus();
  const updateApplication = useUpdateApplication();
  const removeApplication = useDeleteApplication();
  const removeAnswer = useDeleteAnswer(application.id);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const [notes, setNotes] = useState(application.notes);
  const [resumeId, setResumeId] = useState(application.resumeId ?? '');
  const [status, setStatus] = useState<ApplicationStatus>(application.status);

  const dirty = notes !== application.notes || resumeId !== (application.resumeId ?? '');

  const save = () => {
    updateApplication.mutate(
      {
        id: application.id,
        input: {
          jobId: application.jobId,
          resumeId: resumeId || null,
          resumeVersionId: application.resumeVersionId ?? null,
          score: application.score ?? null,
          status,
          appliedAt: application.appliedAt ?? (status === 'enviada' ? todayISO() : null),
          notes,
        },
      },
      {
        onSuccess: () => toast.success('Candidatura atualizada'),
        onError: (caught) => toast.error('Não foi possível salvar', caught instanceof Error ? caught.message : undefined),
      },
    );
  };

  const changeStatus = (next: ApplicationStatus) => {
    setStatus(next);
    updateStatus.mutate({ id: application.id, status: next });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Excluir candidatura?',
      description: 'As respostas geradas para ela também serão removidas. A vaga permanece cadastrada.',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    removeApplication.mutate(application.id, {
      onSuccess: () => {
        toast.success('Candidatura excluída');
        onClose();
      },
    });
  };

  return (
    <>
      {dialog}
      <Modal
        open
        onClose={onClose}
        title={application.job?.title ?? 'Candidatura'}
        description={application.job?.company || undefined}
        size="md"
        footer={
          <>
            <Button variant="danger" icon={<Trash2 />} onClick={() => void handleDelete()}>
              Excluir
            </Button>
            <Button variant="primary" onClick={save} loading={updateApplication.isPending} disabled={!dirty}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Etapa do processo</p>
            <div className="flex flex-wrap gap-1.5">
              {APPLICATION_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeStatus(value)}
                  aria-pressed={status === value}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs transition-colors',
                    status === value
                      ? 'border-accent/40 bg-accent-soft text-accent-ink'
                      : 'border-line bg-elevated text-ink-muted hover:text-ink',
                  )}
                >
                  {APPLICATION_STATUS_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Currículo utilizado"
              value={resumeId}
              onChange={(event) => setResumeId(event.target.value)}
              options={(resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }))}
              placeholder="Nenhum"
            />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-muted">Enviada em</p>
              <p className="pt-2 text-sm text-ink">{formatDate(application.appliedAt)}</p>
            </div>
          </div>

          <TextArea
            label="Observações"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            maxLength={8000}
            placeholder="Contato do recrutador, datas de entrevista, o que perguntaram…"
          />

          <div>
            <SectionTitle title="Textos gerados" description="Respostas e mensagens salvas nesta candidatura." />
            <div className="mt-3">
              {!answers || answers.length === 0 ? (
                <p className="rounded-lg border border-line bg-elevated p-3 text-xs text-ink-faint">
                  Nenhum texto salvo. Gere cartas e respostas na tela da vaga.
                </p>
              ) : (
                <ul className="space-y-2">
                  {answers.map((answer) => (
                    <li key={answer.id} className="rounded-lg border border-line bg-elevated p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink">{ANSWER_KIND_LABEL[answer.kind]}</p>
                          {answer.question && answer.kind === 'custom' && (
                            <p className="mt-0.5 text-[11px] text-ink-faint">{answer.question}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              if (await copyToClipboard(answer.answer)) toast.success('Texto copiado');
                            }}
                            className="rounded p-1.5 text-ink-faint transition hover:bg-overlay hover:text-ink"
                            aria-label="Copiar texto"
                          >
                            <Copy className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAnswer.mutate(answer.id)}
                            className="rounded p-1.5 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                            aria-label="Excluir texto"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                        {answer.answer}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Link to={`/vagas/${application.jobId}`}>
              <Button size="sm">Abrir vaga</Button>
            </Link>
            {application.job?.url && (
              <a href={application.job.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" icon={<ExternalLink />}>
                  Anúncio original
                </Button>
              </a>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
