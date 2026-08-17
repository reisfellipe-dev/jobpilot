import { scoreTier } from '@shared/matching/score';
import type { ScoreBreakdownItem } from '@shared/schemas/job';
import { cn } from '@/lib/cn';
import { Badge, type Tone } from './Primitives';

export function scoreTone(score: number): Tone {
  const tier = scoreTier(score);
  return tier === 'alto' ? 'success' : tier === 'medio' ? 'warning' : 'danger';
}

const STROKE: Record<Tone, string> = {
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
  accent: 'stroke-accent',
  info: 'stroke-info',
  neutral: 'stroke-ink-faint',
};

const TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  accent: 'text-accent-ink',
  info: 'text-info',
  neutral: 'text-ink',
};

export function ScoreRing({
  score,
  size = 72,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const tone = scoreTone(score);
  const stroke = size >= 64 ? 6 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ? `${label}: ` : ''}score ${score} de 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line-strong"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-500', STROKE[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-semibold tabular-nums', TEXT[tone], size >= 64 ? 'text-lg' : 'text-sm')}>
          {score}
        </span>
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  return <Badge tone={scoreTone(score)}>{score}/100</Badge>;
}

/** Detalhamento de como o score foi formado — exigência de explicabilidade (§23). */
export function ScoreBreakdown({ items }: { items: ScoreBreakdownItem[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const percent = item.weight > 0 ? Math.round((item.points / item.weight) * 100) : 0;
        const tone: Tone = percent >= 75 ? 'success' : percent >= 45 ? 'warning' : 'danger';
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-ink">{item.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                {item.points.toFixed(1)} / {item.weight}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-danger',
                )}
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-faint">{item.detail}</p>
            {item.missing.length > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                <span className="text-danger">Faltando:</span> {item.missing.slice(0, 8).join(', ')}
                {item.missing.length > 8 && ` +${item.missing.length - 8}`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
