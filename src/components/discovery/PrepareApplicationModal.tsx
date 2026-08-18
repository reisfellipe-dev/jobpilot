/**
 * Preparação de candidatura (§15–§20, §32).
 *
 * Mostra os campos do formulário com a origem de cada resposta, deixa tudo
 * editável, permite copiar e registrar a candidatura. O envio continua sendo
 * feito pelo usuário na plataforma da empresa (§17) — e isso é dito na tela,
 * não escondido.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Info, Loader2, Save, Sparkles } from 'lucide-react';
import type { ApplicationFieldPlan, ApplicationPlan, DiscoveredJob } from '@shared/discovery/schemas';
import type { DataState } from '@shared/discovery/types';
import { ANSWER_KIND_LABEL } from '@shared/constants';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, type Tone } from '@/components/ui/Primitives';
import { InlineError } from '@/components/ui/States';
import { SelectInput } from '@/components/ui/Field';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { useApplicationPlan, useSaveFieldAnswer } from '@/hooks/discovery';
import { useCreateApplication, useResumes } from '@/hooks/queries';
import { useGenerateAnswerAI } from '@/hooks/ai';
import { useAIGate } from '@/components/ai/useAIGate';

const STATE_META: Record<DataState, { label: string; tone: Tone; hint: string }> = {
  KNOWN: { label: 'do perfil', tone: 'success', hint: 'Valor existente no seu perfil.' },
  INFERRED: { label: 'deduzido', tone: 'warning', hint: 'Calculado pelo JobPilot — confira antes de enviar.' },
  UNKNOWN: { label: 'sem dado', tone: 'neutral', hint: 'Não há base no perfil para responder.' },
  USER_REQUIRED: { label: 'você responde', tone: 'accent', hint: 'Só você pode responder isso.' },
};

export function PrepareApplicationModal({
  job,
  open,
  onClose,
}: {
  job: DiscoveredJob | null;
  open: boolean;
  onClose: () => void;
}) {
  const planMutation = useApplicationPlan();
  const saveAnswer = useSaveFieldAnswer();
  const createApplication = useCreateApplication();
  const generateAnswer = useGenerateAnswerAI();
  const { data: resumes } = useResumes();
  const { ensureConsent, dialog: consentDialog, aiAvailable } = useAIGate();
  const toast = useToast();

  const [plan, setPlan] = useState<ApplicationPlan | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [resumeId, setResumeId] = useState<string>('');
  const [generated, setGenerated] = useState<{ kind: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = (jobId: string, withResumeId: string | null) => {
    setError(null);
    setGenerated(null);
    planMutation.mutate(
      { jobId, resumeId: withResumeId },
      {
        onSuccess: (result) => {
          setPlan(result);
          setResumeId(result.resumeId ?? '');
          setValues(Object.fromEntries(result.fields.map((field) => [field.key, field.value])));
        },
        onError: (caught) => setError(caught instanceof Error ? caught.message : 'Falha ao preparar.'),
      },
    );
  };

  // Uma única montagem ao abrir. Trocar de currículo recarrega explicitamente.
  useEffect(() => {
    if (!open || !job) return;
    loadPlan(job.id, job.recommendedResumeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);

  const close = () => {
    setPlan(null);
    setValues({});
    setGenerated(null);
    setError(null);
    onClose();
  };

  const pending = planMutation.isPending;

  const filled = useMemo(
    () => (plan ? plan.fields.filter((field) => (values[field.key] ?? '').trim().length > 0).length : 0),
    [plan, values],
  );

  const copyAll = async () => {
    if (!plan) return;
    const text = plan.fields
      .map((field) => `${field.label}:\n${(values[field.key] ?? '').trim() || '(a preencher)'}`)
      .join('\n\n');
    if (await copyToClipboard(text)) toast.success('Respostas copiadas');
  };

  const persistAnswer = (field: ApplicationFieldPlan) => {
    const answer = (values[field.key] ?? '').trim();
    if (!answer) return;
    saveAnswer.mutate(
      { questionKey: field.key, questionLabel: field.label, answer },
      { onSuccess: () => toast.success('Resposta salva para as próximas vagas') },
    );
  };

  const generate = async (kind: 'cover_letter' | 'recruiter_message') => {
    if (!job) return;
    setError(null);
    if (!(await ensureConsent())) return;
    try {
      const result = await generateAnswer.mutateAsync({ kind, jobId: job.id, resumeId: resumeId || null });
      setGenerated({ kind: ANSWER_KIND_LABEL[kind], text: result.answer });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar o texto.');
    }
  };

  const registerApplication = () => {
    if (!job) return;
    createApplication.mutate(
      {
        jobId: job.id,
        resumeId: resumeId || null,
        resumeVersionId: null,
        score: job.matchScore ?? null,
        status: 'preparada',
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

  if (!job) return null;

  return (
    <>
      {consentDialog}
      <Modal
        open={open}
        onClose={close}
        title="Preparar candidatura"
        description={`${job.title} — ${job.company}`}
        size="lg"
        footer={
          <>
            <Button onClick={close}>Fechar</Button>
            <Button icon={<Copy />} onClick={() => void copyAll()} disabled={!plan}>
              Copiar tudo
            </Button>
            <Button icon={<Save />} onClick={registerApplication} loading={createApplication.isPending}>
              Registrar
            </Button>
            <a href={plan?.applicationUrl || job.applicationUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" icon={<ExternalLink />}>
                Ir para candidatura
              </Button>
            </a>
          </>
        }
      >
        {pending && !plan ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
            <p className="text-sm text-ink">Lendo o formulário da vaga…</p>
          </div>
        ) : !plan ? (
          <div className="space-y-3">{error && <InlineError error={new Error(error)} />}</div>
        ) : (
          <div className="space-y-5">
            {/* Transparência sobre o que o JobPilot pode e não pode fazer (§16) */}
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3">
              <AlertTriangle className="mt-px size-4 shrink-0 text-warning" aria-hidden />
              <div className="text-xs text-warning">
                <p className="font-medium">O envio é feito por você, na plataforma da empresa.</p>
                <p className="mt-1 text-warning/90">{plan.autoSubmitReason}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <Badge tone={plan.fieldsSource === 'source' ? 'success' : 'neutral'}>
                {plan.fieldsSource === 'source' ? 'Perguntas reais desta vaga' : 'Campos mais comuns'}
              </Badge>
              <span>
                {filled} de {plan.fields.length} preenchidos
              </span>
              {plan.needsReview.length > 0 && (
                <Badge tone="accent">{plan.needsReview.length} exigem sua revisão</Badge>
              )}
            </div>

            {plan.warnings.map((warning, index) => (
              <p key={index} className="flex items-start gap-2 text-xs text-ink-muted">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                {warning}
              </p>
            ))}

            {resumes && resumes.length > 0 && (
              <SelectInput
                label="Currículo recomendado"
                value={resumeId}
                onChange={(event) => {
                  setResumeId(event.target.value);
                  if (job) loadPlan(job.id, event.target.value || null);
                }}
                options={resumes.map((resume) => ({ value: resume.id, label: resume.name }))}
                placeholder="Selecionar"
                hint="Você pode trocar — a recomendação vem do match determinístico."
              />
            )}

            {/* Campos do formulário */}
            <div className="space-y-3">
              {plan.fields.map((field) => {
                const meta = STATE_META[field.state];
                const value = values[field.key] ?? '';
                // O tipo do controle vem SÓ do plano, nunca do tamanho do texto
                // digitado.
                //
                // BUG CORRIGIDO: antes era `field.type === 'textarea' ||
                // value.length > 90`. Um campo que começava como <input> virava
                // <textarea> ao passar de 90 caracteres — e o React não
                // transforma um elemento em outro, ele destrói o primeiro e
                // monta o segundo. Na prática o teclado fechava e o cursor
                // sumia no meio da resposta, justamente nos campos longos.
                const isLong = field.type === 'textarea';

                return (
                  <div
                    key={field.key}
                    className={cn(
                      'rounded-lg border p-3',
                      field.state === 'USER_REQUIRED' || field.state === 'UNKNOWN'
                        ? 'border-accent/30 bg-accent-soft/20'
                        : 'border-line bg-elevated',
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`field-${field.key}`} className="text-xs font-medium text-ink">
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-danger" aria-hidden>
                            *
                          </span>
                        )}
                      </label>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>

                    {field.options.length > 0 && field.options.length <= 12 ? (
                      <select
                        id={`field-${field.key}`}
                        value={value}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
                      >
                        <option value="">Selecione…</option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : isLong ? (
                      <textarea
                        id={`field-${field.key}`}
                        value={value}
                        // Cresce conforme o texto. Mudar `rows` é seguro: o
                        // React só atualiza o atributo, sem remontar o campo.
                        rows={Math.min(12, Math.max(3, Math.ceil(value.length / 80)))}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <input
                        id={`field-${field.key}`}
                        value={value}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
                      />
                    )}

                    {field.note && <p className="mt-1.5 text-[11px] text-ink-faint">{field.note}</p>}

                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          if (value && (await copyToClipboard(value))) toast.success('Copiado');
                        }}
                        disabled={!value}
                        className="rounded px-2 py-1 text-[11px] text-ink-muted transition hover:bg-overlay hover:text-ink disabled:opacity-40"
                      >
                        Copiar
                      </button>
                      {(field.state === 'USER_REQUIRED' || field.state === 'UNKNOWN') && (
                        <button
                          type="button"
                          onClick={() => persistAnswer(field)}
                          disabled={!value.trim() || saveAnswer.isPending}
                          className="rounded px-2 py-1 text-[11px] text-accent-ink transition hover:bg-accent-soft disabled:opacity-40"
                        >
                          Salvar para as próximas
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Textos gerados sob demanda */}
            <div className="rounded-lg border border-line bg-elevated p-3">
              <p className="mb-2 text-xs font-medium text-ink">Textos da candidatura</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={<Sparkles />}
                  onClick={() => void generate('cover_letter')}
                  loading={generateAnswer.isPending}
                  disabled={!aiAvailable}
                >
                  Carta de apresentação
                </Button>
                <Button
                  size="sm"
                  icon={<Sparkles />}
                  onClick={() => void generate('recruiter_message')}
                  loading={generateAnswer.isPending}
                  disabled={!aiAvailable}
                >
                  Mensagem ao recrutador
                </Button>
              </div>

              {generated && (
                <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink">{generated.kind}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyToClipboard(generated.text)) toast.success('Texto copiado');
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-accent-ink hover:bg-accent-soft"
                    >
                      <Check className="size-3" aria-hidden />
                      Copiar
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{generated.text}</p>
                </div>
              )}
            </div>

            {error && <InlineError error={new Error(error)} />}
          </div>
        )}
      </Modal>
    </>
  );
}
