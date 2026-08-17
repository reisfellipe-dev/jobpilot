/** Campos de vaga reutilizados no cadastro e na edição. */
import type { Seniority, WorkMode } from '@shared/constants';
import type { JobInput } from '@shared/schemas/job';
import { SelectInput, TagInput, TextArea, TextInput } from '@/components/ui/Field';
import { jobStatusOptions, seniorityOptions, workModeOptions } from '@/lib/options';

export function JobFormFields({
  value,
  onChange,
  showStatus = false,
}: {
  value: JobInput;
  onChange: (value: JobInput) => void;
  showStatus?: boolean;
}) {
  const set = <K extends keyof JobInput>(key: K, next: JobInput[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Cargo"
          required
          value={value.title}
          onChange={(event) => set('title', event.target.value)}
          maxLength={180}
        />
        <TextInput
          label="Empresa"
          value={value.company}
          onChange={(event) => set('company', event.target.value)}
          maxLength={160}
        />
        <TextInput
          label="Local"
          value={value.location}
          onChange={(event) => set('location', event.target.value)}
          maxLength={160}
        />
        <TextInput
          label="Faixa salarial"
          value={value.salaryRange}
          onChange={(event) => set('salaryRange', event.target.value)}
          maxLength={120}
          placeholder="Se informada na vaga"
        />
        <SelectInput
          label="Modalidade"
          value={value.workMode ?? ''}
          onChange={(event) => set('workMode', (event.target.value || null) as WorkMode | null)}
          options={workModeOptions}
          placeholder="Não informada"
        />
        <SelectInput
          label="Senioridade"
          value={value.seniority ?? ''}
          onChange={(event) => set('seniority', (event.target.value || null) as Seniority | null)}
          options={seniorityOptions}
          placeholder="Não informada"
        />
        {showStatus && (
          <SelectInput
            label="Status"
            value={value.status}
            onChange={(event) => set('status', event.target.value as JobInput['status'])}
            options={jobStatusOptions}
          />
        )}
      </div>

      <TextInput
        label="Link da vaga"
        type="url"
        value={value.url}
        onChange={(event) => set('url', event.target.value)}
        maxLength={500}
        placeholder="https://…"
      />

      <TagInput
        label="Requisitos obrigatórios"
        value={value.requirements}
        onChange={(next) => set('requirements', next)}
        maxItems={60}
        hint="Um requisito por item — é assim que o score é calculado."
      />
      <TagInput
        label="Diferenciais"
        value={value.niceToHave}
        onChange={(next) => set('niceToHave', next)}
        maxItems={40}
      />
      <TagInput
        label="Tecnologias"
        value={value.technologies}
        onChange={(next) => set('technologies', next)}
        maxItems={80}
      />
      <TagInput label="Benefícios" value={value.benefits} onChange={(next) => set('benefits', next)} maxItems={40} />

      <TextArea
        label="Descrição original"
        value={value.description}
        onChange={(event) => set('description', event.target.value)}
        rows={6}
        maxLength={40_000}
        hint="Mantida na íntegra para a análise e para consulta futura."
      />
    </div>
  );
}
