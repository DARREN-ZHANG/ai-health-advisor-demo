import { describe, it, expect } from 'vitest';
import { createHealthAgent } from '../../executor/create-agent';
import { FakeChatModel } from '../../provider/fake-chat-model';

describe('createHealthAgent', () => {
  it('returns agent that invokes chat model', async () => {
    const fakeModel = new FakeChatModel('{"summary":"测试响应"}');
    const agent = createHealthAgent({ chatModel: fakeModel });

    const result = await agent.invoke({
      systemPrompt: '你是一个健康助手',
      userPrompt: '请分析我最近的数据',
    });

    expect(result.content).toBe('{"summary":"测试响应"}');
  });

  it('returns empty content for non-string response', async () => {
    const agent = createHealthAgent({ chatModel: new FakeChatModel('hello') });
    const result = await agent.invoke({
      systemPrompt: 'sys',
      userPrompt: 'user',
    });
    expect(result.content).toBe('hello');
  });
});
