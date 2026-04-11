import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import path from 'node:path';
import { loadConfig } from '../../config/env';
import { createRuntimeRegistry } from '../../runtime/registry';
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
    expect(data.profile.name).toBe('张健康');
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

  it('scenarioRegistry 可用', () => {
    expect(registry.scenarioRegistry).toBeDefined();
    expect(registry.scenarioRegistry.list().length).toBeGreaterThan(0);
  });

  it('overrideStore 可用', () => {
    expect(registry.overrideStore.getCurrentProfileId()).toBeDefined();
  });
});
