/**
 * Cliente HTTP dos conectores de vagas (§27).
 *
 * Postura: respeitar a fonte, nunca contorná-la.
 *  - User-Agent identifica honestamente a aplicação;
 *  - `Retry-After` é obedecido quando enviado;
 *  - 4xx (exceto 429) não são repetidos — a fonte disse não;
 *  - circuit breaker evita insistir em fonte que já falhou seguidamente;
 *  - concorrência limitada para não pressionar nenhuma API.
 *
 * Não existe aqui nenhum mecanismo de evasão: sem rotação de identidade, sem
 * proxy, sem resolução de CAPTCHA, sem burlar bloqueio (§2, §33).
 */

export const USER_AGENT = 'JobPilot/1.0 (+https://github.com/reisfellipe-dev/jobpilot) job-discovery';

export type HttpErrorKind = 'timeout' | 'network' | 'rate_limit' | 'not_found' | 'forbidden' | 'server' | 'invalid';

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(kind: HttpErrorKind, message: string, status: number | null = null, retryable = false) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Teto de bytes lidos — protege contra respostas gigantes inesperadas. */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Circuit breaker por host. O estado vive na instância serverless: em caso de
 * cold start ele reinicia, o que é aceitável — o objetivo é evitar insistência
 * dentro de uma mesma execução, não manter estado global.
 */
interface BreakerState {
  failures: number;
  openUntil: number;
}

const breakers = new Map<string, BreakerState>();
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isCircuitOpen(url: string, now = Date.now()): boolean {
  const state = breakers.get(hostOf(url));
  return Boolean(state && state.openUntil > now);
}

function recordFailure(url: string): void {
  const host = hostOf(url);
  const state = breakers.get(host) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_THRESHOLD) {
    state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    state.failures = 0;
  }
  breakers.set(host, state);
}

function recordSuccess(url: string): void {
  breakers.delete(hostOf(url));
}

/** Exposto para os testes: zera o estado entre cenários. */
export function resetBreakers(): void {
  breakers.clear();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function backoffDelay(attempt: number): number {
  // 500ms, 1s, 2s… com jitter para não sincronizar rajadas.
  const base = 500 * 2 ** attempt;
  return Math.min(8000, base) + Math.floor(Math.random() * 250);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = new Date(header).getTime();
  if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), 30_000);
  return null;
}

/** GET de JSON com timeout, retry controlado e circuit breaker. */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    signal,
    headers = {},
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;

  if (isCircuitOpen(url)) {
    throw new HttpError('server', 'Fonte temporariamente suspensa após falhas consecutivas.', null, false);
  }

  let lastError: HttpError = new HttpError('network', 'Falha desconhecida.');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (response.status === 429) {
        const wait = parseRetryAfter(response.headers.get('retry-after')) ?? backoffDelay(attempt);
        lastError = new HttpError('rate_limit', 'A fonte pediu para aguardar antes de novas requisições.', 429, true);
        if (attempt < retries) {
          await sleep(wait);
          continue;
        }
        recordFailure(url);
        throw lastError;
      }

      if (response.status === 404) {
        recordSuccess(url);
        throw new HttpError('not_found', 'Recurso não encontrado na fonte.', 404, false);
      }

      if (response.status === 401 || response.status === 403) {
        recordSuccess(url);
        throw new HttpError('forbidden', 'A fonte recusou o acesso público a este recurso.', response.status, false);
      }

      if (response.status >= 500) {
        lastError = new HttpError('server', `A fonte respondeu ${response.status}.`, response.status, true);
        if (attempt < retries) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        recordFailure(url);
        throw lastError;
      }

      if (!response.ok) {
        recordSuccess(url);
        throw new HttpError('invalid', `Resposta inesperada da fonte (${response.status}).`, response.status, false);
      }

      const text = await readLimited(response, maxBytes);
      recordSuccess(url);

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new HttpError('invalid', 'A fonte não devolveu JSON válido.', response.status, false);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        if (!error.retryable || attempt >= retries) throw error;
        lastError = error;
      } else if (controller.signal.aborted) {
        lastError = new HttpError('timeout', `A fonte não respondeu em ${timeoutMs} ms.`, null, true);
        if (attempt >= retries) {
          recordFailure(url);
          throw lastError;
        }
      } else {
        lastError = new HttpError('network', 'Falha de rede ao contatar a fonte.', null, true);
        if (attempt >= retries) {
          recordFailure(url);
          throw lastError;
        }
      }
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  recordFailure(url);
  throw lastError;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > maxBytes) {
    throw new HttpError('invalid', 'Resposta da fonte maior que o limite aceito.', response.status, false);
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new HttpError('invalid', 'Resposta da fonte maior que o limite aceito.', response.status, false);
  }
  return text;
}

/** Executa tarefas com concorrência limitada, preservando a ordem dos resultados. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item, index);
    }
  });

  await Promise.all(runners);
  return results;
}

export function describeHttpError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Falha desconhecida ao consultar a fonte.';
}
