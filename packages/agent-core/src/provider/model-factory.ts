import type { ResolvedProviderConfig } from '../types/provider';
import { ChatOpenAI } from '@langchain/openai';

export function createChatModel(config: ResolvedProviderConfig): ChatOpenAI {
  // 首期仅实现 OpenAI provider
  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        modelName: config.model,
        openAIApiKey: config.apiKey,
        temperature: config.temperature,
        maxRetries: config.maxRetries,
        timeout: config.timeoutMs,
      });
    case 'anthropic':
      throw new Error('Anthropic provider not yet implemented');
    case 'gemini':
      throw new Error('Gemini provider not yet implemented');
    default:
      throw new Error(`Unknown provider: ${config.provider satisfies never}`);
  }
}
