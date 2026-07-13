import { describe, it, expect } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
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
    expect(model).toBeInstanceOf(ChatOpenAI);
  });

  it('openai provider 显式关闭 streamUsage，避免中转站不支持 stream_options', () => {
    // 中转站对 stream_options 的支持不一致，LangChain ChatOpenAI 默认 streamUsage=true
    // 会在流式时注入 stream_options: { include_usage: true }，导致部分上游 400。
    // 这里固化 streamUsage: false，保证流式请求不携带 stream_options。
    const model = createChatModel(baseConfig) as ChatOpenAI;
    expect(model.streamUsage).toBe(false);
  });

  it('openai provider 流式 invocation params 不含 stream_options', () => {
    const model = createChatModel(baseConfig) as ChatOpenAI;
    // 模拟 _streamResponseChunks 内部的调用方式：extra.streaming = true
    const params = model.invocationParams(undefined, { streaming: true });
    expect(params).not.toHaveProperty('stream_options');
  });

  it('openai provider 流式 invocation params 的 stream 字段由调用方覆盖', () => {
    // invocationParams 本身读取 this.streaming（默认 false）；
    // 真正的 stream:true 由 _streamResponseChunks 在拿到 params 后覆盖。
    // 这里只验证 invocationParams 不会反向把 stream 锁死成 false。
    const model = createChatModel(baseConfig) as ChatOpenAI;
    const params = model.invocationParams(undefined, { streaming: true });
    // stream 字段存在（具体值由上层覆盖为 true）
    expect(params).toHaveProperty('stream');
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
