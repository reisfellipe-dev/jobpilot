import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, FileText, Plus, Star, Trash2, Upload } from 'lucide-react';
import type { Seniority } from '@shared/constants';
import { SENIORITY_LABEL } from '@shared/constants';
import { emptyResumeContent, type Resume, type ResumeInput } from '@shared/schemas/resume';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/States';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { ImportResumeModal } from '@/components/resumes/ImportResumeModal';
import { seniorityOptions } from '@/lib/options';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { useCreateResume, useDeleteResume, useDuplicateResume, useResumes, useUpdateResume } from '@/hooks/queries';

const emptyResumeInput = (): ResumeInput => ({
  name: '',
  objective: '',
  seniority: null,
  description: '',
  skills: [],
  targetRoles: [],
  content: emptyResumeContent(),
  priority: 50,
  isDefault: false,
  filePath: '',
  fileName: '',
  fileMime: '',
});

export function ResumesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: resumes, isPending, error, refetch } = useResumes();
  const createResume = useCreateResume();
  const updateResume = useUpdateResume();
  const duplicate = useDuplicateResume();
  const remove = useDeleteResume();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const [importOpen, setImportOpen] = useState(false);
  const [manual, setManual] = useState<ResumeInput | null>(null);

  // Abre o formulário quando a URL pede (atalho do dashboard).
  useEffect(() => {
    if (searchParams.get('novo') === '1') {
      setManual(emptyResumeInput());
      searchParams.delete('novo');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleDelete = async (resume: Resume) => {
    const ok = await confirm({
      title: 'Excluir currículo?',
      description: `"${resume.name}" e o arquivo original serão apagados. Candidaturas que o utilizam mantêm o histórico, mas perdem o vínculo.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    remove.mutate(resume.id, {
      onSuccess: () => toast.success('Currículo excluído'),
      onError: (caught) => toast.error('Não foi possível excluir', caught instanceof Error ? caught.message : undefined),
    });
  };

  const setDefault = (resume: Resume) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = resume;
    updateResume.mutate(
      { id: resume.id, input: { ...input, isDefault: !resume.isDefault } },
      {
        onSuccess: () => toast.success(resume.isDefault ? 'Currículo padrão removido' : 'Definido como padrão'),
      },
    );
  };

  const saveManual = () => {
    if (!manual) return;
    if (!manual.name.trim()) {
      toast.error('Dê um nome ao currículo');
      return;
    }
    createResume.mutate(manual, {
      onSuccess: () => {
        setManual(null);
        toast.success('Currículo criado');
      },
      onError: (caught) => toast.error('Não foi possível criar', caught instanceof Error ? caught.message : undefined),
    });
  };

  return (
    <>
      {dialog}
      <PageHeader
        title="Currículos"
        description="Versões diferentes do mesmo profissional, cada uma com seu objetivo."
        actions={
          <>
            <Button icon={<Plus />} onClick={() => setManual(emptyResumeInput())}>
              Criar
            </Button>
            <Button variant="primary" icon={<Upload />} onClick={() => setImportOpen(true)}>
              Importar
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : !resumes || resumes.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhum currículo ainda"
          description="Importe um PDF ou DOCX existente, ou crie um do zero a partir do seu perfil."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Upload />} onClick={() => setImportOpen(true)}>
                Importar currículo
              </Button>
              <Button icon={<Plus />} onClick={() => setManual(emptyResumeInput())}>
                Criar manualmente
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {resumes.map((resume) => (
            <Card key={resume.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/curriculos/${resume.id}`} className="min-w-0 flex-1 group">
                  <h2 className="truncate text-sm font-semibold text-ink group-hover:text-accent-ink">
                    {resume.name}
                  </h2>
                  {resume.objective && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{resume.objective}</p>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => setDefault(resume)}
                  className="shrink-0 rounded-md p-1.5 transition hover:bg-elevated"
                  aria-label={resume.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                  aria-pressed={resume.isDefault}
                >
                  <Star
                    className={resume.isDefault ? 'size-4 fill-warning text-warning' : 'size-4 text-ink-faint'}
                    aria-hidden
                  />
                </button>
              </div>

              <div className="flex flex-wrap gap-1">
                {resume.seniority && (
                  <Badge tone="accent">{SENIORITY_LABEL[resume.seniority as Seniority]}</Badge>
                )}
                {resume.fileName && <Badge>arquivo original</Badge>}
                <Badge>{resume.content.experiences.length} exp.</Badge>
                <Badge>{resume.skills.length} skills</Badge>
              </div>

              {resume.targetRoles.length > 0 && (
                <p className="truncate text-xs text-ink-faint">Alvo: {resume.targetRoles.join(', ')}</p>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-[11px] text-ink-faint">Atualizado {formatRelative(resume.updatedAt)}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => duplicate.mutate(resume.id, { onSuccess: () => toast.success('Currículo duplicado') })}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-elevated hover:text-ink"
                    aria-label={`Duplicar ${resume.name}`}
                  >
                    <Copy className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(resume)}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                    aria-label={`Excluir ${resume.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ImportResumeModal open={importOpen} onClose={() => setImportOpen(false)} />

      <Modal
        open={manual !== null}
        onClose={() => setManual(null)}
        title="Novo currículo"
        description="Você poderá preencher as experiências na tela de edição."
        footer={
          <>
            <Button onClick={() => setManual(null)} disabled={createResume.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveManual} loading={createResume.isPending}>
              Criar currículo
            </Button>
          </>
        }
      >
        {manual && (
          <div className="space-y-4">
            <TextInput
              label="Nome do currículo"
              required
              value={manual.name}
              onChange={(event) => setManual({ ...manual, name: event.target.value })}
              maxLength={120}
              placeholder="Ex.: Front-end React Pleno"
            />
            <TextInput
              label="Objetivo"
              value={manual.objective}
              onChange={(event) => setManual({ ...manual, objective: event.target.value })}
              maxLength={300}
              placeholder="Ex.: Vagas de front-end com React e TypeScript"
            />
            <SelectInput
              label="Senioridade"
              value={manual.seniority ?? ''}
              onChange={(event) =>
                setManual({ ...manual, seniority: (event.target.value || null) as Seniority | null })
              }
              options={seniorityOptions}
              placeholder="Não definida"
            />
            <TagInput
              label="Cargos-alvo"
              value={manual.targetRoles}
              onChange={(value) => setManual({ ...manual, targetRoles: value })}
              maxItems={20}
            />
            <TagInput
              label="Skills"
              value={manual.skills}
              onChange={(value) => setManual({ ...manual, skills: value })}
              maxItems={200}
            />
            <TextArea
              label="Descrição interna"
              value={manual.description}
              onChange={(event) => setManual({ ...manual, description: event.target.value })}
              maxLength={1000}
              rows={2}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
