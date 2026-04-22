import { describe, it, expect } from 'vitest';
import type { ActivitySegment, DeviceEvent, RecognizedEvent } from '@health-advisor/shared';
import { generateEventsForSegment } from '../../helpers/activity-generators';
import { recognizeEvents } from '../../helpers/event-recognition';

// ============================================================
// 测试用辅助函数
// ============================================================

/** 创建测试用 ActivitySegment */
function makeSegment(
  overrides: Partial<ActivitySegment> & { segmentId: string; type: ActivitySegment['type'] },
): ActivitySegment {
  return {
    profileId: 'test-profile',
    start: '2026-04-16T08:00',
    end: '2026-04-16T08:25',
    source: 'baseline_script',
    ...overrides,
  };
}

/** 从多个 segment 生成事件并合并 */
function generateAllEvents(segments: ActivitySegment[]): DeviceEvent[] {
  return segments.flatMap((seg) => generateEventsForSegment(seg));
}

// ============================================================
// 测试套件
// ============================================================

describe('event-recognition', () => {
  const profileId = 'test-profile';
  const currentTime = '2026-04-17T08:00';

  describe('睡眠识别', () => {
    it('应识别睡眠片段为 sleep 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-sleep-1',
        type: 'sleep',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      // 应该识别出至少一个事件
      expect(results.length).toBeGreaterThan(0);

      const sleepEvent = results.find((r) => r.type === 'sleep');
      expect(sleepEvent).toBeDefined();
      expect(sleepEvent!.type).toBe('sleep');
      expect(sleepEvent!.confidence).toBeGreaterThan(0);
      expect(sleepEvent!.confidence).toBeLessThanOrEqual(1);
      expect(sleepEvent!.start).toBe('2026-04-16T22:00');
      expect(sleepEvent!.sourceSegmentId).toBe('seg-sleep-1');
    });

    it('睡眠事件应包含心率等证据', () => {
      const segment = makeSegment({
        segmentId: 'seg-sleep-2',
        type: 'sleep',
        start: '2026-04-16T23:00',
        end: '2026-04-17T07:00',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);
      const sleepEvent = results.find((r) => r.type === 'sleep');

      expect(sleepEvent).toBeDefined();
      expect(sleepEvent!.evidence.length).toBeGreaterThan(0);
    });
  });

  describe('进餐识别', () => {
    it('应识别进餐片段为 meal_intake 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-meal-1',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const mealEvent = results.find((r) => r.type === 'meal_intake');
      expect(mealEvent).toBeDefined();
      expect(mealEvent!.type).toBe('meal_intake');
      expect(mealEvent!.confidence).toBeGreaterThan(0);
      expect(mealEvent!.start).toBe('2026-04-16T08:00');
      expect(mealEvent!.end).toBe('2026-04-16T08:25');
      expect(mealEvent!.sourceSegmentId).toBe('seg-meal-1');
    });
  });

  describe('稳态有氧识别', () => {
    it('应识别有氧运动片段为 steady_cardio 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-cardio-1',
        type: 'steady_cardio',
        start: '2026-04-16T09:00',
        end: '2026-04-16T09:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const cardioEvent = results.find((r) => r.type === 'steady_cardio');
      expect(cardioEvent).toBeDefined();
      expect(cardioEvent!.type).toBe('steady_cardio');
      expect(cardioEvent!.confidence).toBeGreaterThan(0);
      expect(cardioEvent!.confidence).toBeLessThanOrEqual(1);
    });

    it('有氧运动时间范围应正确', () => {
      const segment = makeSegment({
        segmentId: 'seg-cardio-2',
        type: 'steady_cardio',
        start: '2026-04-16T09:00',
        end: '2026-04-16T09:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);
      const cardioEvent = results.find((r) => r.type === 'steady_cardio');

      expect(cardioEvent!.start).toBe('2026-04-16T09:00');
      expect(cardioEvent!.end).toBe('2026-04-16T09:30');
    });
  });

  describe('步行识别', () => {
    it('应识别步行为 walk 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-walk-1',
        type: 'walk',
        start: '2026-04-16T16:00',
        end: '2026-04-16T16:20',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const walkEvent = results.find((r) => r.type === 'walk');
      expect(walkEvent).toBeDefined();
      expect(walkEvent!.confidence).toBeGreaterThan(0);
    });
  });

  describe('久坐识别', () => {
    it('应识别久坐为 prolonged_sedentary 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-sedentary-1',
        type: 'prolonged_sedentary',
        start: '2026-04-16T10:00',
        end: '2026-04-16T11:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const sedEvent = results.find((r) => r.type === 'prolonged_sedentary');
      expect(sedEvent).toBeDefined();
      expect(sedEvent!.confidence).toBeGreaterThan(0);
    });
  });

  describe('间歇运动识别', () => {
    it('应识别间歇运动为 intermittent_exercise 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-04-16T14:00',
        end: '2026-04-16T14:25',
        params: { rounds: 8, activeMinutes: 2, restMinutes: 1 },
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const hiitEvent = results.find((r) => r.type === 'intermittent_exercise');
      expect(hiitEvent).toBeDefined();
      expect(hiitEvent!.confidence).toBeGreaterThan(0);
    });
  });

  describe('多片段混合', () => {
    it('应同时识别多种活动', () => {
      const segments = [
        makeSegment({
          segmentId: 'seg-mix-sleep',
          type: 'sleep',
          start: '2026-04-16T22:00',
          end: '2026-04-17T06:00',
        }),
        makeSegment({
          segmentId: 'seg-mix-meal',
          type: 'meal_intake',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        }),
        makeSegment({
          segmentId: 'seg-mix-cardio',
          type: 'steady_cardio',
          start: '2026-04-16T09:00',
          end: '2026-04-16T09:30',
        }),
      ];
      const allEvents = generateAllEvents(segments);
      const results = recognizeEvents(allEvents, profileId, currentTime);

      // 应该识别出 3 个不同类型
      const types = new Set(results.map((r) => r.type));
      expect(types.has('sleep')).toBe(true);
      expect(types.has('meal_intake')).toBe(true);
      expect(types.has('steady_cardio')).toBe(true);
      expect(results.length).toBe(3);
    });
  });

  describe('边界情况', () => {
    it('空事件列表应返回空结果', () => {
      const results = recognizeEvents([], profileId, currentTime);
      expect(results).toEqual([]);
    });

    it('不同 profile 的事件应被过滤', () => {
      const segment = makeSegment({
        segmentId: 'seg-other',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, 'other-profile', currentTime);
      expect(results).toEqual([]);
    });

    it('每个识别事件应有正确的 ID 格式', () => {
      const segment = makeSegment({
        segmentId: 'seg-id-test',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      for (const r of results) {
        expect(r.recognizedEventId).toMatch(/^re-/);
        expect(r.profileId).toBe(profileId);
      }
    });
  });
});
