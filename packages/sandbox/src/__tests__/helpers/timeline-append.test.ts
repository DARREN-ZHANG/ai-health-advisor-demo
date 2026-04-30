import { describe, it, expect } from 'vitest';
import type { ActivitySegment } from '@health-advisor/shared';
import { appendSegment } from '../../helpers/timeline-append';
import { createRawEventRepository } from '../../helpers/raw-event-repository';

// ============================================================
// 测试用辅助函数
// ============================================================

/** 创建测试用 ActivitySegment */
function makeSegment(
  overrides: Partial<ActivitySegment> & { segmentId: string },
): ActivitySegment {
  return {
    profileId: 'test-profile',
    type: 'walk',
    start: '2026-04-16T08:00',
    end: '2026-04-16T08:25',
    source: 'baseline_script',
    ...overrides,
  };
}

// ============================================================
// appendSegment 测试
// ============================================================

describe('appendSegment', () => {
  const profileId = 'profile-a';
  const initialTime = '2026-04-16T07:00';

  it('should advance currentTime after append', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
    );

    // meal_intake 默认 20 分钟（与文档 §8.3 对齐）
    expect(result.newCurrentTime).toBe('2026-04-16T07:20');
  });

  it('should generate events for the new segment', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
    );

    expect(result.events.length).toBeGreaterThan(0);
  });

  it('should add the new segment to the segments list', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
    );

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.type).toBe('meal_intake');
    expect(result.segments[0]!.profileId).toBe(profileId);
    expect(result.segments[0]!.source).toBe('god_mode');
  });

  it('should not modify the input segments array', () => {
    const existing: ActivitySegment[] = [
      makeSegment({
        segmentId: 'seg-existing',
        start: '2026-04-16T05:00',
        end: '2026-04-16T06:00',
      }),
    ];

    const result = appendSegment(
      existing,
      initialTime,
      'walk',
      profileId,
    );

    // 原始数组不应被修改
    expect(existing).toHaveLength(1);
    // 结果应包含新旧片段
    expect(result.segments).toHaveLength(2);
  });

  it('should throw for negative offsetMinutes', () => {
    expect(() =>
      appendSegment([], initialTime, 'walk', profileId, undefined, -1),
    ).toThrow('offsetMinutes 不能为负数');
  });

  it('should throw for overlapping segments', () => {
    const existing: ActivitySegment[] = [
      makeSegment({
        segmentId: 'seg-existing',
        type: 'sleep',
        start: '2026-04-16T06:00',
        end: '2026-04-16T08:00',
      }),
    ];

    // currentTime = 07:00, 新片段从 07:00 开始
    // existing 结束于 08:00，存在重叠
    expect(() =>
      appendSegment(existing, '2026-04-16T07:00', 'walk', profileId),
    ).toThrow('重叠');
  });

  it('should not throw for adjacent (non-overlapping) segments', () => {
    const existing: ActivitySegment[] = [
      makeSegment({
        segmentId: 'seg-existing',
        type: 'sleep',
        start: '2026-04-16T05:00',
        end: '2026-04-16T07:00',
      }),
    ];

    // 新片段从 07:00 开始，刚好紧接 existing 的结束时间
    expect(() =>
      appendSegment(existing, '2026-04-16T07:00', 'walk', profileId),
    ).not.toThrow();
  });

  it('should use offsetMinutes to delay start', () => {
    const result = appendSegment(
      [],
      initialTime,
      'walk',
      profileId,
      undefined,
      10,
    );

    // walk 默认 30 分钟（与文档 §8.3 对齐），从 07:00+10 = 07:10 开始
    expect(result.segments[0]!.start).toBe('2026-04-16T07:10');
    expect(result.newCurrentTime).toBe('2026-04-16T07:40');
  });

  it('should generate unique segment IDs', () => {
    let currentTime = initialTime;
    const allSegments: ActivitySegment[] = [];
    const segmentIds = new Set<string>();

    // 连续追加多个片段
    const types: Array<{
      type: ActivitySegment['type'];
      start: string;
      end: string;
    }> = [];

    const result1 = appendSegment(allSegments, currentTime, 'meal_intake', profileId);
    currentTime = result1.newCurrentTime;
    types.push({ type: 'meal_intake', start: result1.segments[0]!.start, end: result1.segments[0]!.end });
    for (const seg of result1.segments) segmentIds.add(seg.segmentId);

    const result2 = appendSegment(result1.segments, currentTime, 'walk', profileId);
    currentTime = result2.newCurrentTime;
    types.push({ type: 'walk', start: result2.segments[1]!.start, end: result2.segments[1]!.end });
    for (const seg of result2.segments) segmentIds.add(seg.segmentId);

    const result3 = appendSegment(result2.segments, currentTime, 'steady_cardio', profileId);
    for (const seg of result3.segments) segmentIds.add(seg.segmentId);

    // 所有 segmentId 应唯一
    expect(segmentIds.size).toBe(result3.segments.length);
  });

  it('should support multiple sequential appends correctly', () => {
    let currentTime = '2026-04-16T07:00';
    let segments: ActivitySegment[] = [];

    // 追加 meal_intake (20 min，文档 §8.3 默认)
    const r1 = appendSegment(segments, currentTime, 'meal_intake', profileId);
    segments = r1.segments;
    currentTime = r1.newCurrentTime;
    expect(currentTime).toBe('2026-04-16T07:20');

    // 追加 walk (30 min，文档 §8.3 默认)
    const r2 = appendSegment(segments, currentTime, 'walk', profileId);
    segments = r2.segments;
    currentTime = r2.newCurrentTime;
    expect(currentTime).toBe('2026-04-16T07:50');

    // 追加 prolonged_sedentary (240 min，文档 §8.3 默认)
    const r3 = appendSegment(segments, currentTime, 'prolonged_sedentary', profileId);
    segments = r3.segments;
    currentTime = r3.newCurrentTime;
    expect(currentTime).toBe('2026-04-16T11:50');

    // 验证总共有 3 个片段
    expect(segments).toHaveLength(3);

    // 验证片段不重叠
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.start >= segments[i - 1]!.end).toBe(true);
    }
  });

  it('should use default durations for each segment type', () => {
    // 与文档 §8.3 对齐的默认时长
    const defaultDurations: Record<string, number> = {
      meal_intake: 20,
      steady_cardio: 15,
      prolonged_sedentary: 240,
      intermittent_exercise: 30,
      walk: 30,
      sleep: 480,
      deep_focus: 120,
      anxiety_episode: 30,
      breathing_pause: 15,
      alcohol_intake: 180,
      caffeine_intake: 240,
      nightmare: 30,
      relaxation: 30,
    };

    const types = Object.keys(defaultDurations) as ActivitySegment['type'][];

    for (const type of types) {
      const result = appendSegment([], initialTime, type, profileId);
      const segment = result.segments[0]!;
      const duration = diffMinutes(segment.start, segment.end);
      expect(duration).toBe(defaultDurations[type]!);
    }
  });

  it('should use options.durationMinutes if provided', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
      undefined,
      0,
      { durationMinutes: 40 },
    );

    const segment = result.segments[0]!;
    const duration = diffMinutes(segment.start, segment.end);
    expect(duration).toBe(40);
    expect(result.newCurrentTime).toBe('2026-04-16T07:40');
  });

  it('should not advance clock when advanceClock is false', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
      undefined,
      0,
      { advanceClock: false },
    );

    // 片段仍然被创建（20 分钟），但 currentTime 不推进
    const segment = result.segments[0]!;
    const duration = diffMinutes(segment.start, segment.end);
    expect(duration).toBe(20);
    expect(result.newCurrentTime).toBe(initialTime);
  });

  it('should advance clock by default', () => {
    const result = appendSegment(
      [],
      initialTime,
      'meal_intake',
      profileId,
    );

    expect(result.newCurrentTime).toBe('2026-04-16T07:20');
  });

  it('should support both durationMinutes and advanceClock together', () => {
    const result = appendSegment(
      [],
      initialTime,
      'walk',
      profileId,
      undefined,
      5,
      { durationMinutes: 15, advanceClock: false },
    );

    // 片段从 07:05 开始，持续 15 分钟到 07:20
    const segment = result.segments[0]!;
    expect(segment.start).toBe('2026-04-16T07:05');
    expect(segment.end).toBe('2026-04-16T07:20');
    // 但时钟不推进
    expect(result.newCurrentTime).toBe(initialTime);
  });

  it('should generate segment ID with correct prefix', () => {
    const result = appendSegment(
      [],
      initialTime,
      'walk',
      profileId,
    );

    expect(result.segments[0]!.segmentId).toMatch(/^seg-gm-walk-/);
  });

  it('should pass params to the segment', () => {
    const params = { pace: 'brisk', targetSteps: 3000 };
    const result = appendSegment(
      [],
      initialTime,
      'walk',
      profileId,
      params,
    );

    expect(result.segments[0]!.params).toEqual(params);
  });
});

// ============================================================
// RawEventRepository 测试
// ============================================================

describe('RawEventRepository', () => {
  it('should add and retrieve all events', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
      { eventId: 'e2', profileId: 'p1', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 72, source: 'sensor' },
    ]);

    const all = repo.getAllEvents();
    expect(all).toHaveLength(2);
  });

  it('should sort events by measuredAt', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e2', profileId: 'p1', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 72, source: 'sensor' },
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
      { eventId: 'e3', profileId: 'p1', measuredAt: '2026-04-16T08:05', metric: 'heartRate', value: 75, source: 'sensor' },
    ]);

    const all = repo.getAllEvents();
    expect(all[0]!.eventId).toBe('e1');
    expect(all[1]!.eventId).toBe('e2');
    expect(all[2]!.eventId).toBe('e3');
  });

  it('should filter events by profileId', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
      { eventId: 'e2', profileId: 'p2', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 80, source: 'sensor' },
      { eventId: 'e3', profileId: 'p1', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 72, source: 'sensor' },
    ]);

    const p1Events = repo.getEventsByProfile('p1');
    expect(p1Events).toHaveLength(2);

    const p2Events = repo.getEventsByProfile('p2');
    expect(p2Events).toHaveLength(1);
  });

  it('should filter events by time range', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
      { eventId: 'e2', profileId: 'p1', measuredAt: '2026-04-16T08:10', metric: 'heartRate', value: 72, source: 'sensor' },
      { eventId: 'e3', profileId: 'p1', measuredAt: '2026-04-16T08:20', metric: 'heartRate', value: 75, source: 'sensor' },
    ]);

    const range = repo.getEventsByRange('p1', '2026-04-16T08:05', '2026-04-16T08:15');
    expect(range).toHaveLength(1);
    expect(range[0]!.eventId).toBe('e2');
  });

  it('should filter events by segmentId', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor', segmentId: 'seg-1' },
      { eventId: 'e2', profileId: 'p1', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 72, source: 'sensor', segmentId: 'seg-1' },
      { eventId: 'e3', profileId: 'p1', measuredAt: '2026-04-16T08:05', metric: 'heartRate', value: 75, source: 'sensor', segmentId: 'seg-2' },
    ]);

    const seg1Events = repo.getEventsBySegment('seg-1');
    expect(seg1Events).toHaveLength(2);

    const seg2Events = repo.getEventsBySegment('seg-2');
    expect(seg2Events).toHaveLength(1);
  });

  it('should clear all events', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
    ]);

    repo.clear();
    expect(repo.getAllEvents()).toHaveLength(0);
  });

  it('should return a copy from getAllEvents (immutable)', () => {
    const repo = createRawEventRepository();
    repo.addEvents([
      { eventId: 'e1', profileId: 'p1', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70, source: 'sensor' },
    ]);

    const all = repo.getAllEvents();
    expect(all).not.toBe(repo.getAllEvents()); // 不同的引用
    expect(all).toEqual(repo.getAllEvents()); // 但内容相同
  });

  it('should work with appendSegment integration', () => {
    const repo = createRawEventRepository();
    const result = appendSegment([], '2026-04-16T07:00', 'walk', 'profile-a');

    repo.addEvents(result.events);

    const profileEvents = repo.getEventsByProfile('profile-a');
    expect(profileEvents.length).toBeGreaterThan(0);

    const segmentEvents = repo.getEventsBySegment(result.segments[0]!.segmentId);
    expect(segmentEvents.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 辅助函数
// ============================================================

function diffMinutes(start: string, end: string): number {
  // 使用本地时间构造，与源码一致
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}
