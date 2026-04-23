import { describe, it, expect } from 'vitest';
import { createScenarioRegistry } from '../../runtime/scenario-registry';
import path from 'node:path';

// vitest 从 apps/agent-api 运行，需要回溯到 monorepo 根
const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('ScenarioRegistry', () => {
  it('加载并列举所有场景', () => {
    const registry = createScenarioRegistry(DATA_DIR);
    const scenarios = registry.list();
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    expect(scenarios.some((s) => s.scenarioId === 'switch-to-stress')).toBe(true);
  });

  it('getById 返回指定场景', () => {
    const registry = createScenarioRegistry(DATA_DIR);
    const scenario = registry.getById('switch-to-stress');
    expect(scenario).toBeDefined();
    expect(scenario!.type).toBe('profile_switch');
    expect(scenario!.payload).toHaveProperty('profileId');
  });

  it('getById 未知 ID 返回 undefined', () => {
    const registry = createScenarioRegistry(DATA_DIR);
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('demo_script 类型包含 steps', () => {
    const registry = createScenarioRegistry(DATA_DIR);
    const scenario = registry.getById('demo-stress-journey');
    expect(scenario).toBeDefined();
    expect(scenario!.type).toBe('demo_script');
    expect(scenario!.steps).toBeDefined();
    expect(scenario!.steps!.length).toBeGreaterThan(0);
  });
});
