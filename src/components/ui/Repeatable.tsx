import { useRef, type ReactNode } from 'react';
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
  // Chave estável por POSIÇÃO NA LISTA (não por índice de render, e não pelo
  // objeto do item — editar um campo troca a referência do objeto a cada
  // tecla, então uma key baseada no objeto mudaria a cada digitação).
  //
  // BUG CORRIGIDO: a key da lista era `key={index}`. Isso por si só não afeta
  // apenas digitar; mas se um item era adicionado/removido enquanto outro
  // estava com o input focado, o React reconciliava o DOM pela posição, e o
  // card errado podia herdar o valor/estado de outro, ou perder o foco.
  //
  // A lista de chaves abaixo cresce/encolhe exatamente como `items`: uma
  // chave nova só é criada quando o array aumenta (item adicionado), e ao
  // remover um item removemos a chave da MESMA posição, preservando a
  // correspondência de todos os outros itens. Edição de conteúdo nunca muda
  // o tamanho do array, então nunca gera ou realoca chaves.
  const keysRef = useRef<number[]>([]);
  const nextKeyRef = useRef(0);
  while (keysRef.current.length < items.length) {
    keysRef.current.push(nextKeyRef.current++);
  }
  if (keysRef.current.length > items.length) {
    keysRef.current = keysRef.current.slice(0, items.length);
  }

  const update = (index: number, patch: Partial<T>) => {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number) => {
    onChange(items.filter((_, position) => position !== index));
    keysRef.current = keysRef.current.filter((_, position) => position !== index);
  };

  return (
    <div className="space-y-3">
      {label && <p className="text-xs font-medium text-ink-muted">{label}</p>}

      {items.length === 0 && <p className="text-xs text-ink-faint">{emptyLabel}</p>}

      {items.map((item, index) => (
        <div key={keysRef.current[index]} className="rounded-lg border border-line bg-elevated p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{render(item, (patch) => update(index, patch), index)}</div>
            <button
              type="button"
              onClick={() => remove(index)}
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
