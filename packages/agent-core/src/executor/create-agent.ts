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
  /**
   * 流式调用：增量返回模型输出 chunk。
   *
   * 与 invoke 共用同一组 SystemMessage/HumanMessage 构造逻辑，
   * 调用 chatModel.stream(messages, { signal }) 并把 AbortSignal 原样透传给 LangChain。
   * 只接受 string content 的 chunk（跳过多模态/空内容），每个非空 string 作为一个 AgentInvokeOutput yield。
   */
  stream(input: AgentInvokeInput): AsyncIterable<AgentInvokeOutput>;
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

    async *stream(input: AgentInvokeInput): AsyncIterable<AgentInvokeOutput> {
      const messages = [
        new SystemMessage(input.systemPrompt),
        new HumanMessage(input.userPrompt),
      ];
      const stream = await config.chatModel.stream(messages, {
        signal: input.signal,
      });
      for await (const chunk of stream) {
        // 只接受 string content，跳过多模态 chunk
        if (typeof chunk.content !== 'string') {
          continue;
        }
        // 跳过空字符串，只 yield 有内容的 chunk
        if (chunk.content.length === 0) {
          continue;
        }
        yield { content: chunk.content };
      }
    },
  };
}
