import { useRef, useState } from 'react';
import { Cpu, Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Card, PageHeader, SectionTitle } from '@/components/ui/Primitives';
import { ErrorState, InlineError, ListSkeleton } from '@/components/ui/States';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { DiscoverySettings } from '@/components/discovery/DiscoverySettings';
import { toneOptions } from '@/lib/options';
import { downloadJson } from '@/lib/clipboard';
import { formatDateTime } from '@/lib/format';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useAIStatus, useSettings, useUpdateSettings, useUsage, type UserSettings } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';

const PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Automático (recomendado)' },
  { value: 'groq', label: 'Somente Groq' },
  { value: 'nvidia', label: 'Somente NVIDIA NIM' },
];

interface ImportSummary {
  profile: boolean;
  experiences: number;
  projects: number;
  skills: number;
  resumes: number;
  jobs: number;
  resumeVersions: number;
  applications: number;
  applicationAnswers: number;
  skipped: string[];
}

export function SettingsPage() {
  const { user } = useAuth();
  const { data: settings, isPending, error, refetch } = useSettings();
  const { data: status } = useAIStatus();
  const { data: usage } = useUsage();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const toast = useToast();

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'erase' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState('');
  const [tab, setTab] = useState<'geral' | 'descoberta'>('geral');

  const patch = (changes: Partial<UserSettings>) => {
    if (!settings) return;
    updateSettings.mutate(
      { ...settings, ...changes },
      { onError: (caught) => toast.error('Não foi possível salvar', errorMessage(caught)) },
    );
  };

  const exportData = async () => {
    setBusy('export');
    setActionError(null);
    try {
      const data = await api.get<unknown>('export');
      downloadJson(data, `jobpilot-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Backup exportado', 'O arquivo não contém chaves nem tokens.');
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const importData = async (file: File) => {
    setBusy('import');
    setActionError(null);
    setImportResult(null);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 12 MB).');
      const text = await file.text();
      const payload: unknown = JSON.parse(text);
      const summary = await api.post<ImportSummary>('import', payload);
      setImportResult(summary);
      await queryClient.invalidateQueries();
      toast.success('Importação concluída');
    } catch (caught) {
      setActionError(
        caught instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : errorMessage(caught),
      );
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const eraseData = async () => {
    setBusy('erase');
    setActionError(null);
    try {
      await api.post('account/erase', { confirm: eraseConfirm });
      await queryClient.invalidateQueries();
      setEraseOpen(false);
      setEraseConfirm('');
      toast.success('Dados apagados');
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending || !settings) return <ListSkeleton rows={3} />;

  return (
    <>
      <PageHeader title="Configurações" description="Inteligência artificial, descoberta, privacidade e seus dados." />

      <Tabs<'geral' | 'descoberta'>
        value={tab}
        onChange={setTab}
        className="mb-5"
        items={[
          { value: 'geral', label: 'Geral' },
          { value: 'descoberta', label: 'Descoberta' },
        ]}
      />

      {tab === 'descoberta' && <DiscoverySettings />}

      <div className={tab === 'geral' ? 'space-y-5' : 'hidden'}>
        <Card>
          <SectionTitle title="Conta" />
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">E-mail</dt>
              <dd className="truncate text-ink">{user?.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Preferências atualizadas</dt>
              <dd className="text-ink">{formatDateTime(settings.updatedAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <SectionTitle
            title="Inteligência artificial"
            description="O servidor decide o provider; aqui você restringe ou libera o comportamento."
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Provider preferido"
              value={settings.aiProviderPreference}
              onChange={(event) =>
                patch({ aiProviderPreference: event.target.value as UserSettings['aiProviderPreference'] })
              }
              options={PROVIDER_OPTIONS}
              hint="Se o servidor fixar um provider, esta escolha é ignorada."
            />
            <SelectInput
              label="Tom dos textos gerados"
              value={settings.tone}
              onChange={(event) => patch({ tone: event.target.value as UserSettings['tone'] })}
              options={toneOptions}
            />
          </div>

          <div className="mt-4">
            <Checkbox
              label="Permitir fallback automático em operações pesadas"
              description="Se o provider principal falhar durante uma análise ou adaptação, tenta o secundário automaticamente."
              checked={settings.allowFallback}
              onChange={(event) => patch({ allowFallback: event.target.checked })}
            />
          </div>

          {status && (
            <div className="mt-5 space-y-3 rounded-lg border border-line bg-elevated p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-ink">
                <Cpu className="size-3.5 text-accent" aria-hidden />
                Estado dos providers
              </p>
              <ul className="space-y-2">
                {status.providers.map((provider) => (
                  <li key={provider.name} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-ink-muted">
                      {provider.name} · <span className="font-mono text-[11px]">{provider.model}</span>
                    </span>
                    <Badge tone={provider.configured ? 'success' : 'neutral'}>
                      {provider.configured ? 'configurado' : 'não configurado'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-faint">
                Preferência do servidor: {status.serverPreference} · fallback{' '}
                {status.fallbackEnabled ? 'habilitado' : 'desabilitado'}. As chaves ficam apenas no servidor.
              </p>
            </div>
          )}

          {usage && (
            <div className="mt-4 rounded-lg border border-line bg-elevated p-3">
              <p className="text-xs font-medium text-ink">Uso nas últimas 24 horas</p>
              <p className="mt-1 text-xs text-ink-muted">
                {usage.total} operação(ões) · {usage.inputTokens.toLocaleString('pt-BR')} tokens de entrada ·{' '}
                {usage.outputTokens.toLocaleString('pt-BR')} de saída
              </p>
              {usage.byOperation.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {usage.byOperation.map((item) => (
                    <li key={item.operation}>
                      <Badge>
                        {item.operation}: {item.count}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Privacidade" description="Você controla o que sai da aplicação." />
          <div className="mt-4 space-y-4">
            <Checkbox
              label="Autorizar envio de dados ao provedor de IA"
              description="Sem esta autorização, nenhuma operação de IA é executada. Só é enviado o conteúdo necessário para a tarefa em questão."
              checked={settings.aiConsent}
              onChange={(event) => patch({ aiConsent: event.target.checked })}
            />

            <div className="flex items-start gap-2 rounded-lg border border-line bg-elevated p-3 text-xs text-ink-muted">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
              <div className="space-y-1">
                <p>Esta aplicação não usa analytics, cookies de rastreamento nem serviços de terceiros além de Supabase e do provedor de IA configurado.</p>
                <p>Seus dados ficam no seu projeto Supabase, isolados por Row Level Security.</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Seus dados"
            description="Exporte um backup completo ou restaure em outra instalação."
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Download />} onClick={() => void exportData()} loading={busy === 'export'}>
              Exportar JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importData(file);
              }}
            />
            <Button icon={<Upload />} onClick={() => fileRef.current?.click()} loading={busy === 'import'}>
              Importar JSON
            </Button>
          </div>

          <p className="mt-3 text-xs text-ink-faint">
            A importação é aditiva: nada é apagado. Análises de vaga não são importadas por serem dados derivados —
            basta reanalisar a vaga.
          </p>

          {importResult && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success-soft p-3 text-xs text-success">
              <p className="font-medium">Importado com sucesso</p>
              <p className="mt-1">
                {importResult.experiences} experiência(s) · {importResult.projects} projeto(s) ·{' '}
                {importResult.skills} skill(s) · {importResult.resumes} currículo(s) · {importResult.jobs} vaga(s) ·{' '}
                {importResult.applications} candidatura(s)
              </p>
              {importResult.skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-success/80">
                  {importResult.skipped.slice(0, 6).map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {actionError && (
            <div className="mt-4">
              <InlineError error={new Error(actionError)} />
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Zona de risco" description="Ações irreversíveis." />
          <div className="mt-4">
            <Button variant="danger" icon={<Trash2 />} onClick={() => setEraseOpen(true)}>
              Apagar todos os meus dados
            </Button>
            <p className="mt-2 text-xs text-ink-faint">
              Remove perfil, currículos, arquivos, vagas, análises e candidaturas. A conta de login continua
              existindo — exclua-a pelo painel do Supabase se desejar.
            </p>
          </div>
        </Card>
      </div>

      <Modal
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        title="Apagar todos os dados"
        size="sm"
        footer={
          <>
            <Button onClick={() => setEraseOpen(false)} disabled={busy === 'erase'}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => void eraseData()}
              loading={busy === 'erase'}
              disabled={eraseConfirm !== 'APAGAR'}
            >
              Apagar definitivamente
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Tudo será removido: perfil, experiências, projetos, skills, currículos, arquivos enviados, vagas,
            análises, candidaturas e respostas. Não há como desfazer.
          </p>
          <p className="text-sm text-ink-muted">
            Exporte um backup antes, se quiser guardar o histórico.
          </p>
          <TextInput
            label='Digite "APAGAR" para confirmar'
            value={eraseConfirm}
            onChange={(event) => setEraseConfirm(event.target.value)}
            autoComplete="off"
          />
          {actionError && <InlineError error={new Error(actionError)} />}
        </div>
      </Modal>
    </>
  );
}
