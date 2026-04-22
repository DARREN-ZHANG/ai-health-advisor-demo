import type { ResolvedProviderConfig } from '../types/provider';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function createChatModel(config: ResolvedProviderConfig): BaseChatModel {
  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        modelName: config.model,
        openAIApiKey: config.apiKey,
        configuration: config.baseUrl
          ? { baseURL: config.baseUrl }
          : undefined,
        temperature: config.temperature,
        maxRetries: config.maxRetries,
        timeout: config.timeoutMs,
      });
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        model: config.model,
        apiKey: config.apiKey,
        temperature: config.temperature,
        maxRetries: config.maxRetries,
      });
    case 'anthropic':
      throw new Error('Anthropic provider not yet implemented');
    default:
      throw new Error(`Unknown provider: ${config.provider satisfies never}`);
  }
}
