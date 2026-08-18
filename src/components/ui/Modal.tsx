import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `full` usa a tela inteira no mobile — melhor para formulários longos. */
  size?: 'sm' | 'md' | 'lg' | 'full';
}

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  full: 'sm:max-w-5xl',
};

/**
 * Diálogo acessível: foco inicial no conteúdo, Escape fecha, foco preso dentro
 * e retorno do foco ao elemento anterior. No mobile vira uma folha inferior.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // O listener é lido por referência para que o efeito abaixo dependa APENAS
  // de `open`. Sem isso, `handleKeyDown` (que muda sempre que `onClose` muda)
  // entraria nas dependências do efeito.
  const keyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    keyDownRef.current = handleKeyDown;
  }, [handleKeyDown]);

  useEffect(() => {
    if (!open) return;

    // BUG CORRIGIDO: este efeito dependia de `handleKeyDown`, que por sua vez
    // depende de `onClose`. Como os componentes que abrem o modal passam
    // `onClose` como arrow inline (`onClose={() => setEditing(null)}`), ela é
    // recriada a cada render do pai — e o estado do formulário mora no pai,
    // então CADA TECLA digitada re-renderizava o pai e re-executava este
    // efeito por inteiro. A limpeza devolvia o foco ao botão que abriu o
    // modal (`previousFocus`) e o setTimeout logo em seguida movia o foco
    // para o PRIMEIRO input do painel. Resultado: era impossível digitar em
    // qualquer campo que não o primeiro, porque o foco voltava para ele a
    // cada caractere. Agora o efeito roda só quando o modal abre ou fecha.
    previousFocus.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const listener = (event: KeyboardEvent) => keyDownRef.current(event);
    document.addEventListener('keydown', listener, true);

    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-close])',
      );
      (target ?? panelRef.current)?.focus();
    }, 30);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', listener, true);
      window.clearTimeout(timer);
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'panel-elevated animate-in-up relative flex max-h-[92dvh] w-full flex-col',
          'rounded-b-none rounded-t-2xl sm:rounded-2xl',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-lg p-2 text-ink-faint transition hover:bg-elevated hover:text-ink"
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}

/** Confirmação para ações destrutivas — nunca apaga nada sem perguntar. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, resolve });
      }),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
    setBusy(false);
  };

  const dialog = state ? (
    <Modal
      open
      onClose={() => close(false)}
      title={state.title}
      size="sm"
      footer={
        <>
          <Button onClick={() => close(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={state.tone === 'primary' ? 'primary' : 'danger'}
            loading={busy}
            onClick={() => {
              setBusy(true);
              close(true);
            }}
          >
            {state.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        {state.description ?? 'Esta ação não pode ser desfeita.'}
      </p>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
