/**
 * Provider secundario: NVIDIA NIM.
 * Mesma interface do Groq - o restante da aplicacao nao sabe qual esta ativo (§6).
 */
import type { AIProviderName } from '../../../../shared/constants.js';
import { OpenAICompatibleProvider } from '../openai-compatible.js';

export class NvidiaProvider extends OpenAICompatibleProvider {
  readonly name: AIProviderName = 'nvidia';
  protected readonly label = 'NVIDIA NIM';
}
