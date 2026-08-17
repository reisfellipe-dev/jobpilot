/**
 * Gestão de fontes de vagas (§1, §2, §26, §42).
 *
 * Duas decisões visíveis nesta tela:
 *  - fonte só é cadastrada depois de validada de verdade contra a API;
 *  - as plataformas SEM integração aparecem listadas, com o motivo — em vez de
 *    sumirem como se não existissem.
 */
import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Card, SectionTitle, type Tone } from '@/components/ui/Primitives';
import { InlineError, ListSkeleton } from '@/components/ui/States';
import { TextInput } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Modal';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import {
  useAddSource,
  useDeleteSource,
  useDetectSource,
  useSources,
  useSyncs,
  useToggleSource,
  type DetectionResponse,
} from '@/hooks/discovery';

const STATUS_TONE: Record<string, Tone> = {
  ok: 'success',
  erro: 'danger',
  parcial: 'warning',
  nunca: 'neutral',
  desabilitada: 'neutral',
};

export function SourcesPanel() {
  const { data, isPending, error, refetch } = useSources();
  const { data: syncs } = useSyncs();
  const detect = useDetectSource();
  const addSource = useAddSource();
  const toggleSource = useToggleSource();
  const deleteSource = useDeleteSource();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const [url, setUrl] = useState('');
  const [detection, setDetection] = useState<DetectionResponse | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const runDetection = () => {
    setDetectError(null);
    setDetection(null);
    detect.mutate(url.trim(), {
      onSuccess: (result) => setDetection(result),
      onError: (caught) => setDetectError(caught instanceof Error ? caught.message : 'Falha ao verificar a URL.'),
    });
  };

  const confirmAdd = () => {
    if (!detection || detection.status !== 'supported') return;
    addSource.mutate(
      {
        kind: detection.kind,
        identifier: detection.identifier,
        label: detection.label,
        sourceUrl: detection.sourceUrl,
      },
      {
        onSuccess: () => {
          toast.success('Fonte adicionada', `${detection.label} será consultada nas próximas buscas.`);
          setUrl('');
          setDetection(null);
        },
        onError: (caught) => setDetectError(caught instanceof Error ? caught.message : 'Não foi possível adicionar.'),
      },
    );
  };

  const removeSource = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Remover fonte?',
      description: `${label} deixa de ser consultada. As vagas já descobertas permanecem.`,
      confirmLabel: 'Remover',
    });
    if (ok) deleteSource.mutate(id, { onSuccess: () => toast.success('Fonte removida') });
  };

  if (error) return <InlineError error={error} />;
  if (isPending || !data) return <ListSkeleton rows={2} />;

  return (
    <div className="space-y-5">
      {dialog}

      {/* --- Adicionar empresa por URL --- */}
      <Card>
        <SectionTitle
          title="Adicionar empresa"
          description="Cole a URL da página de vagas. O JobPilot identifica o sistema por trás e valida antes de salvar."
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextInput
              label="URL da página de carreiras"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://boards.greenhouse.io/empresa"
              hint="Funciona com Greenhouse, Lever e Ashby."
            />
          </div>
          <Button
            variant="primary"
            icon={<Link2 />}
            onClick={runDetection}
            loading={detect.isPending}
            disabled={url.trim().length < 8}
          >
            Verificar
          </Button>
        </div>

        {detection?.status === 'supported' && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success-soft p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {detection.label} — integração via {detection.kind}, {detection.jobsFound} vaga(s) encontrada(s) no teste
            </p>
            {detection.jobsPreview.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-success/80">
                {detection.jobsPreview.map((job, index) => (
                  <li key={index}>• {job.title}</li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="primary" icon={<Plus />} className="mt-3" onClick={confirmAdd} loading={addSource.isPending}>
              Adicionar fonte
            </Button>
          </div>
        )}

        {detection?.status === 'unsupported' && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-warning">
              <Ban className="size-3.5" aria-hidden />
              {detection.info.label} não tem integração possível
            </p>
            <p className="mt-1 text-[11px] text-warning/90">{detection.info.reason}</p>
            <p className="mt-1.5 text-[11px] text-warning/80">
              Você ainda pode cadastrar vagas dessa plataforma manualmente em Vagas → Nova vaga.
            </p>
          </div>
        )}

        {detection?.status === 'unknown' && (
          <p className="mt-3 rounded-lg border border-line bg-elevated p-3 text-xs text-ink-muted">
            {detection.message}
          </p>
        )}

        {detectError && (
          <div className="mt-3">
            <InlineError error={new Error(detectError)} />
          </div>
        )}
      </Card>

      {/* --- Fontes conectadas --- */}
      <Card>
        <SectionTitle
          title="Fontes conectadas"
          description="Estado da última sincronização de cada fonte."
          action={
            <Button size="sm" icon={<RefreshCw />} onClick={() => void refetch()}>
              Atualizar
            </Button>
          }
        />

        <ul className="mt-4 divide-y divide-line">
          {data.sources.map((source) => (
            <li key={source.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{source.label}</span>
                  <Badge tone={STATUS_TONE[source.lastStatus] ?? 'neutral'}>
                    {source.lastStatus === 'nunca' ? 'nunca sincronizada' : source.lastStatus}
                  </Badge>
                  {!source.enabled && <Badge>desativada</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {source.kind}
                  {source.identifier ? ` · ${source.identifier}` : ''}
                  {source.lastSyncAt ? ` · ${formatRelative(source.lastSyncAt)}` : ''}
                  {source.lastDurationMs > 0 ? ` · ${(source.lastDurationMs / 1000).toFixed(1)}s` : ''}
                </p>
                {source.lastError && (
                  <p className="mt-1 flex items-start gap-1.5 text-[11px] text-danger">
                    <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
                    {source.lastError}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleSource.mutate({ id: source.id, enabled: !source.enabled })}
                  className="rounded-md px-2 py-1.5 text-[11px] text-ink-muted transition hover:bg-elevated hover:text-ink"
                >
                  {source.enabled ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSource(source.id, source.label)}
                  className="rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remover ${source.label}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {data.available.some((item) => item.attribution) && (
          <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-faint">
            Algumas fontes exigem atribuição nos termos de uso. O JobPilot exibe o crédito com link na tela
            Descobrir sempre que usa vagas dessas fontes.
          </p>
        )}
      </Card>

      {/* --- Transparência sobre o que não é suportado (§42) --- */}
      <Card>
        <SectionTitle
          title="Plataformas sem integração"
          description="O que o JobPilot não consegue automatizar — e por quê."
        />
        <ul className="mt-4 space-y-2.5">
          {data.unsupported.map((item) => (
            <li key={item.kind} className="flex items-start gap-2.5">
              <Ban className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-hidden />
              <div>
                <p className="text-xs font-medium text-ink">{item.label}</p>
                <p className="text-[11px] text-ink-muted">{item.reason}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg border border-line bg-elevated p-3 text-[11px] text-ink-muted">
          Vagas dessas plataformas continuam utilizáveis: cadastre-as manualmente em Vagas → Nova vaga colando a
          descrição. Toda a análise, matching e geração de textos funciona normalmente.
        </p>
      </Card>

      {/* --- Histórico --- */}
      {syncs && syncs.length > 0 && (
        <Card>
          <SectionTitle title="Últimas sincronizações" />
          <ul className="mt-4 divide-y divide-line text-xs">
            {syncs.slice(0, 10).map((sync) => (
              <li key={sync.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="text-ink">{sync.sourceLabel || sync.sourceKind}</span>
                  <span className="ml-2 text-ink-faint">{formatRelative(sync.createdAt)}</span>
                </div>
                <span className={sync.status === 'ok' ? 'text-ink-muted' : 'text-danger'}>
                  {sync.status === 'ok'
                    ? `${sync.jobsNew} nova(s) de ${sync.jobsFound}${sync.jobsFiltered > 0 ? ` · ${sync.jobsFiltered} filtrada(s)` : ''}`
                    : sync.error.slice(0, 60)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
