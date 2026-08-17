/**
 * Provider principal: Groq.
 * Toda a integracao HTTP fica isolada aqui e na classe base (§5).
 */
import type { AIProviderName } from '../../../../shared/constants';
import { OpenAICompatibleProvider } from '../openai-compatible';

export class GroqProvider extends OpenAICompatibleProvider {
  readonly name: AIProviderName = 'groq';
  protected readonly label = 'Groq';
}
