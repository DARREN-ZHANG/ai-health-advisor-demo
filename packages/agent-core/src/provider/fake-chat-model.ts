import { AIMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';

/**
 * 用于测试的假 Chat Model，返回预设的响应。
 * 不发起真实 LLM 调用。
 */
export class FakeChatModel extends BaseChatModel {
  static lc_name(): string {
    return 'FakeChatModel';
  }

  lc_serializable = false;

  private response: string;

  constructor(response: string) {
    super({});
    this.response = response;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _generate(_messages: unknown[], _options?: unknown): Promise<ChatResult> {
    return {
      generations: [
        {
          text: this.response,
          message: new AIMessage(this.response),
        } as unknown as ChatGenerationChunk,
      ],
    };
  }

  _llmType(): string {
    return 'fake';
  }
}
