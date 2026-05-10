import { describe, it, expect } from 'vitest';
import { createChatModel, createChatModelForRole } from '../../provider/model-factory';
import type { ResolvedLlmConfig } from '../../types/provider';

const baseConfig = {
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  baseUrl: '',
  timeoutMs: 60000,
  temperature: 0,
  maxRetries: 0,
};

describe('createChatModel', () => {
  it('openai provider 创建 ChatOpenAI 实例', () => {
    const model = createChatModel(baseConfig);
    expect(model).toBeDefined();
  });
});

describe('createChatModelForRole', () => {
  const configs: ResolvedLlmConfig = {
    solver: { ...baseConfig, temperature: 0.3 },
    planner: { ...baseConfig, model: 'gpt-4o', temperature: 0.1 },
    reviewer: { ...baseConfig, model: 'gpt-4o', temperature: 0.0 },
  };

  it('为 solver 角色创建 ChatModel', () => {
    const model = createChatModelForRole(configs, 'solver');
    expect(model).toBeDefined();
  });

  it('为 planner 角色创建 ChatModel', () => {
    const model = createChatModelForRole(configs, 'planner');
    expect(model).toBeDefined();
  });

  it('为 reviewer 角色创建 ChatModel', () => {
    const model = createChatModelForRole(configs, 'reviewer');
    expect(model).toBeDefined();
  });

  it('各角色使用对应配置', () => {
    const solverModel = createChatModelForRole(configs, 'solver');
    const plannerModel = createChatModelForRole(configs, 'planner');
    const reviewerModel = createChatModelForRole(configs, 'reviewer');

    // 三个角色应该是不同实例
    expect(solverModel).not.toBe(plannerModel);
    expect(plannerModel).not.toBe(reviewerModel);
    expect(solverModel).not.toBe(reviewerModel);
  });

  it('不同角色可使用不同 provider', () => {
    const mixedConfigs: ResolvedLlmConfig = {
      solver: { ...baseConfig, provider: 'openai' },
      planner: { ...baseConfig, provider: 'gemini' },
      reviewer: { ...baseConfig, provider: 'openai' },
    };

    const solverModel = createChatModelForRole(mixedConfigs, 'solver');
    const plannerModel = createChatModelForRole(mixedConfigs, 'planner');

    expect(solverModel).toBeDefined();
    expect(plannerModel).toBeDefined();
  });
});
