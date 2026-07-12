import { describe, it, expect } from 'vitest';
import { resolveProviderConfig, resolveAllLlmConfigs } from '../../provider/provider-config';

describe('resolveProviderConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = resolveProviderConfig({});
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.apiKey).toBe('');
    expect(config.timeoutMs).toBe(60000);
    expect(config.temperature).toBe(0.3);
    expect(config.maxRetries).toBe(0);
  });

  it('reads env vars when provided', () => {
    const config = resolveProviderConfig({
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4o',
      LLM_API_KEY: 'sk-test',
      LLM_TIMEOUT_MS: '8000',
      LLM_TEMPERATURE: '0.5',
      LLM_MAX_RETRIES: '2',
    });
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(config.apiKey).toBe('sk-test');
    expect(config.timeoutMs).toBe(8000);
    expect(config.temperature).toBe(0.5);
    expect(config.maxRetries).toBe(2);
  });

  // 多角色配置测试
  describe('多角色支持', () => {
    it('planner 角色使用 planner 默认 temperature', () => {
      const config = resolveProviderConfig({}, 'planner');
      expect(config.temperature).toBe(0.1);
    });

    it('reviewer 角色使用 reviewer 默认 temperature', () => {
      const config = resolveProviderConfig({}, 'reviewer');
      expect(config.temperature).toBe(0.0);
    });

    it('PLANNER_LLM_MODEL 覆盖 planner 但不影响 solver', () => {
      const env = { LLM_API_KEY: 'sk-test', PLANNER_LLM_MODEL: 'gpt-4o' };
      const planner = resolveProviderConfig(env, 'planner');
      const solver = resolveProviderConfig(env, 'solver');

      expect(planner.model).toBe('gpt-4o');
      expect(solver.model).toBe('gpt-4o-mini');
    });

    it('REVIEWER_LLM_* 全部独立配置', () => {
      const env = {
        LLM_API_KEY: 'sk-global',
        REVIEWER_LLM_API_KEY: 'sk-reviewer',
        REVIEWER_LLM_MODEL: 'gpt-4o',
        REVIEWER_LLM_TEMPERATURE: '0.2',
      };
      const reviewer = resolveProviderConfig(env, 'reviewer');

      expect(reviewer.apiKey).toBe('sk-reviewer');
      expect(reviewer.model).toBe('gpt-4o');
      expect(reviewer.temperature).toBe(0.2);
    });

    it('planner 在无 PLANNER_LLM_* 时 fallback 到 LLM_*', () => {
      const env = { LLM_API_KEY: 'sk-global', LLM_MODEL: 'gpt-4o' };
      const planner = resolveProviderConfig(env, 'planner');

      expect(planner.apiKey).toBe('sk-global');
      expect(planner.model).toBe('gpt-4o');
      // temperature 使用 planner 角色默认值
      expect(planner.temperature).toBe(0.1);
    });
  });
});

describe('resolveAllLlmConfigs', () => {
  it('返回三个独立角色配置', () => {
    const configs = resolveAllLlmConfigs({ LLM_API_KEY: 'sk-test' });

    expect(configs.solver).toBeDefined();
    expect(configs.planner).toBeDefined();
    expect(configs.reviewer).toBeDefined();
  });

  it('每个角色有正确的默认 temperature', () => {
    const configs = resolveAllLlmConfigs({});

    expect(configs.solver.temperature).toBe(0.3);
    expect(configs.planner.temperature).toBe(0.1);
    expect(configs.reviewer.temperature).toBe(0.0);
  });

  it('角色独立配置互不干扰', () => {
    const env = {
      LLM_API_KEY: 'sk-global',
      LLM_MODEL: 'gpt-4o-mini',
      PLANNER_LLM_MODEL: 'gpt-4o',
      REVIEWER_LLM_API_KEY: 'sk-reviewer',
    };
    const configs = resolveAllLlmConfigs(env);

    // solver 使用全局配置
    expect(configs.solver.model).toBe('gpt-4o-mini');
    expect(configs.solver.apiKey).toBe('sk-global');

    // planner 使用独立 model
    expect(configs.planner.model).toBe('gpt-4o');
    expect(configs.planner.apiKey).toBe('sk-global');

    // reviewer 使用独立 apiKey
    expect(configs.reviewer.apiKey).toBe('sk-reviewer');
    expect(configs.reviewer.model).toBe('gpt-4o-mini');
  });
});
