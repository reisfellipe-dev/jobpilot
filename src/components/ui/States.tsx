import type { ReactNode } from 'react';
import { AlertCircle, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { ApiClientError, errorMessage } from '@/lib/api';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="panel space-y-3 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="rounded-xl bg-elevated p-3 text-ink-faint [&>svg]:size-6">{icon}</div>}
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Estado de erro com tratamento específico para offline e IA indisponível (§40). */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const isOffline = error instanceof ApiClientError && error.code === 'offline';
  const isAI = error instanceof ApiClientError && error.isAIError;

  const title = isOffline
    ? 'Você está offline'
    : isAI
      ? 'Serviço de IA temporariamente indisponível'
      : 'Não foi possível carregar';

  return (
    <div
      className={cn(
        'panel flex flex-col items-center gap-3 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
      )}
      role="alert"
    >
      <div className="rounded-xl bg-danger-soft p-2.5 text-danger">
        {isOffline ? <WifiOff className="size-5" aria-hidden /> : <AlertCircle className="size-5" aria-hidden />}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{errorMessage(error)}</span>
    </p>
  );
}
