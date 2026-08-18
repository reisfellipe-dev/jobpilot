/**
 * Provider principal: Groq.
 * Toda a integracao HTTP fica isolada aqui e na classe base (§5).
 */
import type { AIProviderName } from '../../../../shared/constants.js';
import { OpenAICompatibleProvider } from '../openai-compatible.js';

export class GroqProvider extends OpenAICompatibleProvider {
  readonly name: AIProviderName = 'groq';
  protected readonly label = 'Groq';
}
