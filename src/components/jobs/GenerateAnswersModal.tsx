/**
 * Geração de textos de candidatura (§26).
 * Todos os textos saem apenas do perfil e do currículo escolhido; lacunas são
 * mostradas explicitamente em vez de preenchidas por suposição.
 */
import { useMemo, useState } from 'react';
import { Copy, Save, Sparkles } from 'lucide-react';
import type { AnswerKind } from '@shared/constants';
import { ANSWER_KINDS, ANSWER_KIND_LABEL } from '@shared/constants';
import type { Job } from '@shared/schemas/job';
import type { Resume } from '@shared/schemas/resume';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextArea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { useApplications, useCreateApplication, useSaveApplicationAnswer } from '@/hooks/queries';
import { useGenerateAnswerAI, type AnswerResult } from '@/hooks/ai';
import { useAIGate } from '@/components/ai/useAIGate';

export function GenerateAnswersModal({
  open,
  onClose,
  job,
  resumes,
  defaultResumeId,
}: {
  open: boolean;
  onClose: () => void;
  job: Job;
  resumes: Resume[];
  defaultResumeId: string | null;
}) {
  const generate = useGenerateAnswerAI();
  const { data: applications } = useApplications();
  const createApplication = useCreateApplication();
  const toast = useToast();
  const { ensureConsent, dialog: consentDialog } = useAIGate();

  const [kind, setKind] = useState<AnswerKind>('cover_letter');
  const [question, setQuestion] = useState('');
  const [resumeId, setResumeId] = useState<string>(defaultResumeId ?? resumes[0]?.id ?? '');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [edited, setEdited] = useState('');
  const [error, setError] = useState<string | null>(null);

  const application = useMemo(
    () => (applications ?? []).find((item) => item.jobId === job.id) ?? null,
    [applications, job.id],
  );
  const saveAnswer = useSaveApplicationAnswer();

  const close = () => {
    if (generate.isPending || saveAnswer.isPending) return;
    setResult(null);
    setEdited('');
    setError(null);
    onClose();
  };

  const run = async () => {
    setError(null);
    if (kind === 'custom' && !question.trim()) {
      setError('Escreva a pergunta do processo seletivo.');
      return;
    }
    if (!(await ensureConsent())) return;

    try {
      const outcome = await generate.mutateAsync({
        kind,
        jobId: job.id,
        resumeId: resumeId || null,
        ...(question.trim() ? { question: question.trim() } : {}),
      });
      setResult(outcome);
      setEdited(outcome.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar o texto.');
    }
  };

  const persist = async () => {
    if (!edited.trim()) return;
    setError(null);

    try {
      let targetId = application?.id ?? '';
      if (!targetId) {
        const created = await createApplication.mutateAsync({
          jobId: job.id,
          resumeId: resumeId || null,
          resumeVersionId: null,
          score: null,
          status: 'preparada',
          appliedAt: null,
          notes: '',
        });
        targetId = created.id;
      }

      await saveAnswer.mutateAsync({
        applicationId: targetId,
        kind,
        question: kind === 'custom' ? question.trim() : ANSWER_KIND_LABEL[kind],
        answer: edited.trim(),
        provider: result?.meta.provider ?? null,
        model: result?.meta.model ?? null,
      });
      toast.success('Resposta salva na candidatura');
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a resposta.');
    }
  };

  return (
    <>
      {consentDialog}
      <Modal
        open={open}
        onClose={close}
        title="Gerar textos da candidatura"
        description={job.title}
        size="md"
        footer={
          result ? (
            <>
              <Button onClick={() => setResult(null)} disabled={saveAnswer.isPending}>
                Gerar outro
              </Button>
              <Button
                icon={<Copy />}
                onClick={async () => {
                  if (await copyToClipboard(edited)) toast.success('Texto copiado');
                }}
              >
                Copiar
              </Button>
              <Button
                variant="primary"
                icon={<Save />}
                onClick={() => void persist()}
                loading={saveAnswer.isPending || createApplication.isPending}
              >
                Salvar
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close}>Cancelar</Button>
              <Button variant="primary" icon={<Sparkles />} onClick={() => void run()} loading={generate.isPending}>
                Gerar texto
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-4">
            <TextArea
              label={ANSWER_KIND_LABEL[kind]}
              value={edited}
              onChange={(event) => setEdited(event.target.value)}
              rows={12}
              maxLength={20_000}
              hint="Edite livremente antes de salvar ou copiar."
            />

            {result.missingInfo.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
                <p className="text-xs font-medium text-warning">Informações que faltam no seu perfil</p>
                <ul className="mt-1.5 space-y-1 text-xs text-warning/90">
                  {result.missingInfo.map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-warning/80">
                  O texto foi escrito sem inventar esses dados. Complete o perfil e gere de novo se quiser mencioná-los.
                </p>
              </div>
            )}

            {result.notes && <p className="text-xs text-ink-muted">{result.notes}</p>}

            <p className="text-[11px] text-ink-faint">
              Gerado por {result.meta.provider ?? 'IA'}
              {result.meta.model ? ` · ${result.meta.model}` : ''}
              {!application && ' · salvar criará a candidatura para esta vaga'}
            </p>

            {error && <InlineError error={new Error(error)} />}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Tipo de texto</p>
              <div className="flex flex-wrap gap-1.5">
                {ANSWER_KINDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    aria-pressed={kind === value}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs transition-colors',
                      kind === value
                        ? 'border-accent/40 bg-accent-soft text-accent-ink'
                        : 'border-line bg-elevated text-ink-muted hover:text-ink',
                    )}
                  >
                    {ANSWER_KIND_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>

            {kind === 'custom' && (
              <TextArea
                label="Pergunta do processo"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Cole aqui a pergunta exatamente como aparece no formulário"
              />
            )}

            <SelectInput
              label="Currículo de referência"
              value={resumeId}
              onChange={(event) => setResumeId(event.target.value)}
              options={resumes.map((resume) => ({ value: resume.id, label: resume.name }))}
              placeholder="Usar apenas o perfil"
            />

            <p className="text-xs text-ink-faint">
              O texto usa somente o que existe no seu perfil e no currículo escolhido. Se faltar algo, o JobPilot
              avisa em vez de inventar.
            </p>

            {error && <InlineError error={new Error(error)} />}
          </div>
        )}
      </Modal>
    </>
  );
}
