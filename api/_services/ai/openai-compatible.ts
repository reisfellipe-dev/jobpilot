/**
 * Transporte compartilhado para APIs compativeis com o formato OpenAI
 * (`POST /chat/completions`). Groq e NVIDIA NIM expoem esse mesmo contrato,
 * entao a diferenca entre providers fica reduzida a configuracao.
 *
 * Nenhuma outra parte da aplicacao faz HTTP para provider de IA (§5).
 */
import type { ZodError } from 'zod';
import type { AIProviderName } from '../../../shared/constants.js';
import type { ProviderEnv } from '../../_lib/env.js';
import {
  AIError,
  type AIGenerateRequest,
  type AIProvider,
  type AIResult,
  type AIStructuredRequest,
  type AIStructuredResult,
  type AIUsage,
} from './types.js';
import { describeIssues, parseLooseJson } from './json.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCallOptions {
  json: boolean;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

interface ChatResponseShape {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
}

export abstract class OpenAICompatibleProvider implements AIProvider {
  abstract readonly name: AIProviderName;
  protected abstract readonly label: string;

  /** Desliga o JSON mode em runtime quando o modelo configurado nao suporta (§7). */
  private jsonModeDisabled = false;

  constructor(
    protected readonly config: ProviderEnv,
    protected readonly timeoutMs: number,
    protected readonly maxOutputTokens: number,
  ) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.model && this.config.baseUrl);
  }

  supportsJsonMode(): boolean {
    if (this.config.jsonMode === 'off') return false;
    return !this.jsonModeDisabled;
  }

  async generate(request: AIGenerateRequest): Promise<AIResult> {
    this.assertConfigured();
    const { text, usage } = await this.callChat(
      [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      {
        json: Boolean(request.json),
        temperature: request.temperature ?? 0.4,
        maxTokens: Math.min(request.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    return { text, usage, provider: this.name, model: this.config.model };
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResult<T>> {
    this.assertConfigured();

    const messages: ChatMessage[] = [
      { role: 'system', content: `${request.system}\n\n${jsonInstruction(request.schemaHint)}` },
      { role: 'user', content: request.user },
    ];

    const usageTotal: AIUsage = { inputTokens: 0, outputTokens: 0 };
    let lastError = '';
    let repaired = false;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { text, usage } = await this.callChat(messages, {
        json: request.json !== false && this.supportsJsonMode(),
        temperature: attempt === 1 ? (request.temperature ?? 0.2) : 0,
        maxTokens: Math.min(request.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      usageTotal.inputTokens += usage.inputTokens;
      usageTotal.outputTokens += usage.outputTokens;

      const parsed = parseLooseJson(text);
      if (parsed) {
        repaired = repaired || parsed.repaired;
        const validation = request.schema.safeParse(parsed.value);
        if (validation.success) {
          return {
            data: validation.data,
            raw: text,
            usage: usageTotal,
            provider: this.name,
            model: this.config.model,
            attempts: attempt,
            repaired,
          };
        }
        lastError = describeIssues((validation.error as ZodError).issues);
      } else {
        lastError = 'A resposta não continha JSON válido.';
      }

      if (attempt === 1) {
        // Pede correcao explicita antes de desistir do provider.
        messages.push({ role: 'assistant', content: text.slice(0, 2000) });
        messages.push({
          role: 'user',
          content:
            `A resposta anterior não passou na validação. Problemas encontrados:\n${lastError}\n\n` +
            'Responda NOVAMENTE apenas com o JSON corrigido, sem texto fora do JSON, ' +
            'respeitando exatamente o formato pedido. Não invente dados para preencher campos.',
        });
      }
    }

    throw new AIError('invalid_response', `${this.label} não devolveu JSON válido. ${lastError}`.trim(), {
      provider: this.name,
      retryable: true,
    });
  }

  analyze<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResult<T>> {
    return this.generateStructured({ ...request, temperature: request.temperature ?? 0.1 });
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AIError('not_configured', `${this.label} não está configurado.`, { provider: this.name });
    }
  }

  private async callChat(
    messages: ChatMessage[],
    options: ChatCallOptions,
  ): Promise<{ text: string; usage: AIUsage }> {
    try {
      return await this.request(messages, options);
    } catch (error) {
      // Degradacao automatica: modelo sem suporte a response_format (§7).
      if (error instanceof AIError && error.code === 'json_mode_unsupported' && options.json) {
        this.jsonModeDisabled = true;
        return this.request(messages, { ...options, json: false });
      }
      throw error;
    }
  }

  private async request(
    messages: ChatMessage[],
    options: ChatCallOptions,
  ): Promise<{ text: string; usage: AIUsage }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = options.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort, { once: true });

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: false,
    };
    if (options.json) body.response_format = { type: 'json_object' };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AIError('timeout', `${this.label} não respondeu a tempo (${this.timeoutMs} ms).`, {
          provider: this.name,
          retryable: true,
        });
      }
      throw new AIError('network', `Falha de rede ao contatar ${this.label}.`, {
        provider: this.name,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }

    const rawText = await response.text();
    let payload: ChatResponseShape = {};
    try {
      payload = rawText ? (JSON.parse(rawText) as ChatResponseShape) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw this.mapHttpError(response.status, payload, rawText, options.json);
    }

    const content = payload.choices?.[0]?.message?.content ?? '';
    const finishReason = payload.choices?.[0]?.finish_reason ?? '';
    if (!content.trim()) {
      throw new AIError('invalid_response', `${this.label} devolveu uma resposta vazia.`, {
        provider: this.name,
        retryable: true,
      });
    }
    if (finishReason === 'length') {
      // Nao e erro fatal: o parser tenta fechar JSON truncado antes de falhar.
      console.warn(`[ai] ${this.name}: resposta truncada por limite de tokens.`);
    }

    return {
      text: content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  }

  private mapHttpError(status: number, payload: ChatResponseShape, rawText: string, jsonRequested: boolean): AIError {
    const message = payload.error?.message ?? rawText.slice(0, 300) ?? '';
    const normalized = message.toLowerCase();

    if (status === 401 || status === 403) {
      return new AIError('auth', `Credencial inválida para ${this.label}.`, {
        provider: this.name,
        status,
        retryable: false,
      });
    }
    if (status === 429) {
      return new AIError('rate_limit', `${this.label} atingiu o limite de requisições.`, {
        provider: this.name,
        status,
        retryable: true,
      });
    }
    if (status === 404 && normalized.includes('model')) {
      return new AIError('not_configured', `Modelo "${this.config.model}" não existe em ${this.label}.`, {
        provider: this.name,
        status,
        retryable: false,
      });
    }
    if (status === 400) {
      if (jsonRequested && (normalized.includes('response_format') || normalized.includes('json_object') || normalized.includes('json mode'))) {
        return new AIError('json_mode_unsupported', `${this.label}: modelo sem suporte a JSON mode.`, {
          provider: this.name,
          status,
          retryable: true,
        });
      }
      if (normalized.includes('context') || normalized.includes('too many tokens') || normalized.includes('maximum')) {
        return new AIError('context_length', `Conteúdo grande demais para o modelo de ${this.label}.`, {
          provider: this.name,
          status,
          retryable: false,
        });
      }
      return new AIError('unknown', `${this.label} recusou a requisição: ${message.slice(0, 200)}`, {
        provider: this.name,
        status,
        retryable: false,
      });
    }
    if (status >= 500) {
      return new AIError('unavailable', `${this.label} está indisponível no momento.`, {
        provider: this.name,
        status,
        retryable: true,
      });
    }
    return new AIError('unknown', `${this.label} respondeu com status ${status}.`, {
      provider: this.name,
      status,
      retryable: status >= 500,
    });
  }
}

function jsonInstruction(schemaHint: string): string {
  return [
    'FORMATO DA RESPOSTA',
    'Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem cercas de código,',
    'sem comentários e sem qualquer texto antes ou depois do JSON.',
    'Use exatamente as chaves descritas abaixo. Campos sem informação disponível devem vir',
    'vazios ("" ou []), nunca preenchidos com suposições.',
    '',
    'ESTRUTURA ESPERADA:',
    schemaHint.trim(),
  ].join('\n');
}
