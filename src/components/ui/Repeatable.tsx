import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './Button';

/**
 * Lista editável genérica (formação, certificações, idiomas, links).
 * Mantém a edição inline e evita um modal para cada item pequeno.
 */
export function Repeatable<T>({
  label,
  items,
  onChange,
  create,
  render,
  addLabel = 'Adicionar',
  emptyLabel = 'Nenhum item cadastrado.',
  max = 30,
}: {
  label?: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  addLabel?: string;
  emptyLabel?: string;
  max?: number;
}) {
  const update = (index: number, patch: Partial<T>) => {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-3">
      {label && <p className="text-xs font-medium text-ink-muted">{label}</p>}

      {items.length === 0 && <p className="text-xs text-ink-faint">{emptyLabel}</p>}

      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-line bg-elevated p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{render(item, (patch) => update(index, patch), index)}</div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, position) => position !== index))}
              className="shrink-0 rounded-md p-2 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
              aria-label={`Remover item ${index + 1}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ))}

      {items.length < max && (
        <Button type="button" size="sm" icon={<Plus />} onClick={() => onChange([...items, create()])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}
