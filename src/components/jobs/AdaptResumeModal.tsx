/**
 * Adaptação de currículo para uma vaga (§24).
 * Mostra original x adaptado, o que mudou e o que a guarda anti-alucinação
 * removeu. Nada é salvo sem aprovação explícita.
 */
import { useState } from 'react';
import { AlertTriangle, Check, Copy, ShieldAlert, Sparkles } from 'lucide-react';
import type { Job } from '@shared/schemas/job';
import type { Resume } from '@shared/schemas/resume';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';
import { InlineError } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { renderResumeText } from '@/lib/resume-text';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/providers/ToastProvider';
import { useSaveResumeVersion } from '@/hooks/queries';
import { useAdaptResumeAI, type AdaptationResult } from '@/hooks/ai';
import { useAIGate } from '@/components/ai/useAIGate';

type View = 'comparar' | 'mudancas' | 'notas';

export function AdaptResumeModal({
  open,
  onClose,
  job,
  resume,
}: {
  open: boolean;
  onClose: () => void;
  job: Job;
  resume: Resume | null;
}) {
  const adapt = useAdaptResumeAI();
  const saveVersion = useSaveResumeVersion();
  const toast = useToast();
  const { ensureConsent, dialog: consentDialog } = useAIGate();

  const [result, setResult] = useState<AdaptationResult | null>(null);
  const [view, setView] = useState<View>('comparar');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (adapt.isPending || saveVersion.isPending) return;
    setResult(null);
    setError(null);
    setView('comparar');
    onClose();
  };

  const run = async () => {
    if (!resume) return;
    setError(null);
    if (!(await ensureConsent())) return;
    try {
      const outcome = await adapt.mutateAsync({ jobId: job.id, resumeId: resume.id });
      setResult(outcome);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível adaptar o currículo.');
    }
  };

  const save = () => {
    if (!result || !resume) return;
    saveVersion.mutate(
      {
        resumeId: resume.id,
        jobId: job.id,
        label: `${resume.name} → ${job.title}`.slice(0, 160),
        content: result.adapted,
        changes: result.changes,
        keywordsAdded: result.keywordsAdded,
        provider: result.meta.provider,
        model: result.meta.model,
      },
      {
        onSuccess: () => {
          toast.success('Versão adaptada salva', 'Disponível na aba Versões do currículo.');
          close();
        },
        onError: (caught) => setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.'),
      },
    );
  };

  const originalText = result ? renderResumeText(result.original) : '';
  const adaptedText = result ? renderResumeText(result.adapted) : '';

  return (
    <>
      {consentDialog}
      <Modal
        open={open}
        onClose={close}
        title="Adaptar currículo para esta vaga"
        description={resume ? `${resume.name} → ${job.title}` : 'Selecione um currículo'}
        size="lg"
        footer={
          result ? (
            <>
              <Button onClick={close} disabled={saveVersion.isPending}>
                Descartar
              </Button>
              <Button
                icon={<Copy />}
                onClick={async () => {
                  if (await copyToClipboard(adaptedText)) toast.success('Versão adaptada copiada');
                }}
              >
                Copiar
              </Button>
              <Button variant="primary" icon={<Check />} onClick={save} loading={saveVersion.isPending}>
                Salvar versão
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close}>Cancelar</Button>
              <Button
                variant="primary"
                icon={<Sparkles />}
                onClick={() => void run()}
                loading={adapt.isPending}
                disabled={!resume}
              >
                Adaptar com IA
              </Button>
            </>
          )
        }
      >
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              A IA vai reorganizar e reescrever o currículo para dialogar com esta vaga, usando{' '}
              <strong className="text-ink">apenas</strong> informações que já existem nele.
            </p>
            <ul className="space-y-1.5 text-xs text-ink-muted">
              <li>• Reordena experiências, projetos e skills por relevância.</li>
              <li>• Reescreve o resumo e os bullets mantendo os fatos.</li>
              <li>• Padroniza termos para melhorar a leitura por sistemas ATS.</li>
            </ul>
            <p className="flex items-start gap-2 rounded-lg border border-line bg-elevated p-3 text-xs text-ink-muted">
              <ShieldAlert className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
              Depois da geração, uma verificação automática remove qualquer empresa, cargo, data, skill ou
              certificação que não exista no currículo original.
            </p>
            {error && <InlineError error={new Error(error)} />}
          </div>
        ) : (
          <div className="space-y-4">
            {result.violations.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {result.violations.length} correção(ões) aplicada(s) automaticamente
                </p>
                <ul className="mt-2 space-y-1 text-xs text-warning/90">
                  {result.violations.slice(0, 8).map((violation, index) => (
                    <li key={index}>• {violation.detail}</li>
                  ))}
                </ul>
              </div>
            )}

            <Tabs<View>
              value={view}
              onChange={setView}
              items={[
                { value: 'comparar', label: 'Original × Adaptado' },
                { value: 'mudancas', label: 'Mudanças', count: result.changes.length },
                { value: 'notas', label: 'Observações' },
              ]}
            />

            {view === 'comparar' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-muted">Original</p>
                  <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-elevated p-3 font-mono text-[11px] leading-relaxed text-ink-muted whitespace-pre-wrap break-words">
                    {originalText}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-accent-ink">Adaptado</p>
                  <pre className="max-h-96 overflow-auto rounded-lg border border-accent/30 bg-accent-soft/40 p-3 font-mono text-[11px] leading-relaxed text-ink whitespace-pre-wrap break-words">
                    {adaptedText}
                  </pre>
                </div>
              </div>
            )}

            {view === 'mudancas' && (
              <div className="space-y-3">
                {result.changes.length === 0 ? (
                  <p className="text-xs text-ink-faint">A IA não registrou mudanças estruturais.</p>
                ) : (
                  result.changes.map((change, index) => (
                    <div key={index} className="rounded-lg border border-line bg-elevated p-3">
                      <p className="text-xs font-medium text-ink">{change.section}</p>
                      <p className="mt-1 text-xs text-ink-faint">{change.reason}</p>
                      {change.before && (
                        <p className="mt-2 border-l-2 border-danger/50 pl-2 text-xs text-ink-muted line-through decoration-danger/40">
                          {change.before}
                        </p>
                      )}
                      {change.after && (
                        <p className="mt-1.5 border-l-2 border-success/50 pl-2 text-xs text-ink">{change.after}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {view === 'notas' && (
              <div className="space-y-4">
                {result.keywordsAdded.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-ink-muted">Palavras-chave reforçadas</p>
                    <div className="flex flex-wrap gap-1">
                      {result.keywordsAdded.map((keyword) => (
                        <Badge key={keyword} tone="accent">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.missingInfo.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-ink-muted">
                      Requisitos que o currículo não cobre
                    </p>
                    <ul className="space-y-1 text-xs text-ink-muted">
                      {result.missingInfo.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.atsNotes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-ink-muted">Notas de compatibilidade ATS</p>
                    <ul className="space-y-1 text-xs text-ink-muted">
                      {result.atsNotes.map((note, index) => (
                        <li key={index}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px] text-ink-faint">
                  Gerado por {result.meta.provider ?? 'IA'}
                  {result.meta.model ? ` · ${result.meta.model}` : ''}
                  {result.meta.fallbackUsed ? ' (provider de fallback)' : ''}
                </p>
              </div>
            )}

            {error && <InlineError error={new Error(error)} />}
          </div>
        )}
      </Modal>
    </>
  );
}
