import { describe, it, expect } from 'vitest';
import { FakeChatModel } from '../../provider/fake-chat-model';
import { HumanMessage } from '@langchain/core/messages';

describe('FakeChatModel', () => {
  it('returns predetermined response', async () => {
    const model = new FakeChatModel('你好，这是测试响应');
    const result = await model.invoke([new HumanMessage('hello')]);
    expect(result.content).toBe('你好，这是测试响应');
  });

  it('returns different responses per instance', async () => {
    const modelA = new FakeChatModel('响应 A');
    const modelB = new FakeChatModel('响应 B');
    const [resultA, resultB] = await Promise.all([
      modelA.invoke([new HumanMessage('hi')]),
      modelB.invoke([new HumanMessage('hi')]),
    ]);
    expect(resultA.content).toBe('响应 A');
    expect(resultB.content).toBe('响应 B');
  });
});
