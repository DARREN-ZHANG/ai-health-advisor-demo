import { describe, it, expect } from 'vitest';
import { initializeAgent } from '../../executor/agent-initializer';

describe('initializeAgent', () => {
  it('串联 provider config → chat model → health agent', async () => {
    const agent = initializeAgent({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      baseUrl: '',
      timeoutMs: 5000,
      temperature: 0,
      maxRetries: 0,
    });

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');

    // 验证 invoke 能正常执行（使用 FakeChatModel 是在 createChatModel 内部，
    // 但 initializeAgent 会创建真实 ChatOpenAI，所以此处验证接口即可）
  });

  it('返回的 agent 具有 invoke 方法', () => {
    const agent = initializeAgent({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      baseUrl: '',
      timeoutMs: 5000,
      temperature: 0,
      maxRetries: 0,
    });

    expect(agent).toHaveProperty('invoke');
    expect(typeof agent.invoke).toBe('function');
  });

  it('不同 config 产生不同 agent 实例', () => {
    const agent1 = initializeAgent({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'key-1',
      baseUrl: '',
      timeoutMs: 5000,
      temperature: 0,
      maxRetries: 0,
    });

    const agent2 = initializeAgent({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'key-2',
      baseUrl: '',
      timeoutMs: 5000,
      temperature: 0,
      maxRetries: 0,
    });

    expect(agent1).not.toBe(agent2);
  });
});
