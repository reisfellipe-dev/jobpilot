/**
 * Provider secundario: NVIDIA NIM.
 * Mesma interface do Groq - o restante da aplicacao nao sabe qual esta ativo (§6).
 */
import type { AIProviderName } from '../../../../shared/constants';
import { OpenAICompatibleProvider } from '../openai-compatible';

export class NvidiaProvider extends OpenAICompatibleProvider {
  readonly name: AIProviderName = 'nvidia';
  protected readonly label = 'NVIDIA NIM';
}
