import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/** Abas roláveis horizontalmente — cabem em 320px sem quebrar (§32). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors',
                active ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {item.icon && <span className="[&>svg]:size-3.5">{item.icon}</span>}
              {item.label}
              {typeof item.count === 'number' && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                    active ? 'bg-accent-soft text-accent-ink' : 'bg-elevated text-ink-faint',
                  )}
                >
                  {item.count}
                </span>
              )}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
