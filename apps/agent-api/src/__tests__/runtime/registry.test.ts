import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import path from 'node:path';
import { loadConfig } from '../../config/env';
import { createRuntimeRegistry, toProviderEnv } from '../../runtime/registry';
import { metricsPlugin } from '../../plugins/metrics';
import { requestContextPlugin } from '../../plugins/request-context';
import type { RuntimeRegistry } from '../../runtime/registry';

// vitest 从 apps/agent-api 运行，需要回溯到 monorepo 根
const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('RuntimeRegistry', () => {
  let registry: RuntimeRegistry;

  beforeAll(async () => {
    const config = loadConfig({
      FALLBACK_ONLY_MODE: 'true',
      DATA_DIR,
    });

    const app = Fastify();
    await app.register(requestContextPlugin);
    await app.register(metricsPlugin);

    registry = createRuntimeRegistry(config, app.metrics);
  });

  it('加载了至少 3 个 profiles', () => {
    expect(registry.profiles.size).toBeGreaterThanOrEqual(3);
  });

  it('getProfile 返回有效的 profile 数据', () => {
    const data = registry.getProfile('profile-a');
    expect(data.profile.profileId).toBe('profile-a');
    expect(data.profile.name.zh.length).toBeGreaterThan(0);
    expect(data.profile.name.en.length).toBeGreaterThan(0);
    expect(data.records.length).toBeGreaterThan(0);
  });

  it('getRawProfile 返回不含 override 的原始数据', () => {
    const data = registry.getRawProfile('profile-a');
    expect(data.profile.profileId).toBe('profile-a');
  });

  it('getActiveOverrides 初始为空', () => {
    expect(registry.getActiveOverrides('profile-a')).toHaveLength(0);
  });

  it('getInjectedEvents 初始为空', () => {
    expect(registry.getInjectedEvents('profile-a')).toHaveLength(0);
  });

  it('sessionMemory 可用', () => {
    expect(registry.sessionMemory).toBeDefined();
    expect(typeof registry.sessionMemory.appendMessage).toBe('function');
  });

  it('analyticalMemory 可用', () => {
    expect(registry.analyticalMemory).toBeDefined();
    expect(typeof registry.analyticalMemory.setHomepageBrief).toBe('function');
  });

  it('agent 可调用', () => {
    expect(registry.agent).toBeDefined();
    expect(typeof registry.agent.invoke).toBe('function');
  });

  it('promptLoader 可用', () => {
    expect(registry.promptLoader).toBeDefined();
    expect(registry.promptLoader.listAvailable().length).toBeGreaterThan(0);
  });

  it('fallbackEngine 可用', () => {
    expect(registry.fallbackEngine).toBeDefined();
    expect(typeof registry.fallbackEngine.getFallback).toBe('function');
  });

  it('overrideStore 可用', () => {
    expect(registry.overrideStore.getCurrentProfileId()).toBeDefined();
  });

  it('当前日发生同步后保留已观测 HRV，不用 dailyBaseline 覆盖', () => {
    const clock = registry.overrideStore.getDemoClock('profile-a');
    const currentDate = clock.currentTime.slice(0, 10);
    const rawCurrentDay = registry.getRawProfile('profile-a').records.find((record) => record.date === currentDate);

    expect(rawCurrentDay?.hrv).toBeDefined();

    try {
      registry.overrideStore.performSync('profile-a', 'manual_refresh');
      const currentDay = registry.getProfile('profile-a').records.find((record) => record.date === currentDate);

      expect(currentDay?.hrv).toBeDefined();
      expect(currentDay?.hrv).toBe(rawCurrentDay!.hrv);
    } finally {
      registry.overrideStore.reset('all');
    }
  });

  it('does not overwrite observed current-day aggregate values with dailyBaseline after activity sync', () => {
    try {
      registry.overrideStore.appendSegment(
        'profile-a',
        'deep_focus',
        { durationMinutes: 120 },
        0,
        { durationMinutes: 120, advanceClock: true },
      );
      registry.overrideStore.performSync('profile-a', 'manual_refresh');

      const profile = registry.getProfile('profile-a');
      const currentDate = registry.overrideStore.getDemoClock('profile-a').currentTime.slice(0, 10);
      const currentDay = profile.records.find((record) => record.date === currentDate);
      const dailyBaseline = registry.getRawProfile('profile-a').profile.dailyBaseline;

      expect(currentDay?.hrv).toBeDefined();
      expect(dailyBaseline?.hrv).toBeDefined();
      expect(currentDay?.hrv).not.toBe(dailyBaseline?.hrv);
    } finally {
      registry.overrideStore.reset('all');
    }
  });

  it('provider env 包含自定义 base URL', () => {
    const config = loadConfig({
      FALLBACK_ONLY_MODE: 'false',
      LLM_API_KEY: 'sk-test',
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'glm-4.7',
      LLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
      LLM_TIMEOUT_MS: '60000',
      DATA_DIR,
    });

    expect(toProviderEnv(config)).toMatchObject({
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'glm-4.7',
      LLM_API_KEY: 'sk-test',
      LLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
      LLM_TIMEOUT_MS: '60000',
    });
  });
});
