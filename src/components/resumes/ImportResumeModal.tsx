/**
 * Importação de currículo (§17).
 *
 * Fluxo: validar arquivo → extrair texto no navegador → estruturar com IA →
 * revisar e corrigir → só então enviar arquivo ao Storage e salvar.
 * Nada é gravado antes da confirmação do usuário.
 */
import { useRef, useState } from 'react';
import { AlertTriangle, FileText, Info, Loader2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Seniority } from '@shared/constants';
import { MIME_BY_KIND, extractTextFromFile, validateFile, type FileKind } from '@/lib/extract';
import { STORAGE_BUCKET } from '@shared/constants';
import type { ResumeContent, ResumeInput } from '@shared/schemas/resume';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useCreateResume } from '@/hooks/queries';
import { useExtractResumeAI } from '@/hooks/ai';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Primitives';
import { InlineError } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { seniorityOptions } from '@/lib/options';
import { formatBytes, formatPeriod } from '@/lib/format';
import { useAIGate } from '@/components/ai/useAIGate';
import { cn } from '@/lib/cn';

type Step = 'origem' | 'processando' | 'revisao';
type Source = 'arquivo' | 'texto';

interface Draft {
  name: string;
  objective: string;
  seniority: Seniority | null;
  targetRoles: string[];
  skills: string[];
  description: string;
  content: ResumeContent;
  missingInfo: string[];
  warnings: string[];
  provider: string | null;
}

/** Nome de arquivo seguro para o Storage (sem acentos, espaços ou barras). */
function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
}

export function ImportResumeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const createResume = useCreateResume();
  const extractAI = useExtractResumeAI();
  const { ensureConsent, dialog: consentDialog } = useAIGate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('origem');
  const [source, setSource] = useState<Source>('arquivo');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const reset = () => {
    setStep('origem');
    setFile(null);
    setPastedText('');
    setDraft(null);
    setError(null);
    setProgress('');
  };

  const handleClose = () => {
    if (step === 'processando') return;
    reset();
    onClose();
  };

  const pickFile = (selected: File | null) => {
    setError(null);
    if (!selected) return;
    const validation = validateFile(selected);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setFile(selected);
  };

  const startExtraction = async () => {
    setError(null);

    if (!(await ensureConsent())) return;

    setStep('processando');
    try {
      let text = pastedText.trim();
      const warnings: string[] = [];

      if (source === 'arquivo') {
        if (!file) throw new Error('Selecione um arquivo.');
        setProgress('Lendo o arquivo…');
        const extraction = await extractTextFromFile(file);
        text = extraction.text;
        warnings.push(...extraction.warnings);
      }

      if (text.length < 80) {
        throw new Error(
          'Não foi possível obter texto suficiente. Se o PDF for digitalizado, cole o conteúdo na aba "Colar texto".',
        );
      }

      setProgress('Estruturando com a IA…');
      const result = await extractAI.mutateAsync(text);
      const { extraction, meta } = result;

      setDraft({
        name: extraction.suggestedName || file?.name.replace(/\.[^.]+$/, '') || 'Currículo importado',
        objective: extraction.suggestedObjective,
        seniority: extraction.suggestedSeniority,
        targetRoles: extraction.suggestedTargetRoles,
        skills: extraction.content.skills,
        description: '',
        content: extraction.content,
        missingInfo: extraction.missingInfo,
        warnings,
        provider: meta.provider,
      });
      setStep('revisao');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao processar o currículo.');
      setStep('origem');
    } finally {
      setProgress('');
    }
  };

  const save = async () => {
    if (!draft || !user) return;
    setError(null);

    try {
      let filePath = '';
      let fileName = '';
      let fileMime = '';

      if (source === 'arquivo' && file) {
        setProgress('Enviando arquivo…');
        const kind: FileKind = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
        const path = `${user.id}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: MIME_BY_KIND[kind], upsert: false });
        if (uploadError) throw new Error(`Falha ao enviar o arquivo: ${uploadError.message}`);
        filePath = path;
        fileName = file.name;
        fileMime = MIME_BY_KIND[kind];
      }

      setProgress('Salvando currículo…');
      const input: ResumeInput = {
        name: draft.name.trim() || 'Currículo importado',
        objective: draft.objective,
        seniority: draft.seniority,
        description: draft.description,
        skills: draft.skills,
        targetRoles: draft.targetRoles,
        content: { ...draft.content, skills: draft.skills },
        priority: 50,
        isDefault: false,
        filePath,
        fileName,
        fileMime,
      };

      const created = await createResume.mutateAsync(input);
      toast.success('Currículo importado', 'Revise o conteúdo completo quando quiser.');
      reset();
      onClose();
      navigate(`/curriculos/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o currículo.');
    } finally {
      setProgress('');
    }
  };

  const removeExperience = (index: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            content: {
              ...current.content,
              experiences: current.content.experiences.filter((_, position) => position !== index),
            },
          }
        : current,
    );
  };

  const busy = step === 'processando' || createResume.isPending || Boolean(progress);

  return (
    <>
      {consentDialog}
      <Modal
        open={open}
        onClose={handleClose}
        title="Importar currículo"
        description={step === 'revisao' ? 'Revise antes de salvar. Nada foi gravado ainda.' : 'PDF ou DOCX, até 8 MB.'}
        size="md"
        footer={
          step === 'revisao' ? (
            <>
              <Button onClick={() => setStep('origem')} disabled={busy}>
                Voltar
              </Button>
              <Button variant="primary" onClick={() => void save()} loading={busy}>
                Confirmar e salvar
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void startExtraction()}
                loading={busy}
                disabled={source === 'arquivo' ? !file : pastedText.trim().length < 80}
              >
                Analisar currículo
              </Button>
            </>
          )
        }
      >
        {step === 'processando' ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
            <p className="text-sm text-ink">{progress || 'Processando…'}</p>
            <p className="max-w-xs text-xs text-ink-faint">
              A extração do texto acontece no seu navegador; só o texto vai para a IA.
            </p>
          </div>
        ) : step === 'revisao' && draft ? (
          <div className="space-y-5">
            {draft.provider && (
              <p className="flex items-center gap-2 text-xs text-ink-faint">
                <Info className="size-3.5" aria-hidden />
                Estruturado por <span className="text-ink-muted">{draft.provider}</span>. Confira os dados: a IA pode
                interpretar mal um layout complexo.
              </p>
            )}

            {(draft.warnings.length > 0 || draft.missingInfo.length > 0) && (
              <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3">
                {draft.warnings.map((warning) => (
                  <p key={warning} className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                    {warning}
                  </p>
                ))}
                {draft.missingInfo.length > 0 && (
                  <p className="text-xs text-warning">
                    Não encontrado no arquivo: {draft.missingInfo.join(', ')}.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Nome do currículo"
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                maxLength={120}
                hint="Ex.: Front-end React, Back-end Java"
              />
              <SelectInput
                label="Senioridade"
                value={draft.seniority ?? ''}
                onChange={(event) => setDraft({ ...draft, seniority: (event.target.value || null) as Seniority | null })}
                options={seniorityOptions}
                placeholder="Não definida"
              />
            </div>

            <TextInput
              label="Objetivo"
              value={draft.objective}
              onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
              maxLength={300}
            />

            <TagInput
              label="Cargos-alvo"
              value={draft.targetRoles}
              onChange={(value) => setDraft({ ...draft, targetRoles: value })}
              maxItems={20}
            />

            <TagInput
              label="Skills identificadas"
              value={draft.skills}
              onChange={(value) => setDraft({ ...draft, skills: value })}
              maxItems={200}
              hint="Remova o que estiver errado — essas skills alimentam o cálculo de aderência."
            />

            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">
                Experiências encontradas ({draft.content.experiences.length})
              </p>
              {draft.content.experiences.length === 0 ? (
                <p className="text-xs text-ink-faint">
                  Nenhuma experiência foi identificada. Você poderá adicioná-las depois na edição do currículo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {draft.content.experiences.map((experience, index) => (
                    <li
                      key={`${experience.company}-${index}`}
                      className="flex items-start gap-2 rounded-lg border border-line bg-elevated p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink">
                          {experience.role || 'Cargo não identificado'}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">
                          {experience.company || 'Empresa não identificada'} ·{' '}
                          {formatPeriod(experience.startDate, experience.endDate, experience.isCurrent)}
                        </p>
                        {experience.technologies.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {experience.technologies.slice(0, 6).map((tech) => (
                              <Badge key={tech}>{tech}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExperience(index)}
                        className="rounded p-1.5 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                        aria-label="Remover experiência identificada incorretamente"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <TextArea
              label="Descrição interna (opcional)"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              maxLength={1000}
              rows={2}
              hint="Anotação para você lembrar quando usar este currículo."
            />

            {error && <InlineError error={new Error(error)} />}
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs<Source>
              value={source}
              onChange={setSource}
              items={[
                { value: 'arquivo', label: 'Enviar arquivo' },
                { value: 'texto', label: 'Colar texto' },
              ]}
            />

            {source === 'arquivo' ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    pickFile(event.dataTransfer.files?.[0] ?? null);
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 transition-colors',
                    file ? 'border-accent/50 bg-accent-soft' : 'border-line-strong bg-elevated hover:border-accent/50',
                  )}
                >
                  {file ? (
                    <>
                      <FileText className="size-6 text-accent" aria-hidden />
                      <span className="text-sm text-ink">{file.name}</span>
                      <span className="text-xs text-ink-faint">{formatBytes(file.size)} · toque para trocar</span>
                    </>
                  ) : (
                    <>
                      <Upload className="size-6 text-ink-faint" aria-hidden />
                      <span className="text-sm text-ink">Selecionar arquivo</span>
                      <span className="text-xs text-ink-faint">PDF ou DOCX, até 8 MB</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <TextArea
                label="Conteúdo do currículo"
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                rows={10}
                maxLength={48_000}
                placeholder="Cole aqui o texto completo do seu currículo…"
                hint={`${pastedText.length} caracteres · mínimo de 80`}
              />
            )}

            {error && <InlineError error={new Error(error)} />}

            <p className="text-xs text-ink-faint">
              O texto será enviado ao provedor de IA configurado para ser estruturado. O arquivo original só é
              enviado ao seu Storage privado depois que você confirmar.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
