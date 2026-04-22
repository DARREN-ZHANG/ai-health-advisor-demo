import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadTimelineScriptFile, validateTimelineScript } from '../../helpers/timeline-script';
import type { ActivitySegment } from '@health-advisor/shared';

const DATA_DIR = join(__dirname, '../../../../../data/sandbox');

describe('loadTimelineScriptFile', () => {
  it('should load timeline script for profile-a', () => {
    const script = loadTimelineScriptFile(DATA_DIR, {
      file: 'timeline-scripts/profile-a-day-1.json',
    });

    expect(script.profileId).toBe('profile-a');
    expect(script.scriptId).toBe('profile-a-day-1');
    expect(script.initialDemoTime).toBe('2026-04-16T07:05');
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0]!.segmentId).toBe('seg-baseline-sleep-a');
    expect(script.segments[0]!.type).toBe('sleep');
  });

  it('should load timeline script for profile-b', () => {
    const script = loadTimelineScriptFile(DATA_DIR, {
      file: 'timeline-scripts/profile-b-day-1.json',
    });

    expect(script.profileId).toBe('profile-b');
    expect(script.initialDemoTime).toBe('2026-04-16T07:30');
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0]!.type).toBe('sleep');
  });

  it('should load timeline script for profile-c', () => {
    const script = loadTimelineScriptFile(DATA_DIR, {
      file: 'timeline-scripts/profile-c-day-1.json',
    });

    expect(script.profileId).toBe('profile-c');
    expect(script.initialDemoTime).toBe('2026-04-16T06:45');
    expect(script.segments).toHaveLength(1);
  });

  it('should throw for nonexistent file', () => {
    expect(() =>
      loadTimelineScriptFile(DATA_DIR, {
        file: 'timeline-scripts/nonexistent.json',
      }),
    ).toThrow();
  });
});

describe('validateTimelineScript', () => {
  const makeSegment = (
    overrides: Partial<ActivitySegment> & { segmentId: string },
  ): ActivitySegment => ({
    profileId: 'test-profile',
    type: 'sleep',
    start: '2026-04-16T22:00',
    end: '2026-04-17T06:00',
    source: 'baseline_script',
    ...overrides,
  });

  it('should pass for non-overlapping segments', () => {
    const segments = [
      makeSegment({
        segmentId: 'seg-1',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
      }),
      makeSegment({
        segmentId: 'seg-2',
        start: '2026-04-17T07:00',
        end: '2026-04-17T08:00',
        type: 'meal_intake',
      }),
    ];

    expect(() => validateTimelineScript(segments)).not.toThrow();
  });

  it('should pass for adjacent segments (end === start)', () => {
    const segments = [
      makeSegment({
        segmentId: 'seg-1',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
      }),
      makeSegment({
        segmentId: 'seg-2',
        start: '2026-04-17T06:00',
        end: '2026-04-17T07:00',
        type: 'walk',
      }),
    ];

    expect(() => validateTimelineScript(segments)).not.toThrow();
  });

  it('should throw for overlapping segments', () => {
    const segments = [
      makeSegment({
        segmentId: 'seg-1',
        start: '2026-04-16T22:00',
        end: '2026-04-17T07:00',
      }),
      makeSegment({
        segmentId: 'seg-2',
        start: '2026-04-17T06:00',
        end: '2026-04-17T08:00',
        type: 'meal_intake',
      }),
    ];

    expect(() => validateTimelineScript(segments)).toThrow('片段重叠');
  });

  it('should pass for single segment', () => {
    const segments = [
      makeSegment({
        segmentId: 'seg-1',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
      }),
    ];

    expect(() => validateTimelineScript(segments)).not.toThrow();
  });

  it('should pass for empty segments array', () => {
    expect(() => validateTimelineScript([])).not.toThrow();
  });

  it('should handle out-of-order segments (still validates overlap)', () => {
    const segments = [
      makeSegment({
        segmentId: 'seg-2',
        start: '2026-04-17T07:00',
        end: '2026-04-17T08:00',
        type: 'meal_intake',
      }),
      makeSegment({
        segmentId: 'seg-1',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
      }),
    ];

    // 排序后不重叠，应通过
    expect(() => validateTimelineScript(segments)).not.toThrow();
  });
});
