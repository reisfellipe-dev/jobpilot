import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { Profile } from '@shared/schemas/profile';
import type { Seniority, WorkMode } from '@shared/constants';
import { WORK_MODES, WORK_MODE_LABEL } from '@shared/constants';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Primitives';
import { Checkbox, SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { Repeatable } from '@/components/ui/Repeatable';
import { InlineError } from '@/components/ui/States';
import { educationStatusOptions, languageLevelOptions, seniorityOptions } from '@/lib/options';
import { useToast } from '@/providers/ToastProvider';
import { useUpdateProfile } from '@/hooks/queries';
import { AvatarUploader } from './AvatarUploader';

type FormState = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

function toFormState(profile: Profile): FormState {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = profile;
  return rest;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [dirty, setDirty] = useState(false);
  const update = useUpdateProfile();
  const toast = useToast();

  // Recarrega o formulário quando o registro do perfil muda de fato.
  //
  // BUG CORRIGIDO: antes este efeito dependia de `profile` (o objeto inteiro),
  // não do seu conteúdo. Toda vez que o React Query re-executava a query em
  // segundo plano — reconexão de rede (comum em dados móveis), o app voltando
  // do plano de fundo, ou qualquer invalidateQueries em outra aba — ele
  // devolvia um NOVO objeto `profile` mesmo com os mesmos dados. Isso disparava
  // o efeito, que sobrescrevia TODO o `form` com os dados antigos do servidor
  // e resetava `dirty`, apagando o que a pessoa estava digitando no meio da
  // digitação. Por isso o sintoma aparecia tanto nos campos simples quanto
  // dentro de Formação/Certificações/Idiomas: o `form` inteiro era substituído.
  //
  // Agora o efeito só reage a um perfil REALMENTE diferente (id ou
  // updatedAt mudou) e, além disso, nunca sobrescreve enquanto há alterações
  // não salvas (`dirty`) — evitando perder texto mesmo se o servidor mandar
  // um registro novo enquanto a pessoa ainda está editando.
  useEffect(() => {
    if (dirty) return;
    setForm(toFormState(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, profile.updatedAt]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const toggleWorkMode = (mode: WorkMode, checked: boolean) => {
    set('workModes', checked ? [...form.workModes, mode] : form.workModes.filter((item) => item !== mode));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    update.mutate(form, {
      onSuccess: () => {
        setDirty(false);
        toast.success('Perfil salvo');
      },
      onError: (error) => toast.error('Não foi possível salvar', error instanceof Error ? error.message : undefined),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <AvatarUploader profile={profile} />
      </Card>

      <Card>
        <SectionTitle title="Identificação" description="Base de todos os currículos e textos gerados." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Nome completo"
            value={form.fullName}
            onChange={(event) => set('fullName', event.target.value)}
            maxLength={140}
            autoComplete="name"
          />
          <TextInput
            label="E-mail profissional"
            type="email"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            maxLength={200}
            autoComplete="email"
          />
          <TextInput
            label="Telefone"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            maxLength={40}
            autoComplete="tel"
            inputMode="tel"
          />
          <TextInput
            label="Localização"
            value={form.location}
            onChange={(event) => set('location', event.target.value)}
            maxLength={140}
            placeholder="Cidade, Estado"
          />
        </div>

        <div className="mt-4 space-y-4">
          <TextInput
            label="Headline"
            value={form.headline}
            onChange={(event) => set('headline', event.target.value)}
            maxLength={180}
            placeholder="Ex.: Desenvolvedora Front-end React | TypeScript"
            hint="Frase curta que resume seu posicionamento profissional."
          />
          <TextArea
            label="Resumo profissional"
            value={form.summary}
            onChange={(event) => set('summary', event.target.value)}
            maxLength={4000}
            rows={6}
            hint={`${form.summary.length}/4000 · Este texto é a base do resumo dos currículos.`}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Objetivo profissional" description="Orienta o matching e as adaptações de currículo." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Senioridade atual"
            value={form.seniority ?? ''}
            onChange={(event) => set('seniority', (event.target.value || null) as Seniority | null)}
            options={seniorityOptions}
            placeholder="Não definida"
          />
          <TextInput
            label="Localização desejada"
            value={form.desiredLocation}
            onChange={(event) => set('desiredLocation', event.target.value)}
            maxLength={140}
            placeholder="Ex.: Remoto no Brasil"
          />
        </div>

        <div className="mt-4">
          <TagInput
            label="Cargos desejados"
            value={form.desiredRoles}
            onChange={(value) => set('desiredRoles', value)}
            placeholder="Ex.: Desenvolvedor Front-end"
            maxItems={20}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-ink-muted">Modalidades aceitas</legend>
          <div className="flex flex-wrap gap-4">
            {WORK_MODES.map((mode) => (
              <Checkbox
                key={mode}
                label={WORK_MODE_LABEL[mode]}
                checked={form.workModes.includes(mode)}
                onChange={(event) => toggleWorkMode(mode, event.target.checked)}
              />
            ))}
          </div>
        </fieldset>
      </Card>

      <Card>
        <SectionTitle title="Formação" />
        <div className="mt-4">
          <Repeatable
            items={form.education}
            onChange={(value) => set('education', value)}
            create={() => ({
              institution: '',
              degree: '',
              field: '',
              startDate: '',
              endDate: '',
              status: 'concluido' as const,
            })}
            addLabel="Adicionar formação"
            emptyLabel="Nenhuma formação cadastrada."
            render={(item, patch) => (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Instituição"
                  value={item.institution}
                  onChange={(event) => patch({ institution: event.target.value })}
                  maxLength={160}
                />
                <TextInput
                  label="Curso / Grau"
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
                <TextInput
                  label="Início"
                  value={item.startDate ?? ''}
                  onChange={(event) => patch({ startDate: event.target.value })}
                  placeholder="AAAA-MM"
                  maxLength={7}
                />
                <TextInput
                  label="Conclusão"
                  value={item.endDate ?? ''}
                  onChange={(event) => patch({ endDate: event.target.value })}
                  placeholder="AAAA-MM"
                  maxLength={7}
                />
              </div>
            )}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Certificações, idiomas e links" />
        <div className="mt-4 space-y-6">
          <Repeatable
            label="Certificações"
            items={form.certifications}
            onChange={(value) => set('certifications', value)}
            create={() => ({ name: '', issuer: '', year: '', url: '' })}
            addLabel="Adicionar certificação"
            emptyLabel="Nenhuma certificação cadastrada."
            max={60}
            render={(item, patch) => (
              <div className="grid gap-3 sm:grid-cols-3">
                <TextInput
                  label="Nome"
                  value={item.name}
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
                  inputMode="numeric"
                />
              </div>
            )}
          />

          <Repeatable
            label="Idiomas"
            items={form.languages}
            onChange={(value) => set('languages', value)}
            create={() => ({ name: '', level: 'intermediario' as const })}
            addLabel="Adicionar idioma"
            emptyLabel="Nenhum idioma cadastrado."
            max={20}
            render={(item, patch) => (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Idioma"
                  value={item.name}
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

          <Repeatable
            label="Links"
            items={form.links}
            onChange={(value) => set('links', value)}
            create={() => ({ label: '', url: '' })}
            addLabel="Adicionar link"
            emptyLabel="Nenhum link cadastrado."
            max={20}
            render={(item, patch) => (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Rótulo"
                  value={item.label}
                  onChange={(event) => patch({ label: event.target.value })}
                  maxLength={40}
                  placeholder="LinkedIn"
                />
                <TextInput
                  label="URL"
                  type="url"
                  value={item.url}
                  onChange={(event) => patch({ url: event.target.value })}
                  maxLength={500}
                  placeholder="https://…"
                />
              </div>
            )}
          />
        </div>
      </Card>

      {update.error && <InlineError error={update.error} />}

      {/* Barra de ação fixa: salvar sempre alcançável no mobile. */}
      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 border-t border-line bg-base/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border lg:px-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
          </p>
          <Button type="submit" variant="primary" icon={<Save />} loading={update.isPending} disabled={!dirty}>
            Salvar perfil
          </Button>
        </div>
      </div>
    </form>
  );
}
