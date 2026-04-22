import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProfile } from '../../loader';
import type { ProfileData } from '@health-advisor/shared';
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

  describe('with sync sessions', () => {
    // 构造一个带有 device syncSessions 的 ProfileData 用于测试
    function makeProfileWithSync(): ProfileData {
      const base = loadProfile(DATA_DIR, 'profiles/profile-a.json');
      return {
        ...base,
        device: {
          samplingIntervalMinutes: 1,
          syncSessions: [
            {
              syncId: 'sync-a-001',
              connectedAt: '2026-03-27T22:30',
              disconnectedAt: '2026-04-01T23:59',
              uploadedRange: { start: '2026-03-27T22:30', end: '2026-04-01T23:59' },
            },
            {
              syncId: 'sync-a-002',
              connectedAt: '2026-04-02T00:00',
              disconnectedAt: '2026-04-07T23:59',
              uploadedRange: { start: '2026-04-02T00:00', end: '2026-04-07T23:59' },
            },
            {
              syncId: 'sync-a-003',
              connectedAt: '2026-04-08T00:00',
              disconnectedAt: '2026-04-12T23:59',
              uploadedRange: { start: '2026-04-08T00:00', end: '2026-04-12T23:59' },
            },
            {
              syncId: 'sync-a-004',
              connectedAt: '2026-04-13T00:00',
              disconnectedAt: '2026-04-17T23:59',
              uploadedRange: { start: '2026-04-13T00:00', end: '2026-04-17T23:59' },
            },
          ],
        },
      };
    }

    it('summarizes sync sessions with transferred sample counts', () => {
      const profile = makeProfileWithSync();
      const sessions = summarizeSyncSessions(profile);

      expect(sessions).toHaveLength(4);
      expect(sessions[0]?.sampleCount).toBeGreaterThan(0);
      expect(sessions[0]?.firstSampleAt).toBeTruthy();
      expect(sessions[0]?.lastSampleAt).toBeTruthy();
    });

    it('returns samples for a specific sync session', () => {
      const profile = makeProfileWithSync();
      const samples = getSamplesForSyncSession(profile, 'sync-a-001');

      expect(samples.length).toBeGreaterThan(0);
      expect(samples[0]?.timestamp >= '2026-03-27T22:30').toBe(true);
      expect(samples[samples.length - 1]?.timestamp <= '2026-04-01T23:59').toBe(true);
    });

    it('has no pending samples when all upload windows cover the full history', () => {
      const profile = makeProfileWithSync();
      expect(getPendingSamples(profile)).toEqual([]);
    });
  });

  describe('without sync sessions', () => {
    it('returns empty sync session summaries when device is undefined', () => {
      const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
      const sessions = summarizeSyncSessions(profile);

      expect(sessions).toHaveLength(0);
    });

    it('returns all samples as pending when device is undefined', () => {
      const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');
      const pending = getPendingSamples(profile);

      expect(pending.length).toBeGreaterThan(0);
    });

    it('throws when requesting samples for a non-existent sync session', () => {
      const profile = loadProfile(DATA_DIR, 'profiles/profile-a.json');

      expect(() => getSamplesForSyncSession(profile, 'sync-a-001')).toThrow(
        'Sync session not found: sync-a-001',
      );
    });
  });
});
