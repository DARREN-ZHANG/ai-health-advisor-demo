import type { ResolvedProviderConfig, ResolvedLlmConfig, LlmRole } from '../types/provider';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function createChatModel(config: ResolvedProviderConfig): BaseChatModel {
  switch (config.provider) {
    case 'openai':
      // streamUsage 默认为 true，会在流式时注入 stream_options: { include_usage: true }。
      // 部分中转站不支持 stream_options 会返回 400，这里显式关闭以保证流式兼容性。
      return new ChatOpenAI({
        modelName: config.model,
        openAIApiKey: config.apiKey,
        configuration: config.baseUrl
          ? { baseURL: config.baseUrl }
          : undefined,
        temperature: config.temperature,
        maxRetries: config.maxRetries,
        timeout: config.timeoutMs,
        streamUsage: false,
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

/** 为指定角色创建 ChatModel */
export function createChatModelForRole(
  configs: ResolvedLlmConfig,
  role: LlmRole,
): BaseChatModel {
  return createChatModel(configs[role]);
}
