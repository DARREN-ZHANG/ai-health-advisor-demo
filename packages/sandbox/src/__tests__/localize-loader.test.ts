import { describe, it, expect } from 'vitest';
import { localizeProfile, localizeManifestEntry } from '../loader';
import type { SandboxProfile, LocalizableText } from '@health-advisor/shared';

describe('localizeProfile', () => {
  const profile: SandboxProfile = {
    profileId: 'test',
    name: { zh: '测试用户', en: 'Test User' },
    age: 30,
    gender: 'male',
    avatar: 'avatar.png',
    tags: [
      { zh: '健身达人', en: 'Fitness enthusiast' },
    ],
    baseline: {
      restingHr: 60,
      hrv: 50,
      spo2: 98,
      avgSleepMinutes: 480,
      avgSteps: 8000,
    },
  };

  it('展平 zh 返回中文名和标签', () => {
    const result = localizeProfile(profile, 'zh');
    expect(result.name).toBe('测试用户');
    expect(result.tags).toEqual(['健身达人']);
  });

  it('展平 en 返回英文名和标签', () => {
    const result = localizeProfile(profile, 'en');
    expect(result.name).toBe('Test User');
    expect(result.tags).toEqual(['Fitness enthusiast']);
  });

  it('保留其他字段不变', () => {
    const result = localizeProfile(profile, 'zh');
    expect(result.profileId).toBe('test');
    expect(result.age).toBe(30);
    expect(result.gender).toBe('male');
    expect(result.baseline.restingHr).toBe(60);
  });
});

describe('localizeManifestEntry', () => {
  it('展平 manifest entry 的 name', () => {
    const entry = {
      profileId: 'test',
      name: { zh: '测试', en: 'Test' },
      file: 'test.json',
    };
    expect(localizeManifestEntry(entry, 'zh').name).toBe('测试');
    expect(localizeManifestEntry(entry, 'en').name).toBe('Test');
  });

  it('保留 profileId 和 file 不变', () => {
    const entry = {
      profileId: 'test',
      name: { zh: '测试', en: 'Test' },
      file: 'test.json',
    };
    const result = localizeManifestEntry(entry, 'zh');
    expect(result.profileId).toBe('test');
    expect(result.file).toBe('test.json');
  });
});
