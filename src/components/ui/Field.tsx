import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const CONTROL_BASE =
  'w-full rounded-lg border border-line bg-elevated px-3 text-ink placeholder:text-ink-faint transition ' +
  'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 disabled:cursor-not-allowed';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Envelope padrão de campo: label associada, dica e mensagem de erro (§41). */
export function Field({ label, hint, error, required, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field
      {...(label ? { label } : {})}
      {...(hint ? { hint } : {})}
      error={error ?? null}
      {...(required ? { required } : {})}
      htmlFor={inputId}
    >
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL_BASE, 'h-11 sm:h-10', error && 'border-danger focus:border-danger focus:ring-danger', className)}
        {...props}
      />
    </Field>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id, required, rows = 4, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field
      {...(label ? { label } : {})}
      {...(hint ? { hint } : {})}
      error={error ?? null}
      {...(required ? { required } : {})}
      htmlFor={inputId}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL_BASE, 'resize-y py-2.5 leading-relaxed', error && 'border-danger', className)}
        {...props}
      />
    </Field>
  );
});

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, hint, error, options, placeholder, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field
      {...(label ? { label } : {})}
      {...(hint ? { hint } : {})}
      error={error ?? null}
      {...(required ? { required } : {})}
      htmlFor={inputId}
    >
      <select
        ref={ref}
        id={inputId}
        required={required}
        className={cn(CONTROL_BASE, 'h-11 appearance-none pr-8 sm:h-10', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.65rem center',
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

export interface TagInputProps {
  label?: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
}

/** Entrada de lista (skills, tecnologias, cargos-alvo). Enter ou vírgula adiciona. */
export function TagInput({
  label,
  hint,
  value,
  onChange,
  placeholder = 'Digite e pressione Enter',
  maxItems = 60,
  disabled,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const commit = (raw: string) => {
    const items = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const next = [...value];
    for (const item of items) {
      if (next.length >= maxItems) break;
      if (next.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
      next.push(item);
    }
    onChange(next);
    setDraft('');
  };

  return (
    <Field {...(label ? { label } : {})} hint={hint ?? `${value.length}/${maxItems}`} htmlFor={inputId}>
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-elevated p-1.5',
          'focus-within:border-accent focus-within:ring-1 focus-within:ring-accent',
          disabled && 'opacity-60',
        )}
      >
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-md bg-overlay py-1 pl-2 pr-1 text-xs text-ink"
          >
            {item}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((existing) => existing !== item))}
              className="rounded p-0.5 text-ink-faint transition hover:bg-line-strong hover:text-ink"
              aria-label={`Remover ${item}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          disabled={disabled || value.length >= maxItems}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={value.length >= maxItems ? 'Limite atingido' : placeholder}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={() => commit(draft)}
            className="rounded-md p-1.5 text-accent transition hover:bg-accent-soft"
            aria-label="Adicionar item"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </Field>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex items-start gap-3">
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong bg-elevated accent-accent',
          className,
        )}
        {...props}
      />
      <label htmlFor={inputId} className="cursor-pointer select-none">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </label>
    </div>
  );
}
