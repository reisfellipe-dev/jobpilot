/**
 * Bloco de descoberta do Dashboard (§6, §22, §32).
 *
 * Também é o ponto onde a sincronização automática acontece: se o usuário
 * ativou a opção e a última busca tem mais de 12 horas, dispara em segundo
 * plano ao abrir o app — sem cron no servidor e sem credencial administrativa.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Radar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { useDiscoverySummary, useRunDiscovery } from '@/hooks/discovery';
import { useSettings } from '@/hooks/queries';

const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function DiscoveryBanner() {
  const { data: summary } = useDiscoverySummary();
  const { data: settings } = useSettings();
  const runDiscovery = useRunDiscovery();
  const toast = useToast();
  const autoTriggered = useRef(false);

  // Sincronização automática: uma vez por sessão, só se estiver desatualizada.
  useEffect(() => {
    if (autoTriggered.current) return;
    if (!settings?.autoDiscovery || !summary) return;
    if (summary.activeSources === 0) return;

    const last = summary.lastSyncAt ? new Date(summary.lastSyncAt).getTime() : 0;
    if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return;

    autoTriggered.current = true;
    runDiscovery.mutate(
      {},
      {
        onSuccess: (result) => {
          if (result.totalNew > 0) {
            toast.success(`${result.totalNew} nova(s) vaga(s)`, 'Busca automática concluída.');
          }
        },
        // Falha silenciosa: é uma ação de fundo que o usuário não pediu agora.
        onError: () => undefined,
      },
    );
  }, [settings?.autoDiscovery, summary, runDiscovery, toast]);

  const available = summary?.available ?? 0;
  const highMatches = summary?.highMatches ?? 0;

  return (
    <div className="panel mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Compass className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {available > 0 ? `${available} oportunidade(s) esperando revisão` : 'Buscar vagas novas'}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            {highMatches > 0 && <Badge tone="success">{highMatches} com match alto</Badge>}
            <span>
              {summary?.lastSyncAt
                ? `Última busca ${formatRelative(summary.lastSyncAt)}`
                : 'Nenhuma busca realizada ainda'}
              {settings?.autoDiscovery ? ' · automática ligada' : ''}
            </span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="primary"
          icon={<Radar />}
          onClick={() =>
            runDiscovery.mutate(
              {},
              {
                onSuccess: (result) =>
                  toast.success(
                    `${result.totalNew} nova(s) vaga(s)`,
                    result.failedSources.length > 0
                      ? `Fontes com falha: ${result.failedSources.join(', ')}.`
                      : undefined,
                  ),
                onError: (error) =>
                  toast.error('Falha na busca', error instanceof Error ? error.message : undefined),
              },
            )
          }
          loading={runDiscovery.isPending}
        >
          {runDiscovery.isPending ? 'Buscando…' : 'Buscar novas vagas'}
        </Button>
        <Link to="/descobrir">
          <Button icon={<ArrowRight />}>Ver</Button>
        </Link>
      </div>
    </div>
  );
}
