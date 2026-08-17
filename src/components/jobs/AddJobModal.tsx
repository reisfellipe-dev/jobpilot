/**
 * Cadastro de vaga (§20).
 *
 * Aceita texto colado, cadastro manual e a URL como referência.
 * DECISÃO: o servidor não busca o conteúdo da URL. Raspagem de sites de vagas
 * é frágil, frequentemente proibida e abriria uma superfície de SSRF. A URL é
 * guardada como link e o usuário cola a descrição — o fluxo nunca trava.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Sparkles, Wand2 } from 'lucide-react';
import type { Seniority, WorkMode } from '@shared/constants';
import type { JobInput } from '@shared/schemas/job';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { JobFormFields } from '@/components/jobs/JobFormFields';
import { useToast } from '@/providers/ToastProvider';
import { useCreateJob } from '@/hooks/queries';
import { useExtractJobAI } from '@/hooks/ai';
import { useAIGate } from '@/components/ai/useAIGate';

type Mode = 'texto' | 'manual';

const emptyJob = (): JobInput => ({
  company: '',
  title: '',
  description: '',
  url: '',
  location: '',
  workMode: null,
  seniority: null,
  requirements: [],
  niceToHave: [],
  technologies: [],
  benefits: [],
  salaryRange: '',
  postedAt: null,
  status: 'nova',
  source: 'manual',
});

export function AddJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const createJob = useCreateJob();
  const extractAI = useExtractJobAI();
  const { ensureConsent, dialog: consentDialog } = useAIGate();

  const [mode, setMode] = useState<Mode>('texto');
  const [rawText, setRawText] = useState('');
  const [url, setUrl] = useState('');
  const [form, setForm] = useState<JobInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode('texto');
    setRawText('');
    setUrl('');
    setForm(null);
    setError(null);
  };

  const close = () => {
    if (extractAI.isPending || createJob.isPending) return;
    reset();
    onClose();
  };

  const structure = async () => {
    setError(null);
    if (rawText.trim().length < 40) {
      setError('Cole a descrição da vaga (mínimo de 40 caracteres).');
      return;
    }
    if (!(await ensureConsent())) return;

    try {
      const { extraction } = await extractAI.mutateAsync(rawText.trim());
      setForm({
        ...emptyJob(),
        company: extraction.company,
        title: extraction.title,
        description: rawText.trim(),
        url: url.trim(),
        location: extraction.location,
        workMode: extraction.workMode === 'indefinido' ? null : (extraction.workMode as WorkMode),
        seniority: extraction.seniority === 'indefinido' ? null : (extraction.seniority as Seniority),
        requirements: extraction.requirements,
        niceToHave: extraction.niceToHave,
        technologies: extraction.technologies,
        benefits: extraction.benefits,
        salaryRange: extraction.salaryRange,
        source: url.trim() ? 'url' : 'texto',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível estruturar a vaga.');
    }
  };

  const skipAI = () => {
    setForm({
      ...emptyJob(),
      description: rawText.trim(),
      url: url.trim(),
      source: rawText.trim() ? 'texto' : 'manual',
    });
  };

  const save = () => {
    if (!form) return;
    if (!form.title.trim()) {
      setError('Informe o cargo da vaga.');
      return;
    }
    createJob.mutate(form, {
      onSuccess: (job) => {
        toast.success('Vaga cadastrada');
        reset();
        onClose();
        navigate(`/vagas/${job.id}`);
      },
      onError: (caught) => setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.'),
    });
  };

  return (
    <>
      {consentDialog}
      <Modal
        open={open}
        onClose={close}
        title={form ? 'Revisar vaga' : 'Nova vaga'}
        description={form ? 'Confira os campos antes de salvar.' : 'Cole a descrição ou preencha manualmente.'}
        size="md"
        footer={
          form ? (
            <>
              <Button onClick={() => setForm(null)} disabled={createJob.isPending}>
                Voltar
              </Button>
              <Button variant="primary" onClick={save} loading={createJob.isPending}>
                Salvar vaga
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close}>Cancelar</Button>
              {mode === 'texto' ? (
                <>
                  <Button onClick={skipAI} disabled={extractAI.isPending}>
                    Pular IA
                  </Button>
                  <Button variant="primary" icon={<Wand2 />} onClick={() => void structure()} loading={extractAI.isPending}>
                    Estruturar com IA
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => setForm(emptyJob())}>
                  Continuar
                </Button>
              )}
            </>
          )
        }
      >
        {form ? (
          <div className="space-y-4">
            <JobFormFields value={form} onChange={setForm} />
            {error && <InlineError error={new Error(error)} />}
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs<Mode>
              value={mode}
              onChange={setMode}
              items={[
                { value: 'texto', label: 'Colar descrição' },
                { value: 'manual', label: 'Preencher manualmente' },
              ]}
            />

            <TextInput
              label="Link da vaga (opcional)"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              maxLength={500}
              placeholder="https://…"
              hint="Guardado como referência. A página não é acessada automaticamente."
            />

            {mode === 'texto' ? (
              <>
                <TextArea
                  label="Descrição da vaga"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  rows={10}
                  maxLength={32_000}
                  placeholder="Cole aqui o texto completo do anúncio…"
                  hint={`${rawText.length} caracteres`}
                />
                <p className="flex items-start gap-2 rounded-lg border border-line bg-elevated p-3 text-xs text-ink-muted">
                  <Sparkles className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
                  A IA separa requisitos obrigatórios, diferenciais e tecnologias. Você pode revisar tudo antes de
                  salvar — ou pular a IA e preencher você mesmo.
                </p>
              </>
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-line bg-elevated p-3 text-xs text-ink-muted">
                <Link2 className="mt-px size-3.5 shrink-0" aria-hidden />
                Você preencherá cargo, requisitos e tecnologias na próxima etapa. Quanto mais completo, melhor o
                cálculo de aderência.
              </p>
            )}

            {error && <InlineError error={new Error(error)} />}
          </div>
        )}
      </Modal>
    </>
  );
}
