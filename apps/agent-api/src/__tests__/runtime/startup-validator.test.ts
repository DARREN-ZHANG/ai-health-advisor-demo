import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateStartupAssets } from '../../runtime/startup-validator';

// 创建临时测试数据目录
function createTestDir(structure: {
  manifest?: object;
  profiles?: Record<string, object>;
  fallbacks?: Record<string, object>;
  prompts?: Record<string, string>;
  scenarios?: object;
}) {
  const dir = join(tmpdir(), `startup-validator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // manifest
  if (structure.manifest) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(structure.manifest));
  }

  // profiles
  if (structure.profiles) {
    const profilesDir = join(dir, 'profiles');
    mkdirSync(profilesDir, { recursive: true });
    for (const [name, data] of Object.entries(structure.profiles)) {
      writeFileSync(join(profilesDir, `${name}.json`), JSON.stringify(data));
    }
  }

  // fallbacks
  if (structure.fallbacks) {
    const fallbacksDir = join(dir, 'fallbacks');
    mkdirSync(fallbacksDir, { recursive: true });
    for (const [name, data] of Object.entries(structure.fallbacks)) {
      writeFileSync(join(fallbacksDir, `${name}.json`), JSON.stringify(data));
    }
  }

  // prompts
  if (structure.prompts) {
    const promptsDir = join(dir, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    for (const [name, content] of Object.entries(structure.prompts)) {
      writeFileSync(join(promptsDir, name), content);
    }
  }

  // scenarios
  if (structure.scenarios) {
    const scenariosDir = join(dir, 'scenarios');
    mkdirSync(scenariosDir, { recursive: true });
    writeFileSync(join(scenariosDir, 'manifest.json'), JSON.stringify(structure.scenarios));
  }

  return dir;
}

/** 一个最小有效的 profile 数据（匹配 ProfileDataSchema） */
const validProfile = {
  profile: {
    profileId: 'test-profile',
    name: 'Test',
    age: 30,
    gender: 'male',
    avatar: 'avatar-1',
    tags: ['测试'],
    baseline: { restingHr: 65, hrv: 45, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
  },
  records: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-03-${String(28 + i).padStart(2, '0')}`,
  })),
};

const validManifest = {
  version: '1',
  profiles: [{ profileId: 'test-profile', name: 'Test', file: 'profiles/test-profile.json' }],
};

const validFallbackEntry = {
  summary: '健康状态正常',
  chartTokens: [],
  microTips: ['保持良好作息'],
};

describe('validateStartupAssets', () => {
  const dirsToCleanup: string[] = [];

  afterEach(() => {
    for (const dir of dirsToCleanup) {
      try { rmSync(dir, { recursive: true }); } catch { /* expected */ }
    }
    dirsToCleanup.length = 0;
  });

  function trackDir(dir: string) {
    dirsToCleanup.push(dir);
    return dir;
  }

  it('全部资产有效时返回空 fatal 和空 warnings', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
      prompts: {
        'system.md': 'system prompt',
        'homepage.md': 'homepage prompt',
        'view-summary.md': 'view summary prompt',
        'advisor-chat.md': 'chat prompt',
      },
      scenarios: {
        version: '1',
        scenarios: [{ scenarioId: 's1', label: 'Test', type: 'reset' }],
      },
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('manifest 缺失时产生致命错误', () => {
    const dir = trackDir(createTestDir({
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal).toContain('manifest.json not found');
  });

  it('fallback 文件缺失时产生致命错误', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        // 缺少 view-summary 和 advisor-chat
      },
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal.length).toBeGreaterThanOrEqual(2);
    expect(result.fatal.some((e) => e.includes('view-summary'))).toBe(true);
    expect(result.fatal.some((e) => e.includes('advisor-chat'))).toBe(true);
  });

  it('fallback 中 chartToken 无效时产生致命错误', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': { ...validFallbackEntry, chartTokens: ['INVALID_TOKEN'] } },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal.some((e) => e.includes('INVALID_TOKEN'))).toBe(true);
  });

  it('prompt 文件缺失时产生警告（不致命）', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
      scenarios: {
        version: '1',
        scenarios: [{ scenarioId: 's1', label: 'Test', type: 'reset' }],
      },
      // 不提供 prompts
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('prompts'))).toBe(true);
  });

  it('scenario manifest 缺失时产生致命错误', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
      prompts: {
        'system.md': 'prompt',
        'homepage.md': 'prompt',
        'view-summary.md': 'prompt',
        'advisor-chat.md': 'prompt',
      },
      // 不提供 scenarios
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal.some((e) => e.includes('scenarios'))).toBe(true);
  });

  it('scenario 类型无效时产生致命错误', () => {
    const dir = trackDir(createTestDir({
      manifest: validManifest,
      profiles: { 'test-profile': validProfile },
      fallbacks: {
        homepage: { 'test-profile': validFallbackEntry },
        'view-summary': { hrv: validFallbackEntry },
        'advisor-chat': { 'test-profile': validFallbackEntry },
      },
      prompts: {
        'system.md': 'prompt',
        'homepage.md': 'prompt',
        'view-summary.md': 'prompt',
        'advisor-chat.md': 'prompt',
      },
      scenarios: {
        version: '1',
        scenarios: [{ scenarioId: 's1', label: 'Bad', type: 'invalid_type' }],
      },
    }));

    const result = validateStartupAssets(dir);
    expect(result.fatal.some((e) => e.includes('invalid_type'))).toBe(true);
  });
});
