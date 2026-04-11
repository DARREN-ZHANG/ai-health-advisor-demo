import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface AgentInvokeInput {
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export interface AgentInvokeOutput {
  content: string;
}

export interface AgentConfig {
  chatModel: BaseChatModel;
}

export interface HealthAgent {
  invoke(input: AgentInvokeInput): Promise<AgentInvokeOutput>;
}

export function createHealthAgent(config: AgentConfig): HealthAgent {
  return {
    async invoke(input: AgentInvokeInput): Promise<AgentInvokeOutput> {
      const messages = [
        new SystemMessage(input.systemPrompt),
        new HumanMessage(input.userPrompt),
      ];
      const response = await config.chatModel.invoke(messages, {
        signal: input.signal,
      });
      return { content: typeof response.content === 'string' ? response.content : '' };
    },
  };
}
