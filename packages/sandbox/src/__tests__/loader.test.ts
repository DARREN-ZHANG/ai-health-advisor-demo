import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadManifest, loadProfile, loadAllProfiles } from '../loader';

const DATA_DIR = join(__dirname, '../../../../data/sandbox');

describe('loadManifest', () => {
  it('should load and parse manifest.json', () => {
    const manifest = loadManifest(DATA_DIR);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.profiles).toHaveLength(3);
  });

  it('should contain expected profile entries', () => {
    const manifest = loadManifest(DATA_DIR);
    const ids = manifest.profiles.map((p) => p.profileId);

    expect(ids).toContain('profile-a');
    expect(ids).toContain('profile-b');
    expect(ids).toContain('profile-c');
  });
});

describe('loadProfile', () => {
  it('should load and validate profile-a', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');

    expect(profile.profile.profileId).toBe('profile-a');
    expect(profile.profile.name).toBe('张健康');
    expect(profile.profile.age).toBe(32);
    expect(profile.profile.gender).toBe('male');
    expect(profile.records).toHaveLength(14);
  });

  it('should load and validate profile-b', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-b.json');

    expect(profile.profile.profileId).toBe('profile-b');
    expect(profile.profile.gender).toBe('female');
    expect(profile.records).toHaveLength(14);
  });

  it('should load and validate profile-c', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-c.json');

    expect(profile.profile.profileId).toBe('profile-c');
    expect(profile.profile.age).toBe(28);
    expect(profile.records).toHaveLength(14);
  });

  it('should throw for invalid profile file', () => {
    expect(() => loadProfile(DATA_DIR, 'profiles/nonexistent.json')).toThrow();
  });
});

describe('loadAllProfiles', () => {
  it('should load all profiles into a Map', () => {
    const profiles = loadAllProfiles(DATA_DIR);

    expect(profiles.size).toBe(3);
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
