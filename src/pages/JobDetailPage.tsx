import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react';
import type { Seniority, WorkMode } from '@shared/constants';
import { JOB_STATUS_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL } from '@shared/constants';
import type { Job, JobInput, ResumeMatch } from '@shared/schemas/job';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader, SectionTitle } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, InlineError, ListSkeleton } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { ScoreBreakdown, ScoreRing } from '@/components/ui/Score';
import { JobFormFields } from '@/components/jobs/JobFormFields';
import { AdaptResumeModal } from '@/components/jobs/AdaptResumeModal';
import { GenerateAnswersModal } from '@/components/jobs/GenerateAnswersModal';
import { useAIGate } from '@/components/ai/useAIGate';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import {
  useAnalyzeJob,
  useApplications,
  useCreateApplication,
  useJob,
  useJobAnalysis,
  useResumes,
  useUpdateJob,
} from '@/hooks/queries';

const RECOMMENDATION_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  aplicar: { label: 'Aplicar', tone: 'success' },
  aplicar_com_ajustes: { label: 'Aplicar com ajustes', tone: 'warning' },
  avaliar: { label: 'Avaliar', tone: 'neutral' },
  nao_recomendado: { label: 'Não recomendado', tone: 'danger' },
};

function toJobInput(job: Job): JobInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = job;
  return rest;
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isPending, error, refetch } = useJob(id);
  const { data: analysisData, isPending: analysisPending } = useJobAnalysis(id);
  const { data: resumes } = useResumes();
  const { data: applications } = useApplications();
  const analyze = useAnalyzeJob(id ?? '');
  const updateJob = useUpdateJob();
  const createApplication = useCreateApplication();
  const toast = useToast();
  const { ensureConsent, dialog: consentDialog, aiAvailable } = useAIGate();

  const [editing, setEditing] = useState<JobInput | null>(null);
  const [adaptFor, setAdaptFor] = useState<string | null>(null);
  const [answersOpen, setAnswersOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const record = analysisData?.analysis ?? null;
  const matches = record?.matches ?? [];
  const recommendedId = record?.recommendedResumeId ?? null;

  const application = useMemo(
    () => (applications ?? []).find((item) => item.jobId === id) ?? null,
    [applications, id],
  );

  const bestMatch = matches[0] ?? null;
  const recommendedResume = useMemo(
    () => (resumes ?? []).find((resume) => resume.id === (adaptFor ?? recommendedId)) ?? null,
    [resumes, adaptFor, recommendedId],
  );

  const runAnalysis = async (force: boolean) => {
    setAnalysisError(null);
    if (!(await ensureConsent())) return;
    analyze.mutate(force, {
      onSuccess: (result) => {
        toast.success(
          result.cached ? 'Análise recuperada do cache' : 'Análise concluída',
          result.fallbackUsed ? 'O provider de fallback foi utilizado.' : undefined,
        );
      },
      onError: (caught) => setAnalysisError(caught instanceof Error ? caught.message : 'Falha na análise.'),
    });
  };

  const saveEdit = () => {
    if (!editing || !id) return;
    updateJob.mutate(
      { id, input: editing },
      {
        onSuccess: () => {
          setEditing(null);
          toast.success('Vaga atualizada', 'A próxima análise usará os dados novos.');
        },
        onError: (caught) => toast.error('Não foi possível salvar', caught instanceof Error ? caught.message : undefined),
      },
    );
  };

  const registerApplication = () => {
    if (!id) return;
    createApplication.mutate(
      {
        jobId: id,
        resumeId: recommendedId ?? bestMatch?.resumeId ?? null,
        resumeVersionId: null,
        score: bestMatch?.score ?? null,
        status: 'analisada',
        appliedAt: null,
        notes: '',
      },
      {
        onSuccess: () => toast.success('Candidatura registrada', 'Acompanhe pelo Kanban.'),
        onError: (caught) =>
          toast.error('Não foi possível registrar', caught instanceof Error ? caught.message : undefined),
      },
    );
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending || !job) return <ListSkeleton rows={4} />;

  return (
    <>
      {consentDialog}

      <Link to="/vagas" className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden />
        Vagas
      </Link>

      <PageHeader
        title={job.title}
        description={[job.company, job.location, job.workMode ? WORK_MODE_LABEL[job.workMode as WorkMode] : '']
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {job.url && (
              <a href={job.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" icon={<ExternalLink />}>
                  Anúncio
                </Button>
              </a>
            )}
            <Button size="sm" icon={<Pencil />} onClick={() => setEditing(toJobInput(job))}>
              Editar
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={job.status === 'aplicada' ? 'success' : job.status === 'analisada' ? 'accent' : 'neutral'}>
          {JOB_STATUS_LABEL[job.status]}
        </Badge>
        {job.seniority && <Badge>{SENIORITY_LABEL[job.seniority as Seniority]}</Badge>}
        {job.salaryRange && <Badge tone="info">{job.salaryRange}</Badge>}
        {application && <Badge tone="accent">Candidatura registrada</Badge>}
      </div>

      {/* --- Ações principais: prioridade de toque no mobile (§32) --- */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          variant="primary"
          icon={record ? <RefreshCw /> : <Sparkles />}
          onClick={() => void runAnalysis(Boolean(record))}
          loading={analyze.isPending}
          disabled={!aiAvailable}
        >
          {record ? 'Reanalisar' : 'Analisar'}
        </Button>
        <Button
          icon={<Wand2 />}
          onClick={() => setAdaptFor(recommendedId ?? bestMatch?.resumeId ?? resumes?.[0]?.id ?? null)}
          disabled={!aiAvailable || !resumes || resumes.length === 0}
        >
          Adaptar CV
        </Button>
        <Button icon={<MessageSquareText />} onClick={() => setAnswersOpen(true)} disabled={!aiAvailable}>
          Gerar textos
        </Button>
        {application ? (
          <Link to="/candidaturas">
            <Button icon={<Send />} fullWidth>
              Ver candidatura
            </Button>
          </Link>
        ) : (
          <Button icon={<Send />} onClick={registerApplication} loading={createApplication.isPending}>
            Registrar
          </Button>
        )}
      </div>

      {!aiAvailable && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          Nenhum provider de IA está configurado no servidor. A vaga continua salva e editável; a análise
          automática fica indisponível até configurar GROQ_API_KEY ou NVIDIA_API_KEY.
        </div>
      )}

      {analysisError && (
        <div className="mb-5">
          <InlineError error={new Error(analysisError)} />
        </div>
      )}

      {analysisData?.stale && record && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info-soft p-3 text-xs text-info">
          <span>A vaga ou os currículos mudaram desde esta análise.</span>
          <Button size="sm" onClick={() => void runAnalysis(true)} loading={analyze.isPending}>
            Reanalisar
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* --- Matching --- */}
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <SectionTitle
              title="Aderência por currículo"
              description={
                record
                  ? `Analisado em ${formatDateTime(record.createdAt)}${record.provider ? ` · ${record.provider}` : ''}`
                  : 'Compare a vaga com todos os seus currículos.'
              }
            />

            <div className="mt-4">
              {analysisPending ? (
                <ListSkeleton rows={2} />
              ) : !record ? (
                <EmptyState
                  icon={<Target />}
                  title="Vaga ainda não analisada"
                  description={
                    analysisData?.hasResumes === false
                      ? 'Cadastre pelo menos um currículo para comparar com esta vaga.'
                      : 'A análise identifica requisitos, calcula o score de cada currículo e indica o mais adequado.'
                  }
                  action={
                    analysisData?.hasResumes === false ? (
                      <Link to="/curriculos">
                        <Button variant="primary" size="sm">
                          Cadastrar currículo
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Sparkles />}
                        onClick={() => void runAnalysis(false)}
                        loading={analyze.isPending}
                        disabled={!aiAvailable}
                      >
                        Analisar agora
                      </Button>
                    )
                  }
                />
              ) : matches.length === 0 ? (
                <EmptyState
                  title="Nenhum currículo para comparar"
                  description="A análise da vaga foi feita, mas não há currículos cadastrados."
                  action={
                    <Link to="/curriculos">
                      <Button size="sm" variant="primary">
                        Cadastrar currículo
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {matches.map((match) => (
                    <MatchRow
                      key={match.resumeId}
                      match={match}
                      recommended={match.resumeId === recommendedId}
                      expanded={expanded === match.resumeId}
                      onToggle={() => setExpanded(expanded === match.resumeId ? null : match.resumeId)}
                      onAdapt={() => setAdaptFor(match.resumeId)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {record?.recommendationReason && (
              <p className="mt-4 rounded-lg border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink">
                <strong className="font-medium">Por que este currículo:</strong> {record.recommendationReason}
              </p>
            )}
          </Card>

          {job.description && (
            <Card>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">Descrição original</span>
                  <ChevronDown className="size-4 text-ink-faint transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{job.description}</p>
              </details>
            </Card>
          )}
        </div>

        {/* --- Análise da vaga --- */}
        <div className="space-y-5 lg:col-span-2">
          {record && (
            <>
              <Card>
                <SectionTitle title="O que a vaga pede" />
                <div className="mt-4 space-y-4 text-xs">
                  {record.analysis.summary && <p className="text-ink-muted">{record.analysis.summary}</p>}

                  {record.analysis.requiredSkills.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-medium text-ink">Obrigatórios</p>
                      <div className="flex flex-wrap gap-1">
                        {record.analysis.requiredSkills.map((skill) => (
                          <Badge key={skill} tone="danger">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.analysis.preferredSkills.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-medium text-ink">Desejáveis</p>
                      <div className="flex flex-wrap gap-1">
                        {record.analysis.preferredSkills.map((skill) => (
                          <Badge key={skill}>{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.analysis.minYearsExperience !== null && (
                    <p className="text-ink-muted">
                      Tempo mínimo pedido: <span className="text-ink">{record.analysis.minYearsExperience} ano(s)</span>
                    </p>
                  )}

                  {record.analysis.softSkills.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-medium text-ink">Soft skills</p>
                      <p className="text-ink-muted">{record.analysis.softSkills.join(', ')}</p>
                    </div>
                  )}
                </div>
              </Card>

              {record.analysis.atsNotes.length > 0 && (
                <Card>
                  <SectionTitle title="Compatibilidade ATS" />
                  <ul className="mt-3 space-y-1.5 text-xs text-ink-muted">
                    {record.analysis.atsNotes.map((note, index) => (
                      <li key={index}>• {note}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {record.analysis.redFlags.length > 0 && (
                <Card>
                  <SectionTitle title="Pontos de atenção" />
                  <ul className="mt-3 space-y-1.5 text-xs text-warning">
                    {record.analysis.redFlags.map((flag, index) => (
                      <li key={index}>• {flag}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}

          {job.benefits.length > 0 && (
            <Card>
              <SectionTitle title="Benefícios" />
              <div className="mt-3 flex flex-wrap gap-1">
                {job.benefits.map((benefit) => (
                  <Badge key={benefit} tone="success">
                    {benefit}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* --- Modais --- */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Editar vaga"
        size="md"
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={updateJob.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveEdit} loading={updateJob.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && <JobFormFields value={editing} onChange={setEditing} showStatus />}
      </Modal>

      <AdaptResumeModal
        open={adaptFor !== null}
        onClose={() => setAdaptFor(null)}
        job={job}
        resume={recommendedResume}
      />

      <GenerateAnswersModal
        open={answersOpen}
        onClose={() => setAnswersOpen(false)}
        job={job}
        resumes={resumes ?? []}
        defaultResumeId={recommendedId ?? bestMatch?.resumeId ?? null}
      />
    </>
  );
}

function MatchRow({
  match,
  recommended,
  expanded,
  onToggle,
  onAdapt,
}: {
  match: ResumeMatch;
  recommended: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAdapt: () => void;
}) {
  const recommendation = match.semantic ? RECOMMENDATION_LABEL[match.semantic.recommendation] : null;

  return (
    <li
      className={cn(
        'rounded-xl border transition-colors',
        recommended ? 'border-accent/40 bg-accent-soft/30' : 'border-line bg-elevated',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <ScoreRing score={match.score} size={56} label={match.resumeName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink">{match.resumeName}</p>
            {recommended && <Badge tone="accent">Recomendado</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {match.matchedSkills.length} atendido(s) · {match.partialSkills.length} parcial(is) ·{' '}
            {match.missingSkills.length} ausente(s)
          </p>
          {match.semanticAdjustment !== 0 && (
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Base {match.baseScore} · ajuste da IA {match.semanticAdjustment > 0 ? '+' : ''}
              {match.semanticAdjustment}
            </p>
          )}
        </div>
        {recommendation && <Badge tone={recommendation.tone}>{recommendation.label}</Badge>}
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-faint transition', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-line px-3 pb-4 pt-4">
          <div>
            <p className="mb-3 text-xs font-medium text-ink">Como o score foi formado</p>
            <ScoreBreakdown items={match.breakdown} />
          </div>

          {match.requirements.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink">Requisitos da vaga</p>
              <ul className="space-y-1.5">
                {match.requirements.map((requirement, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs">
                    <span
                      className={cn(
                        'mt-1 size-1.5 shrink-0 rounded-full',
                        requirement.status === 'atendido'
                          ? 'bg-success'
                          : requirement.status === 'parcial'
                            ? 'bg-warning'
                            : 'bg-danger',
                      )}
                      aria-hidden
                    />
                    <span className="text-ink-muted">
                      {requirement.requirement}
                      {requirement.evidence && (
                        <span className="block text-[11px] text-ink-faint">{requirement.evidence}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {match.semantic && (
            <div className="space-y-3 text-xs">
              {match.semantic.rationale && <p className="text-ink-muted">{match.semantic.rationale}</p>}
              {match.semantic.strengths.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-success">Pontos fortes</p>
                  <ul className="space-y-1 text-ink-muted">
                    {match.semantic.strengths.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {match.semantic.gaps.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-warning">Gaps</p>
                  <ul className="space-y-1 text-ink-muted">
                    {match.semantic.gaps.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {match.semantic.risks.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-danger">Riscos</p>
                  <ul className="space-y-1 text-ink-muted">
                    {match.semantic.risks.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {match.semantic.recommendationReason && (
                <p className="rounded-lg border border-line bg-surface p-2.5 text-ink-muted">
                  {match.semantic.recommendationReason}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Wand2 />} onClick={onAdapt}>
              Adaptar este currículo
            </Button>
            <Link to={`/curriculos/${match.resumeId}`}>
              <Button size="sm">Abrir currículo</Button>
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}
