/**
 * Coleções do perfil: experiências, projetos e skills.
 * Cada uma segue o mesmo padrão — lista + modal de edição + confirmação para excluir.
 */
import { useState } from 'react';
import { Briefcase, FolderGit2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Experience, ExperienceInput, Project, ProjectInput, Skill, SkillInput } from '@shared/schemas/profile';
import { Button } from '@/components/ui/Button';
import { Badge, Card, SectionTitle } from '@/components/ui/Primitives';
import { EmptyState, InlineError } from '@/components/ui/States';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { Checkbox } from '@/components/ui/Field';
import { formatPeriod } from '@/lib/format';
import { skillCategoryOptions } from '@/lib/options';
import { useToast } from '@/providers/ToastProvider';
import {
  useCreateExperience,
  useCreateProject,
  useCreateSkill,
  useDeleteExperience,
  useDeleteProject,
  useDeleteSkill,
  useUpdateExperience,
  useUpdateProject,
  useUpdateSkill,
} from '@/hooks/queries';
import { SKILL_CATEGORY_LABEL, type SkillCategory } from '@shared/schemas/profile';

// =============================================================================
// Experiências
// =============================================================================
const emptyExperience = (): ExperienceInput => ({
  company: '',
  role: '',
  description: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  technologies: [],
  achievements: [],
  responsibilities: [],
  sortOrder: 0,
});

function toExperienceInput(experience: Experience): ExperienceInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = experience;
  return rest;
}

export function ExperienceSection({ experiences }: { experiences: Experience[] }) {
  const [editing, setEditing] = useState<{ id: string | null; input: ExperienceInput } | null>(null);
  const create = useCreateExperience();
  const update = useUpdateExperience();
  const remove = useDeleteExperience();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const busy = create.isPending || update.isPending;

  const save = () => {
    if (!editing) return;
    if (!editing.input.company.trim() || !editing.input.role.trim()) {
      toast.error('Empresa e cargo são obrigatórios');
      return;
    }

    const onSuccess = () => {
      setEditing(null);
      toast.success('Experiência salva');
    };
    const onError = (error: unknown) =>
      toast.error('Não foi possível salvar', error instanceof Error ? error.message : undefined);

    if (editing.id) update.mutate({ id: editing.id, input: editing.input }, { onSuccess, onError });
    else create.mutate(editing.input, { onSuccess, onError });
  };

  const handleDelete = async (experience: Experience) => {
    const ok = await confirm({
      title: 'Excluir experiência?',
      description: `"${experience.role} — ${experience.company}" será removida do perfil. Currículos já salvos não são alterados.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    remove.mutate(experience.id, {
      onSuccess: () => toast.success('Experiência excluída'),
      onError: (error) => toast.error('Não foi possível excluir', error instanceof Error ? error.message : undefined),
    });
  };

  const patch = (value: Partial<ExperienceInput>) =>
    setEditing((current) => (current ? { ...current, input: { ...current.input, ...value } } : current));

  return (
    <Card>
      {dialog}
      <SectionTitle
        title="Experiências"
        description="Histórico profissional real — a IA nunca cria experiências novas."
        action={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => setEditing({ id: null, input: { ...emptyExperience(), sortOrder: experiences.length } })}
          >
            Adicionar
          </Button>
        }
      />

      <div className="mt-4">
        {experiences.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title="Nenhuma experiência cadastrada"
            description="Adicione seu histórico para que o matching e os currículos tenham base real."
          />
        ) : (
          <ul className="divide-y divide-line">
            {experiences.map((experience) => (
              <li key={experience.id} className="flex items-start gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{experience.role}</p>
                  <p className="text-xs text-ink-muted">
                    {experience.company} · {formatPeriod(experience.startDate, experience.endDate, experience.isCurrent)}
                  </p>
                  {experience.technologies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {experience.technologies.slice(0, 8).map((tech) => (
                        <Badge key={tech}>{tech}</Badge>
                      ))}
                      {experience.technologies.length > 8 && (
                        <Badge>+{experience.technologies.length - 8}</Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ id: experience.id, input: toExperienceInput(experience) })}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-elevated hover:text-ink"
                    aria-label={`Editar ${experience.role}`}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(experience)}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                    aria-label={`Excluir ${experience.role}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar experiência' : 'Nova experiência'}
        size="md"
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Empresa"
                required
                value={editing.input.company}
                onChange={(event) => patch({ company: event.target.value })}
                maxLength={160}
              />
              <TextInput
                label="Cargo"
                required
                value={editing.input.role}
                onChange={(event) => patch({ role: event.target.value })}
                maxLength={160}
              />
              <TextInput
                label="Início"
                value={editing.input.startDate ?? ''}
                onChange={(event) => patch({ startDate: event.target.value })}
                placeholder="AAAA-MM"
                maxLength={7}
                hint="Formato AAAA-MM"
              />
              <TextInput
                label="Fim"
                value={editing.input.endDate ?? ''}
                onChange={(event) => patch({ endDate: event.target.value })}
                placeholder="AAAA-MM"
                maxLength={7}
                disabled={editing.input.isCurrent}
              />
            </div>

            <Checkbox
              label="Trabalho aqui atualmente"
              checked={editing.input.isCurrent}
              onChange={(event) => patch({ isCurrent: event.target.checked, endDate: '' })}
            />

            <TextArea
              label="Descrição"
              value={editing.input.description}
              onChange={(event) => patch({ description: event.target.value })}
              maxLength={4000}
              rows={4}
            />

            <TagInput
              label="Tecnologias"
              value={editing.input.technologies}
              onChange={(value) => patch({ technologies: value })}
              placeholder="React, TypeScript…"
            />
            <TagInput
              label="Responsabilidades"
              value={editing.input.responsibilities}
              onChange={(value) => patch({ responsibilities: value })}
              placeholder="Uma responsabilidade por item"
              maxItems={30}
            />
            <TagInput
              label="Conquistas"
              value={editing.input.achievements}
              onChange={(value) => patch({ achievements: value })}
              placeholder="Resultados concretos que você entregou"
              maxItems={30}
            />
          </div>
        )}
      </Modal>

      {(create.error || update.error || remove.error) && (
        <div className="mt-3">
          <InlineError error={create.error ?? update.error ?? remove.error} />
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Projetos
// =============================================================================
const emptyProject = (): ProjectInput => ({
  name: '',
  description: '',
  technologies: [],
  url: '',
  githubUrl: '',
  outcomes: [],
  startDate: '',
  endDate: '',
  sortOrder: 0,
});

function toProjectInput(project: Project): ProjectInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = project;
  return rest;
}

export function ProjectSection({ projects }: { projects: Project[] }) {
  const [editing, setEditing] = useState<{ id: string | null; input: ProjectInput } | null>(null);
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const busy = create.isPending || update.isPending;

  const save = () => {
    if (!editing) return;
    if (!editing.input.name.trim()) {
      toast.error('O nome do projeto é obrigatório');
      return;
    }
    const onSuccess = () => {
      setEditing(null);
      toast.success('Projeto salvo');
    };
    const onError = (error: unknown) =>
      toast.error('Não foi possível salvar', error instanceof Error ? error.message : undefined);

    if (editing.id) update.mutate({ id: editing.id, input: editing.input }, { onSuccess, onError });
    else create.mutate(editing.input, { onSuccess, onError });
  };

  const handleDelete = async (project: Project) => {
    const ok = await confirm({ title: 'Excluir projeto?', description: `"${project.name}" será removido.`, confirmLabel: 'Excluir' });
    if (!ok) return;
    remove.mutate(project.id, { onSuccess: () => toast.success('Projeto excluído') });
  };

  const patch = (value: Partial<ProjectInput>) =>
    setEditing((current) => (current ? { ...current, input: { ...current.input, ...value } } : current));

  return (
    <Card>
      {dialog}
      <SectionTitle
        title="Projetos"
        description="Trabalhos próprios, open source ou acadêmicos."
        action={
          <Button size="sm" icon={<Plus />} onClick={() => setEditing({ id: null, input: emptyProject() })}>
            Adicionar
          </Button>
        }
      />

      <div className="mt-4">
        {projects.length === 0 ? (
          <EmptyState icon={<FolderGit2 />} title="Nenhum projeto cadastrado" />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((project) => (
              <li key={project.id} className="flex items-start gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{project.name}</p>
                  {project.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{project.description}</p>
                  )}
                  {project.technologies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {project.technologies.slice(0, 6).map((tech) => (
                        <Badge key={tech}>{tech}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ id: project.id, input: toProjectInput(project) })}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-elevated hover:text-ink"
                    aria-label={`Editar ${project.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(project)}
                    className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                    aria-label={`Excluir ${project.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar projeto' : 'Novo projeto'}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <TextInput
              label="Nome"
              required
              value={editing.input.name}
              onChange={(event) => patch({ name: event.target.value })}
              maxLength={160}
            />
            <TextArea
              label="Descrição"
              value={editing.input.description}
              onChange={(event) => patch({ description: event.target.value })}
              maxLength={3000}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="URL"
                type="url"
                value={editing.input.url}
                onChange={(event) => patch({ url: event.target.value })}
                placeholder="https://…"
              />
              <TextInput
                label="Repositório"
                type="url"
                value={editing.input.githubUrl}
                onChange={(event) => patch({ githubUrl: event.target.value })}
                placeholder="https://github.com/…"
              />
              <TextInput
                label="Início"
                value={editing.input.startDate ?? ''}
                onChange={(event) => patch({ startDate: event.target.value })}
                placeholder="AAAA-MM"
                maxLength={7}
              />
              <TextInput
                label="Fim"
                value={editing.input.endDate ?? ''}
                onChange={(event) => patch({ endDate: event.target.value })}
                placeholder="AAAA-MM"
                maxLength={7}
              />
            </div>
            <TagInput
              label="Tecnologias"
              value={editing.input.technologies}
              onChange={(value) => patch({ technologies: value })}
            />
            <TagInput
              label="Resultados"
              value={editing.input.outcomes}
              onChange={(value) => patch({ outcomes: value })}
              placeholder="O que o projeto entregou"
              maxItems={20}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}

// =============================================================================
// Skills
// =============================================================================
export function SkillSection({ skills }: { skills: Skill[] }) {
  const [draft, setDraft] = useState<SkillInput>({ name: '', category: 'outro', level: 3, yearsExperience: null });
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const toast = useToast();

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setDraft({ name: '', category: draft.category, level: 3, yearsExperience: null });
        toast.success('Skill adicionada');
      },
      onError: (error) =>
        toast.error('Não foi possível adicionar', error instanceof Error ? error.message : undefined),
    });
  };

  const grouped = skills.reduce<Record<string, Skill[]>>((accumulator, skill) => {
    const list = accumulator[skill.category] ?? [];
    list.push(skill);
    accumulator[skill.category] = list;
    return accumulator;
  }, {});

  return (
    <Card>
      <SectionTitle title="Skills" description="Competências usadas no cálculo de aderência às vagas." />

      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <TextInput
          label="Nova skill"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          maxLength={80}
          placeholder="Ex.: TypeScript"
        />
        <SelectInput
          label="Categoria"
          value={draft.category}
          onChange={(event) => setDraft({ ...draft, category: event.target.value as SkillCategory })}
          options={skillCategoryOptions}
        />
        <SelectInput
          label="Nível"
          value={String(draft.level)}
          onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}
          options={[1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: `${level}/5` }))}
        />
        <Button type="submit" variant="primary" icon={<Plus />} loading={create.isPending}>
          Adicionar
        </Button>
      </form>

      <div className="mt-5 space-y-4">
        {skills.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="Nenhuma skill cadastrada" />
        ) : (
          Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-medium text-ink-muted">
                {SKILL_CATEGORY_LABEL[category as SkillCategory] ?? category}
              </p>
              <ul className="flex flex-wrap gap-2">
                {list.map((skill) => (
                  <li
                    key={skill.id}
                    className="group flex items-center gap-2 rounded-lg border border-line bg-elevated py-1.5 pl-3 pr-1.5"
                  >
                    <span className="text-xs text-ink">{skill.name}</span>
                    <select
                      value={skill.level}
                      onChange={(event) =>
                        update.mutate({
                          id: skill.id,
                          input: {
                            name: skill.name,
                            category: skill.category,
                            level: Number(event.target.value),
                            yearsExperience: skill.yearsExperience ?? null,
                          },
                        })
                      }
                      aria-label={`Nível de ${skill.name}`}
                      className="rounded bg-transparent text-[11px] text-ink-faint focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          {level}/5
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove.mutate(skill.id)}
                      className="rounded p-1 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                      aria-label={`Remover ${skill.name}`}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
