import { describe, it, expect } from 'vitest';
import { initializeAgent, initializeAgents } from '../../executor/agent-initializer';

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

describe('initializeAgents', () => {
  const baseConfig = {
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    apiKey: 'test-key',
    baseUrl: '',
    timeoutMs: 5000,
    temperature: 0,
    maxRetries: 0,
  };

  it('返回三个独立 agent', () => {
    const { solverAgent, plannerAgent, reviewerAgent } = initializeAgents({
      solver: baseConfig,
      planner: { ...baseConfig, temperature: 0.1 },
      reviewer: { ...baseConfig, temperature: 0.0 },
    });

    expect(solverAgent).toBeDefined();
    expect(plannerAgent).toBeDefined();
    expect(reviewerAgent).toBeDefined();
    expect(typeof solverAgent.invoke).toBe('function');
    expect(typeof plannerAgent.invoke).toBe('function');
    expect(typeof reviewerAgent.invoke).toBe('function');
  });

  it('三个 agent 是不同实例', () => {
    const { solverAgent, plannerAgent, reviewerAgent } = initializeAgents({
      solver: baseConfig,
      planner: { ...baseConfig, temperature: 0.1 },
      reviewer: { ...baseConfig, temperature: 0.0 },
    });

    expect(solverAgent).not.toBe(plannerAgent);
    expect(plannerAgent).not.toBe(reviewerAgent);
    expect(solverAgent).not.toBe(reviewerAgent);
  });
});
