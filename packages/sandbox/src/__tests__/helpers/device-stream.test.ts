import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProfile } from '../../loader';
import {
  getPendingSamples,
  getSamplesForSyncSession,
  materializeDeviceSamples,
  summarizeSyncSessions,
} from '../../helpers/device-stream';

const DATA_DIR = join(__dirname, '../../../../../data/sandbox');

describe('device-stream helpers', () => {
  it('materializes minute-level device samples from daily records', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
    const samples = materializeDeviceSamples(profile);

    expect(samples.length).toBeGreaterThan(20 * 1000);
    expect(samples[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(samples.some((sample) => sample.sleepStage)).toBe(true);
    expect(samples.some((sample) => sample.stepsDelta && sample.stepsDelta > 0)).toBe(true);
  });

  it('summarizes sync sessions with transferred sample counts', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
    const sessions = summarizeSyncSessions(profile);

    expect(sessions).toHaveLength(4);
    expect(sessions[0]?.sampleCount).toBeGreaterThan(0);
    expect(sessions[0]?.firstSampleAt).toBeTruthy();
    expect(sessions[0]?.lastSampleAt).toBeTruthy();
  });

  it('returns samples for a specific sync session', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
    const samples = getSamplesForSyncSession(profile, 'sync-a-001');

    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]?.timestamp >= '2026-03-27T22:30').toBe(true);
    expect(samples[samples.length - 1]?.timestamp <= '2026-04-01T23:59').toBe(true);
  });

  it('has no pending samples when all upload windows cover the full history', () => {
    const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
    expect(getPendingSamples(profile)).toEqual([]);
  });
});
