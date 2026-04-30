import { describe, it, expect } from 'vitest';
import { getProfile, listProfiles } from '../../selectors/profile';
import type { ProfileData, LocalizableText } from '@health-advisor/shared';
import type { SandboxProfile } from '@health-advisor/shared';

function makeProfileData(id: string, name: LocalizableText, age: number): ProfileData {
  return {
    profile: {
      profileId: id,
      name,
      age,
      gender: 'male',
      avatar: `avatar-${id}.png`,
      tags: [{ zh: '测试标签', en: 'Test Tag' }],
      baseline: { restingHr: 60, hrv: 55, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
    } satisfies SandboxProfile,
    records: [
      { date: '2026-04-01', hr: [60, 62], spo2: 98 },
      { date: '2026-04-02', hr: [61, 63], spo2: 97 },
    ],
  };
}

describe('getProfile', () => {
  it('should return profile when found', () => {
    const profiles = new Map<string, ProfileData>();
    const data = makeProfileData('test-1', { zh: '测试用户', en: 'Test User' }, 30);
    profiles.set('test-1', data);

    const result = getProfile(profiles, 'test-1');
    expect(result).toBe(data);
  });

  it('should throw when profile not found', () => {
    const profiles = new Map<string, ProfileData>();

    expect(() => getProfile(profiles, 'nonexistent')).toThrow('Profile not found: nonexistent');
  });
});

describe('listProfiles', () => {
  it('should return summary for all profiles', () => {
    const profiles = new Map<string, ProfileData>();
    profiles.set('test-1', makeProfileData('test-1', { zh: '用户A', en: 'User A' }, 25));
    profiles.set('test-2', makeProfileData('test-2', { zh: '用户B', en: 'User B' }, 35));

    const summary = listProfiles(profiles);

    expect(summary).toHaveLength(2);
    expect(summary.map((s) => s.profileId)).toEqual(expect.arrayContaining(['test-1', 'test-2']));
  });

  it('should include correct record counts', () => {
    const profiles = new Map<string, ProfileData>();
    profiles.set('test-1', makeProfileData('test-1', { zh: '用户A', en: 'User A' }, 25));

    const summary = listProfiles(profiles);

    expect(summary[0]!.recordCount).toBe(2);
  });

  it('should return empty array for empty map', () => {
    const profiles = new Map<string, ProfileData>();

    expect(listProfiles(profiles)).toEqual([]);
  });

  it('默认 zh 语言返回中文名', () => {
    const profiles = new Map<string, ProfileData>();
    profiles.set('test-1', makeProfileData('test-1', { zh: '用户A', en: 'User A' }, 25));

    const summary = listProfiles(profiles);

    expect(summary[0]!.name).toBe('用户A');
  });

  it('en 语言返回英文名', () => {
    const profiles = new Map<string, ProfileData>();
    profiles.set('test-1', makeProfileData('test-1', { zh: '用户A', en: 'User A' }, 25));

    const summary = listProfiles(profiles, 'en');

    expect(summary[0]!.name).toBe('User A');
  });
});
