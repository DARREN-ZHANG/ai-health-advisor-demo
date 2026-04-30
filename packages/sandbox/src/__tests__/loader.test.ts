import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadManifest, loadProfile, loadAllProfiles, buildInitialProfileState } from '../loader';

const DATA_DIR = join(__dirname, '../../../../data/sandbox');

describe('loadManifest', () => {
  it('should load and parse manifest.json', () => {
    const manifest = loadManifest(DATA_DIR);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.profiles).toHaveLength(4);
  });

  it('should contain expected profile entries', () => {
    const manifest = loadManifest(DATA_DIR);
    const ids = manifest.profiles.map((p) => p.profileId);

    expect(ids).toContain('profile-a');
    expect(ids).toContain('profile-b');
    expect(ids).toContain('profile-c');
    expect(ids).toContain('profile-d');
  });
});

describe('loadProfile', () => {
  it('should load and validate profile-a from new structure', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');

    expect(profile.profile.profileId).toBe('profile-a');
    expect(profile.profile.name).toEqual({ zh: '林巅峰', en: 'Lin Dianfeng' });
    expect(profile.profile.age).toBe(28);
    expect(profile.profile.gender).toBe('male');
    // 新版结构从 historyRef 加载 records
    expect(profile.records).toHaveLength(31);
    // 新版结构 device 为 undefined（由 timeline script sync 元数据构建）
    expect(profile.device).toBeUndefined();
  });

  it('should load and validate profile-b from new structure', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-b.json');

    expect(profile.profile.profileId).toBe('profile-b');
    expect(profile.profile.gender).toBe('male');
    expect(profile.records).toHaveLength(31);
  });

  it('should load and validate profile-c from new structure', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-c.json');

    expect(profile.profile.profileId).toBe('profile-c');
    expect(profile.profile.age).toBe(26);
    expect(profile.records).toHaveLength(31);
  });

  it('should throw for invalid profile file', () => {
    expect(() => loadProfile(DATA_DIR, 'profiles/nonexistent.json')).toThrow();
  });

  it('each record should have a valid date format', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');

    for (const record of profile.records) {
      expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('loadAllProfiles', () => {
  it('should load all profiles into a Map', () => {
    const profiles = loadAllProfiles(DATA_DIR);

    expect(profiles.size).toBe(4);
    expect(profiles.has('profile-a')).toBe(true);
    expect(profiles.has('profile-b')).toBe(true);
    expect(profiles.has('profile-c')).toBe(true);
  });

  it('each profile should have valid records', () => {
    const profiles = loadAllProfiles(DATA_DIR);

    for (const [, data] of profiles) {
      expect(data.records.length).toBeGreaterThan(0);
      for (const record of data.records) {
        expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe('buildInitialProfileState', () => {
  it('should build complete initial state for profile-a', () => {
    const state = buildInitialProfileState(DATA_DIR, 'profile-a');

    // ProfileData
    expect(state.profileData.profile.profileId).toBe('profile-a');
    expect(state.profileData.records).toHaveLength(31);

    // DemoClock
    expect(state.demoClock.profileId).toBe('profile-a');
    expect(state.demoClock.currentTime).toBe('2026-04-24T07:05');
    expect(state.demoClock.timezone).toBe('Asia/Shanghai');

    // Segments
    expect(state.segments.length).toBeGreaterThan(0);
    expect(state.segments[0]!.segmentId).toBe('seg-baseline-sleep-a');
    expect(state.segments[0]!.type).toBe('sleep');

    // DeviceBuffer
    expect(state.deviceBuffer.profileId).toBe('profile-a');
    expect(state.deviceBuffer.lastSyncedMeasuredAt).toBeNull();

    // SyncSessions
    expect(state.syncSessions).toEqual([]);
  });

  it('should build complete initial state for profile-b', () => {
    const state = buildInitialProfileState(DATA_DIR, 'profile-b');

    expect(state.profileData.profile.profileId).toBe('profile-b');
    expect(state.demoClock.currentTime).toBe('2026-04-24T08:00');
    expect(state.segments.length).toBeGreaterThan(0);
    expect(state.deviceBuffer.lastSyncedMeasuredAt).toBeNull();
  });

  it('should build complete initial state for profile-c', () => {
    const state = buildInitialProfileState(DATA_DIR, 'profile-c');

    expect(state.profileData.profile.profileId).toBe('profile-c');
    expect(state.demoClock.currentTime).toBe('2026-04-24T06:00');
    expect(state.deviceBuffer.lastSyncedMeasuredAt).toBeNull();
  });

  it('should throw for unknown profile', () => {
    expect(() => buildInitialProfileState(DATA_DIR, 'nonexistent')).toThrow(
      'Profile 未找到: nonexistent',
    );
  });
});
