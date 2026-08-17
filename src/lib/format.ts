/** Formatação de datas e textos para exibição (pt-BR). */

const MONTHS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** "2023-04" -> "abr/2023"; "2023" -> "2023"; vazio -> "—". */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return value;
  const year = match[1]!;
  if (!match[2]) return year;
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  return month ? `${month}/${year}` : year;
}

export function formatPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  isCurrent?: boolean,
): string {
  const from = formatMonth(start);
  const to = isCurrent ? 'atual' : formatMonth(end);
  if (from === '—' && to === '—') return 'Período não informado';
  return `${from} — ${to}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "há 3 dias", "agora mesmo". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

  if (absolute < 60) return 'agora mesmo';
  if (absolute < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (absolute < 86_400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (absolute < 2_592_000) return formatter.format(Math.round(diffSeconds / 86_400), 'day');
  if (absolute < 31_536_000) return formatter.format(Math.round(diffSeconds / 2_592_000), 'month');
  return formatter.format(Math.round(diffSeconds / 31_536_000), 'year');
}

export function initials(name: string, fallback = 'JP'): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || fallback;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Data de hoje em AAAA-MM-DD, no fuso local. */
export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
