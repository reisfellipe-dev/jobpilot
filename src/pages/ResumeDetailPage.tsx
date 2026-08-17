import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FileDown, History, Save, Trash2 } from 'lucide-react';
import type { Seniority } from '@shared/constants';
import { STORAGE_BUCKET } from '@shared/constants';
import type { Resume, ResumeContent, ResumeInput } from '@shared/schemas/resume';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader, SectionTitle } from '@/components/ui/Primitives';
import { ErrorState, InlineError, ListSkeleton } from '@/components/ui/States';
import { Checkbox, SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { Repeatable } from '@/components/ui/Repeatable';
import { Tabs } from '@/components/ui/Tabs';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { educationStatusOptions, languageLevelOptions, seniorityOptions } from '@/lib/options';
import { formatDateTime } from '@/lib/format';
import { renderResumeText } from '@/lib/resume-text';
import { copyToClipboard, downloadText } from '@/lib/clipboard';
import { useToast } from '@/providers/ToastProvider';
import {
  useDeleteResumeVersion,
  useResume,
  useResumeVersions,
  useUpdateResume,
} from '@/hooks/queries';

type Tab = 'dados' | 'conteudo' | 'versoes';

function toInput(resume: Resume): ResumeInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = resume;
  return rest;
}

export function ResumeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: resume, isPending, error, refetch } = useResume(id);
  const update = useUpdateResume();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('dados');
  const [form, setForm] = useState<ResumeInput | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (resume) {
      setForm(toInput(resume));
      setDirty(false);
    }
  }, [resume]);

  const set = <K extends keyof ResumeInput>(key: K, value: ResumeInput[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
  };

  const setContent = (patch: Partial<ResumeContent>) => {
    setForm((current) => (current ? { ...current, content: { ...current.content, ...patch } } : current));
    setDirty(true);
  };

  const save = () => {
    if (!form || !id) return;
    if (!form.name.trim()) {
      toast.error('O currículo precisa de um nome');
      return;
    }
    update.mutate(
      { id, input: { ...form, skills: form.skills.length > 0 ? form.skills : form.content.skills } },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success('Currículo salvo');
        },
        onError: (caught) => toast.error('Não foi possível salvar', caught instanceof Error ? caught.message : undefined),
      },
    );
  };

  const plainText = useMemo(() => (form ? renderResumeText(form.content) : ''), [form]);

  const downloadOriginal = async () => {
    if (!resume?.filePath) return;
    const { data, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(resume.filePath, 60);
    if (signError || !data) {
      toast.error('Não foi possível gerar o link do arquivo', signError?.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending || !resume || !form) return <ListSkeleton rows={4} />;

  return (
    <>
      <Link
        to="/curriculos"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Currículos
      </Link>

      <PageHeader
        title={resume.name}
        description={resume.objective || 'Sem objetivo definido'}
        actions={
          <>
            {resume.filePath && (
              <Button size="sm" icon={<Download />} onClick={() => void downloadOriginal()}>
                Original
              </Button>
            )}
            <Button
              size="sm"
              icon={<Copy />}
              onClick={async () => {
                const ok = await copyToClipboard(plainText);
                if (ok) toast.success('Currículo copiado como texto');
                else toast.error('Não foi possível copiar');
              }}
            >
              Copiar
            </Button>
            <Button
              size="sm"
              icon={<FileDown />}
              onClick={() => downloadText(plainText, `${resume.name.replace(/[^\w-]+/g, '-')}.txt`)}
            >
              .txt
            </Button>
          </>
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="mb-5"
        items={[
          { value: 'dados', label: 'Dados' },
          { value: 'conteudo', label: 'Conteúdo', count: form.content.experiences.length },
          { value: 'versoes', label: 'Versões adaptadas' },
        ]}
      />

      {tab === 'dados' && (
        <div className="space-y-5">
          <Card>
            <SectionTitle title="Classificação" description="Define quando este currículo deve ser usado (§19)." />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Nome do currículo"
                required
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                maxLength={120}
              />
              <SelectInput
                label="Senioridade"
                value={form.seniority ?? ''}
                onChange={(event) => set('seniority', (event.target.value || null) as Seniority | null)}
                options={seniorityOptions}
                placeholder="Não definida"
              />
            </div>
            <div className="mt-4 space-y-4">
              <TextInput
                label="Objetivo"
                value={form.objective}
                onChange={(event) => set('objective', event.target.value)}
                maxLength={300}
              />
              <TagInput
                label="Cargos-alvo"
                value={form.targetRoles}
                onChange={(value) => set('targetRoles', value)}
                maxItems={20}
              />
              <TagInput
                label="Skills declaradas"
                value={form.skills}
                onChange={(value) => set('skills', value)}
                maxItems={200}
                hint="Usadas diretamente no cálculo de aderência às vagas."
              />
              <TextArea
                label="Descrição interna"
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                maxLength={1000}
                rows={2}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label="Prioridade"
                  type="number"
                  min={0}
                  max={100}
                  value={form.priority}
                  onChange={(event) => set('priority', Number(event.target.value))}
                  hint="Ordena a lista de currículos (0 a 100)."
                />
                <div className="flex items-end pb-2">
                  <Checkbox
                    label="Currículo padrão"
                    description="Sugerido primeiro nas candidaturas."
                    checked={form.isDefault}
                    onChange={(event) => set('isDefault', event.target.checked)}
                  />
                </div>
              </div>
            </div>
          </Card>

          {resume.fileName && (
            <Card>
              <SectionTitle title="Arquivo original" />
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Badge>{resume.fileName}</Badge>
                <span>armazenado de forma privada no seu Storage.</span>
              </p>
            </Card>
          )}
        </div>
      )}

      {tab === 'conteudo' && (
        <div className="space-y-5">
          <Card>
            <SectionTitle title="Cabeçalho" />
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label="Nome exibido"
                  value={form.content.fullName}
                  onChange={(event) => setContent({ fullName: event.target.value })}
                  maxLength={140}
                />
                <TextInput
                  label="Headline"
                  value={form.content.headline}
                  onChange={(event) => setContent({ headline: event.target.value })}
                  maxLength={180}
                />
                <TextInput
                  label="E-mail"
                  value={form.content.contact.email}
                  onChange={(event) => setContent({ contact: { ...form.content.contact, email: event.target.value } })}
                  maxLength={200}
                />
                <TextInput
                  label="Telefone"
                  value={form.content.contact.phone}
                  onChange={(event) => setContent({ contact: { ...form.content.contact, phone: event.target.value } })}
                  maxLength={40}
                />
                <TextInput
                  label="Localização"
                  value={form.content.contact.location}
                  onChange={(event) =>
                    setContent({ contact: { ...form.content.contact, location: event.target.value } })
                  }
                  maxLength={140}
                />
              </div>
              <TextArea
                label="Resumo"
                value={form.content.summary}
                onChange={(event) => setContent({ summary: event.target.value })}
                maxLength={4000}
                rows={5}
              />
              <TagInput
                label="Skills do conteúdo"
                value={form.content.skills}
                onChange={(value) => setContent({ skills: value })}
                maxItems={200}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle title="Experiências" description="O que aparece neste currículo específico." />
            <div className="mt-4">
              <Repeatable
                items={form.content.experiences}
                onChange={(value) => setContent({ experiences: value })}
                max={40}
                addLabel="Adicionar experiência"
                emptyLabel="Nenhuma experiência neste currículo."
                create={() => ({
                  company: '',
                  role: '',
                  description: '',
                  startDate: '',
                  endDate: '',
                  isCurrent: false,
                  technologies: [],
                  achievements: [],
                  responsibilities: [],
                })}
                render={(item, patch) => (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput
                        label="Empresa"
                        value={item.company}
                        onChange={(event) => patch({ company: event.target.value })}
                        maxLength={160}
                      />
                      <TextInput
                        label="Cargo"
                        value={item.role}
                        onChange={(event) => patch({ role: event.target.value })}
                        maxLength={160}
                      />
                      <TextInput
                        label="Início"
                        value={item.startDate ?? ''}
                        onChange={(event) => patch({ startDate: event.target.value })}
                        placeholder="AAAA-MM"
                        maxLength={7}
                      />
                      <TextInput
                        label="Fim"
                        value={item.endDate ?? ''}
                        onChange={(event) => patch({ endDate: event.target.value })}
                        placeholder="AAAA-MM"
                        maxLength={7}
                        disabled={item.isCurrent}
                      />
                    </div>
                    <Checkbox
                      label="Emprego atual"
                      checked={item.isCurrent}
                      onChange={(event) => patch({ isCurrent: event.target.checked })}
                    />
                    <TextArea
                      label="Descrição"
                      value={item.description}
                      onChange={(event) => patch({ description: event.target.value })}
                      maxLength={4000}
                      rows={3}
                    />
                    <TagInput
                      label="Tecnologias"
                      value={item.technologies}
                      onChange={(value) => patch({ technologies: value })}
                    />
                    <TagInput
                      label="Responsabilidades"
                      value={item.responsibilities}
                      onChange={(value) => patch({ responsibilities: value })}
                      maxItems={30}
                    />
                    <TagInput
                      label="Conquistas"
                      value={item.achievements}
                      onChange={(value) => patch({ achievements: value })}
                      maxItems={30}
                    />
                  </div>
                )}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle title="Formação, projetos e mais" />
            <div className="mt-4 space-y-6">
              <Repeatable
                label="Formação"
                items={form.content.education}
                onChange={(value) => setContent({ education: value })}
                create={() => ({
                  institution: '',
                  degree: '',
                  field: '',
                  startDate: '',
                  endDate: '',
                  status: 'concluido' as const,
                })}
                addLabel="Adicionar formação"
                emptyLabel="Nenhuma formação."
                render={(item, patch) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Instituição"
                      value={item.institution ?? ''}
                      onChange={(event) => patch({ institution: event.target.value })}
                      maxLength={160}
                    />
                    <TextInput
                      label="Curso"
                      value={item.degree}
                      onChange={(event) => patch({ degree: event.target.value })}
                      maxLength={160}
                    />
                    <TextInput
                      label="Área"
                      value={item.field}
                      onChange={(event) => patch({ field: event.target.value })}
                      maxLength={160}
                    />
                    <SelectInput
                      label="Situação"
                      value={item.status}
                      onChange={(event) => patch({ status: event.target.value as typeof item.status })}
                      options={educationStatusOptions}
                    />
                  </div>
                )}
              />

              <Repeatable
                label="Projetos"
                items={form.content.projects}
                onChange={(value) => setContent({ projects: value })}
                create={() => ({ name: '', description: '', technologies: [], url: '', githubUrl: '', outcomes: [] })}
                addLabel="Adicionar projeto"
                emptyLabel="Nenhum projeto."
                render={(item, patch) => (
                  <div className="space-y-3">
                    <TextInput
                      label="Nome"
                      value={item.name}
                      onChange={(event) => patch({ name: event.target.value })}
                      maxLength={160}
                    />
                    <TextArea
                      label="Descrição"
                      value={item.description}
                      onChange={(event) => patch({ description: event.target.value })}
                      maxLength={3000}
                      rows={2}
                    />
                    <TagInput
                      label="Tecnologias"
                      value={item.technologies}
                      onChange={(value) => patch({ technologies: value })}
                    />
                  </div>
                )}
              />

              <Repeatable
                label="Certificações"
                items={form.content.certifications}
                onChange={(value) => setContent({ certifications: value })}
                create={() => ({ name: '', issuer: '', year: '', url: '' })}
                addLabel="Adicionar certificação"
                emptyLabel="Nenhuma certificação."
                max={60}
                render={(item, patch) => (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextInput
                      label="Nome"
                      value={item.name ?? ''}
                      onChange={(event) => patch({ name: event.target.value })}
                      maxLength={160}
                    />
                    <TextInput
                      label="Emissor"
                      value={item.issuer}
                      onChange={(event) => patch({ issuer: event.target.value })}
                      maxLength={160}
                    />
                    <TextInput
                      label="Ano"
                      value={item.year}
                      onChange={(event) => patch({ year: event.target.value })}
                      maxLength={10}
                    />
                  </div>
                )}
              />

              <Repeatable
                label="Idiomas"
                items={form.content.languages}
                onChange={(value) => setContent({ languages: value })}
                create={() => ({ name: '', level: 'intermediario' as const })}
                addLabel="Adicionar idioma"
                emptyLabel="Nenhum idioma."
                max={20}
                render={(item, patch) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Idioma"
                      value={item.name ?? ''}
                      onChange={(event) => patch({ name: event.target.value })}
                      maxLength={60}
                    />
                    <SelectInput
                      label="Nível"
                      value={item.level}
                      onChange={(event) => patch({ level: event.target.value as typeof item.level })}
                      options={languageLevelOptions}
                    />
                  </div>
                )}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'versoes' && id && <VersionsTab resumeId={id} />}

      {update.error && (
        <div className="mt-4">
          <InlineError error={update.error} />
        </div>
      )}

      {tab !== 'versoes' && (
        <div className="safe-bottom sticky bottom-16 z-10 -mx-4 mt-5 border-t border-line bg-base/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</p>
            <Button variant="primary" icon={<Save />} onClick={save} loading={update.isPending} disabled={!dirty}>
              Salvar currículo
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function VersionsTab({ resumeId }: { resumeId: string }) {
  const { data: versions, isPending, error, refetch } = useResumeVersions(resumeId);
  const remove = useDeleteResumeVersion(resumeId);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <ListSkeleton rows={2} />;

  return (
    <>
      {dialog}
      <Card>
        <SectionTitle
          title="Versões adaptadas"
          description="Geradas ao adaptar este currículo para vagas específicas (§24)."
        />
        <div className="mt-4">
          {!versions || versions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <History className="size-5 text-ink-faint" aria-hidden />
              <p className="text-sm text-ink">Nenhuma versão adaptada ainda</p>
              <p className="max-w-sm text-xs text-ink-muted">
                Abra uma vaga analisada e use “Adaptar currículo” para gerar uma versão sob medida.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {versions.map((version) => (
                <li key={version.id} className="flex items-start gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{version.label || 'Versão adaptada'}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(version.createdAt)}
                      {version.provider ? ` · ${version.provider}` : ''}
                    </p>
                    {version.keywordsAdded.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {version.keywordsAdded.slice(0, 8).map((keyword) => (
                          <Badge key={keyword} tone="accent">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      onClick={() => {
                        setPreviewTitle(version.label || 'Versão adaptada');
                        setPreview(renderResumeText(version.content));
                      }}
                    >
                      Ver
                    </Button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Excluir versão?',
                          description: 'A versão adaptada será removida. O currículo original não muda.',
                          confirmLabel: 'Excluir',
                        });
                        if (ok) remove.mutate(version.id, { onSuccess: () => toast.success('Versão excluída') });
                      }}
                      className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                      aria-label="Excluir versão"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={previewTitle}
        size="lg"
        footer={
          <>
            <Button onClick={() => setPreview(null)}>Fechar</Button>
            <Button
              variant="primary"
              icon={<Copy />}
              onClick={async () => {
                if (preview && (await copyToClipboard(preview))) toast.success('Versão copiada');
              }}
            >
              Copiar texto
            </Button>
          </>
        }
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink-muted">
          {preview}
        </pre>
      </Modal>
    </>
  );
}
