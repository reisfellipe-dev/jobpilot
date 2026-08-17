/** Preferências de descoberta + gestão de fontes (§6, §10, §11, §22). */
import { Card, SectionTitle } from '@/components/ui/Primitives';
import { Checkbox, SelectInput, TagInput } from '@/components/ui/Field';
import { InlineError, ListSkeleton } from '@/components/ui/States';
import { SourcesPanel } from './SourcesPanel';
import { useSettings, useUpdateSettings, type UserSettings } from '@/hooks/queries';
import { useToast } from '@/providers/ToastProvider';
import { errorMessage } from '@/lib/api';

export function DiscoverySettings() {
  const { data: settings, isPending, error } = useSettings();
  const updateSettings = useUpdateSettings();
  const toast = useToast();

  const patch = (changes: Partial<UserSettings>) => {
    if (!settings) return;
    updateSettings.mutate(
      { ...settings, ...changes },
      { onError: (caught) => toast.error('Não foi possível salvar', errorMessage(caught)) },
    );
  };

  if (error) return <InlineError error={error} />;
  if (isPending || !settings) return <ListSkeleton rows={2} />;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle
          title="Como as vagas são buscadas"
          description="A estratégia sai do seu perfil. Você pode assumir o controle quando quiser."
        />

        <div className="mt-4 space-y-4">
          <TagInput
            label="Termos de busca personalizados"
            value={settings.discoveryKeywords}
            onChange={(value) => patch({ discoveryKeywords: value })}
            placeholder="Ex.: Engenheiro de Dados"
            maxItems={20}
            hint="Se preenchido, estes termos têm prioridade sobre os cargos do perfil."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Aderência mínima para destacar"
              value={String(settings.discoveryMinScore)}
              onChange={(event) => patch({ discoveryMinScore: Number(event.target.value) })}
              options={[
                { value: '0', label: 'Mostrar tudo' },
                { value: '55', label: '55% ou mais' },
                { value: '70', label: '70% ou mais' },
                { value: '85', label: '85% ou mais' },
              ]}
            />
            <SelectInput
              label="Idade máxima da vaga"
              value={String(settings.discoveryMaxAgeDays)}
              onChange={(event) => patch({ discoveryMaxAgeDays: Number(event.target.value) })}
              options={[
                { value: '7', label: 'Últimos 7 dias' },
                { value: '15', label: 'Últimos 15 dias' },
                { value: '30', label: 'Últimos 30 dias' },
                { value: '90', label: 'Últimos 90 dias' },
              ]}
            />
          </div>

          <Checkbox
            label="Buscar automaticamente ao abrir o app"
            description="Se a última busca tiver mais de 12 horas, o JobPilot consulta as fontes em segundo plano quando você abre o JobPilot. Desligue para buscar apenas no botão."
            checked={settings.autoDiscovery}
            onChange={(event) => patch({ autoDiscovery: event.target.checked })}
          />

          <p className="rounded-lg border border-line bg-elevated p-3 text-[11px] text-ink-muted">
            <strong className="text-ink">Por que não há um agendamento no servidor:</strong> um cron rodando sem
            você presente precisaria de uma credencial administrativa capaz de ler os dados de qualquer usuário,
            contornando a Row Level Security. O JobPilot não usa esse tipo de credencial em nenhum lugar, então a
            sincronização automática acontece com você — ao abrir o app.
          </p>
        </div>
      </Card>

      <SourcesPanel />
    </div>
  );
}
