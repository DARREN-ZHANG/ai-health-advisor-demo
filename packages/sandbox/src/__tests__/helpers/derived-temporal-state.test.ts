import { describe, it, expect } from 'vitest';
import type { RecognizedEvent } from '@health-advisor/shared';
import { computeDerivedTemporalStates } from '../../helpers/derived-temporal-state';

// ============================================================
// 测试用辅助函数
// ============================================================

/** 创建测试用 RecognizedEvent */
function makeRecognizedEvent(
  overrides: Partial<RecognizedEvent> & { recognizedEventId: string; type: RecognizedEvent['type'] },
): RecognizedEvent {
  return {
    profileId: 'test-profile',
    start: '2026-04-16T08:00',
    end: '2026-04-16T08:25',
    confidence: 0.8,
    evidence: ['测试证据'],
    ...overrides,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('derived-temporal-state', () => {
  const profileId = 'test-profile';

  describe('recent_meal_30m', () => {
    it('进餐在 30 分钟内结束应产生 recent_meal_30m 状态', () => {
      const mealEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-meal-1',
        type: 'meal_intake',
        end: '2026-04-16T12:25',
      });
      const currentTime = '2026-04-16T12:45'; // 进餐结束 20 分钟后

      const results = computeDerivedTemporalStates(
        [mealEvent],
        currentTime,
        profileId,
      );

      expect(results.length).toBe(1);
      expect(results[0]!.type).toBe('recent_meal_30m');
      expect(results[0]!.profileId).toBe(profileId);
      expect(results[0]!.sourceRecognizedEventId).toBe('re-seg-meal-1');
      expect(results[0]!.activeAt).toBe('2026-04-16T12:25');
      expect(results[0]!.metadata).toEqual({ mealEnd: '2026-04-16T12:25' });
    });

    it('进餐刚好在 30 分钟前结束应产生状态', () => {
      const mealEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-meal-2',
        type: 'meal_intake',
        end: '2026-04-16T12:00',
      });
      const currentTime = '2026-04-16T12:30'; // 恰好 30 分钟

      const results = computeDerivedTemporalStates(
        [mealEvent],
        currentTime,
        profileId,
      );

      expect(results.length).toBe(1);
      expect(results[0]!.type).toBe('recent_meal_30m');
    });

    it('进餐超过 30 分钟前结束不应产生状态', () => {
      const mealEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-meal-3',
        type: 'meal_intake',
        end: '2026-04-16T12:00',
      });
      const currentTime = '2026-04-16T12:31'; // 31 分钟后

      const results = computeDerivedTemporalStates(
        [mealEvent],
        currentTime,
        profileId,
      );

      expect(results).toEqual([]);
    });

    it('进餐结束时间在未来不应产生状态', () => {
      const mealEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-meal-4',
        type: 'meal_intake',
        end: '2026-04-16T13:00',
      });
      const currentTime = '2026-04-16T12:00'; // 进餐还未结束

      const results = computeDerivedTemporalStates(
        [mealEvent],
        currentTime,
        profileId,
      );

      expect(results).toEqual([]);
    });
  });

  describe('非进餐事件', () => {
    it('睡眠事件不应产生派生状态', () => {
      const sleepEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-sleep-1',
        type: 'sleep',
        end: '2026-04-16T07:00',
      });
      const currentTime = '2026-04-16T07:10';

      const results = computeDerivedTemporalStates(
        [sleepEvent],
        currentTime,
        profileId,
      );

      expect(results).toEqual([]);
    });

    it('有氧运动事件不应产生派生状态', () => {
      const cardioEvent = makeRecognizedEvent({
        recognizedEventId: 're-seg-cardio-1',
        type: 'steady_cardio',
        end: '2026-04-16T09:30',
      });
      const currentTime = '2026-04-16T09:40';

      const results = computeDerivedTemporalStates(
        [cardioEvent],
        currentTime,
        profileId,
      );

      expect(results).toEqual([]);
    });
  });

  describe('多个事件', () => {
    it('多个进餐事件在 30 分钟内应产生多个状态', () => {
      const events: RecognizedEvent[] = [
        makeRecognizedEvent({
          recognizedEventId: 're-meal-a',
          type: 'meal_intake',
          end: '2026-04-16T08:25',
        }),
        makeRecognizedEvent({
          recognizedEventId: 're-meal-b',
          type: 'meal_intake',
          end: '2026-04-16T12:20',
        }),
      ];
      const currentTime = '2026-04-16T12:30';

      const results = computeDerivedTemporalStates(events, currentTime, profileId);

      // 只有第二个进餐在 30 分钟内（12:20 → 12:30 = 10 分钟）
      // 第一个进餐已超过 30 分钟（08:25 → 12:30 = 245 分钟）
      expect(results.length).toBe(1);
      expect(results[0]!.sourceRecognizedEventId).toBe('re-meal-b');
    });

    it('不同 profile 的事件应被过滤', () => {
      const mealEvent = makeRecognizedEvent({
        recognizedEventId: 're-meal-other',
        type: 'meal_intake',
        end: '2026-04-16T12:20',
        profileId: 'other-profile',
      });
      const currentTime = '2026-04-16T12:30';

      const results = computeDerivedTemporalStates(
        [mealEvent],
        currentTime,
        profileId,
      );

      expect(results).toEqual([]);
    });
  });

  describe('空输入', () => {
    it('空事件列表应返回空结果', () => {
      const results = computeDerivedTemporalStates(
        [],
        '2026-04-16T12:00',
        profileId,
      );
      expect(results).toEqual([]);
    });
  });
});
