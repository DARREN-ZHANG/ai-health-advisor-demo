import { describe, it, expect } from 'vitest';
import type { ActivitySegment } from '@health-advisor/shared';
import {
  generateEventsForSegment,
  generateMealIntakeEvents,
  generateSteadyCardioEvents,
  generateProlongedSedentaryEvents,
  generateIntermittentExerciseEvents,
  generateWalkEvents,
  generateSleepEvents,
} from '../../helpers/activity-generators';

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
    source: 'god_mode',
    ...overrides,
  };
}

/** 检查所有事件的 measuredAt 是否在 segment 的时间范围内 */
function assertEventsInRange(
  events: Array<{ measuredAt: string }>,
  start: string,
  end: string,
): void {
  for (const e of events) {
    expect(
      e.measuredAt >= start && e.measuredAt <= end,
      `事件时间 ${e.measuredAt} 不在范围 [${start}, ${end}] 内`,
    ).toBe(true);
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('activity-generators', () => {
  describe('generateMealIntakeEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-meal-1',
      type: 'meal_intake',
      start: '2026-04-16T08:00',
      end: '2026-04-16T08:25',
    });

    it('should produce events within the segment time range', () => {
      const events = generateMealIntakeEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should produce heartRate events every minute', () => {
      const events = generateMealIntakeEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      // 25 分钟 = 25 个心率事件（每分钟一个，offset 0~24）
      expect(hrEvents.length).toBe(25);
    });

    it('should produce heartRate values in physiological range (65-85)', () => {
      const events = generateMealIntakeEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      for (const e of hrEvents) {
        expect(typeof e.value).toBe('number');
        expect(e.value as number).toBeGreaterThanOrEqual(55);
        expect(e.value as number).toBeLessThanOrEqual(95);
      }
    });

    it('should produce wearState events at start and end', () => {
      const events = generateMealIntakeEvents(segment);
      const wearEvents = events.filter((e) => e.metric === 'wearState');
      expect(wearEvents.length).toBe(2);
      expect(wearEvents[0]!.value).toBe(true);
      expect(wearEvents[1]!.value).toBe(false);
    });

    it('should produce spo2 events every 5 minutes', () => {
      const events = generateMealIntakeEvents(segment);
      const spo2Events = events.filter((e) => e.metric === 'spo2');
      // 25 分钟，每 5 分钟一次：0, 5, 10, 15, 20 = 5 次
      expect(spo2Events.length).toBe(5);
    });

    it('should produce motion events', () => {
      const events = generateMealIntakeEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      expect(motionEvents.length).toBeGreaterThan(0);
    });

    it('should include segmentId in all events', () => {
      const events = generateMealIntakeEvents(segment);
      for (const e of events) {
        expect(e.segmentId).toBe('seg-meal-1');
      }
    });
  });

  describe('generateSteadyCardioEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-cardio-1',
      type: 'steady_cardio',
      start: '2026-04-16T09:00',
      end: '2026-04-16T09:30',
    });

    it('should produce events within time range', () => {
      const events = generateSteadyCardioEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should produce elevated heartRate (110-160)', () => {
      const events = generateSteadyCardioEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      for (const e of hrEvents) {
        expect(e.value as number).toBeGreaterThanOrEqual(110);
        expect(e.value as number).toBeLessThanOrEqual(160);
      }
    });

    it('should produce cumulative steps (non-decreasing)', () => {
      const events = generateSteadyCardioEvents(segment);
      const stepEvents = events.filter((e) => e.metric === 'steps');
      for (let i = 1; i < stepEvents.length; i++) {
        expect(stepEvents[i]!.value as number).toBeGreaterThanOrEqual(
          stepEvents[i - 1]!.value as number,
        );
      }
    });

    it('should produce high motion values', () => {
      const events = generateSteadyCardioEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      const avgMotion =
        motionEvents.reduce((sum, e) => sum + (e.value as number), 0) / motionEvents.length;
      // 有氧运动时 IMU 衍生 motion 平均应该 > 0.1
      expect(avgMotion).toBeGreaterThan(0.1);
    });
  });

  describe('generateProlongedSedentaryEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-sedentary-1',
      type: 'prolonged_sedentary',
      start: '2026-04-16T10:00',
      end: '2026-04-16T11:30',
    });

    it('should produce events within time range', () => {
      const events = generateProlongedSedentaryEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should produce low heartRate (55-75)', () => {
      const events = generateProlongedSedentaryEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      for (const e of hrEvents) {
        expect(e.value as number).toBeGreaterThanOrEqual(55);
        expect(e.value as number).toBeLessThanOrEqual(75);
      }
    });

    it('should produce zero steps', () => {
      const events = generateProlongedSedentaryEvents(segment);
      const stepEvents = events.filter((e) => e.metric === 'steps');
      for (const e of stepEvents) {
        expect(e.value).toBe(0);
      }
    });

    it('should produce near-zero motion', () => {
      const events = generateProlongedSedentaryEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      for (const e of motionEvents) {
        expect(e.value as number).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('generateIntermittentExerciseEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-hiit-1',
      type: 'intermittent_exercise',
      start: '2026-04-16T14:00',
      end: '2026-04-16T14:25',
      params: { rounds: 8, activeMinutes: 2, restMinutes: 1 },
    });

    it('should produce events within time range', () => {
      const events = generateIntermittentExerciseEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should have alternating high/low heartRate periods', () => {
      const events = generateIntermittentExerciseEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      const hrValues = hrEvents.map((e) => e.value as number);

      // 应同时存在高心率 (>100) 和低心率 (<100)
      const hasHigh = hrValues.some((v) => v > 100);
      const hasLow = hrValues.some((v) => v < 100);
      expect(hasHigh).toBe(true);
      expect(hasLow).toBe(true);
    });

    it('should produce cumulative steps', () => {
      const events = generateIntermittentExerciseEvents(segment);
      const stepEvents = events.filter((e) => e.metric === 'steps');
      expect(stepEvents.length).toBeGreaterThan(0);
      // 最后一步应该 > 0（运动期间有步数）
      const lastSteps = stepEvents[stepEvents.length - 1]!.value as number;
      expect(lastSteps).toBeGreaterThan(0);
    });
  });

  describe('generateWalkEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-walk-1',
      type: 'walk',
      start: '2026-04-16T16:00',
      end: '2026-04-16T16:20',
    });

    it('should produce events within time range', () => {
      const events = generateWalkEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should produce moderate heartRate (80-120)', () => {
      const events = generateWalkEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      for (const e of hrEvents) {
        expect(e.value as number).toBeGreaterThanOrEqual(80);
        expect(e.value as number).toBeLessThanOrEqual(120);
      }
    });

    it('should produce steadily increasing steps', () => {
      const events = generateWalkEvents(segment);
      const stepEvents = events.filter((e) => e.metric === 'steps');
      expect(stepEvents.length).toBeGreaterThan(0);
      // 最后的累积步数应该明显 > 0
      const lastSteps = stepEvents[stepEvents.length - 1]!.value as number;
      expect(lastSteps).toBeGreaterThan(100);
    });

    it('should produce moderate motion values', () => {
      const events = generateWalkEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      const avgMotion =
        motionEvents.reduce((sum, e) => sum + (e.value as number), 0) / motionEvents.length;
      // 步行时 IMU 衍生 motion 平均应该 > 0.05
      expect(avgMotion).toBeGreaterThan(0.05);
    });
  });

  describe('generateSleepEvents', () => {
    const segment = makeSegment({
      segmentId: 'seg-sleep-1',
      type: 'sleep',
      start: '2026-04-16T22:00',
      end: '2026-04-17T06:00',
    });

    it('should produce events within time range', () => {
      const events = generateSleepEvents(segment);
      assertEventsInRange(events, segment.start, segment.end);
    });

    it('should produce low heartRate (45-75)', () => {
      const events = generateSleepEvents(segment);
      const hrEvents = events.filter((e) => e.metric === 'heartRate');
      for (const e of hrEvents) {
        expect(e.value as number).toBeGreaterThanOrEqual(45);
        expect(e.value as number).toBeLessThanOrEqual(75);
      }
    });

    it('should produce sleepStage transition events', () => {
      const events = generateSleepEvents(segment);
      const stageEvents = events.filter((e) => e.metric === 'sleepStage');
      // 应该有多次阶段转换
      expect(stageEvents.length).toBeGreaterThan(1);
    });

    it('should produce valid sleep stage values', () => {
      const events = generateSleepEvents(segment);
      const stageEvents = events.filter((e) => e.metric === 'sleepStage');
      const validStages = new Set(['light', 'deep', 'rem', 'awake']);
      for (const e of stageEvents) {
        expect(validStages.has(e.value as string)).toBe(true);
      }
    });

    it('should produce zero steps during sleep', () => {
      const events = generateSleepEvents(segment);
      const stepEvents = events.filter((e) => e.metric === 'steps');
      for (const e of stepEvents) {
        expect(e.value).toBe(0);
      }
    });

    it('should produce near-zero motion during sleep', () => {
      const events = generateSleepEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      for (const e of motionEvents) {
        expect(e.value as number).toBeLessThanOrEqual(1);
      }
    });

    it('should respect quality param', () => {
      const goodSleep = makeSegment({
        segmentId: 'seg-sleep-good',
        type: 'sleep',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
        params: { quality: 'good' },
      });
      const poorSleep = makeSegment({
        segmentId: 'seg-sleep-poor',
        type: 'sleep',
        start: '2026-04-16T22:00',
        end: '2026-04-17T06:00',
        params: { quality: 'poor' },
      });

      const goodEvents = generateSleepEvents(goodSleep);
      const poorEvents = generateSleepEvents(poorSleep);

      // 好睡眠的 awake 阶段应该少于差睡眠
      const goodAwake = goodEvents.filter(
        (e) => e.metric === 'sleepStage' && e.value === 'awake',
      ).length;
      const poorAwake = poorEvents.filter(
        (e) => e.metric === 'sleepStage' && e.value === 'awake',
      ).length;

      expect(goodAwake).toBeLessThanOrEqual(poorAwake);
    });
  });

  describe('determinism', () => {
    it('should produce identical output for identical input', () => {
      const segment = makeSegment({
        segmentId: 'seg-determ',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });

      const run1 = generateMealIntakeEvents(segment);
      const run2 = generateMealIntakeEvents(segment);

      expect(run1).toEqual(run2);
    });

    it('should produce deterministic output via generateEventsForSegment', () => {
      const segment = makeSegment({
        segmentId: 'seg-determ2',
        type: 'walk',
        start: '2026-04-16T16:00',
        end: '2026-04-16T16:20',
      });

      const run1 = generateEventsForSegment(segment);
      const run2 = generateEventsForSegment(segment);

      expect(run1).toEqual(run2);
    });
  });

  describe('generateEventsForSegment dispatch', () => {
    const types: ActivitySegment['type'][] = [
      'meal_intake',
      'steady_cardio',
      'prolonged_sedentary',
      'intermittent_exercise',
      'walk',
      'sleep',
    ];

    it.each(types)('should dispatch correctly for type: %s', (type) => {
      const segment = makeSegment({
        segmentId: `seg-dispatch-${type}`,
        type,
        start: '2026-04-16T08:00',
        end: type === 'sleep'
          ? '2026-04-16T10:00'
          : type === 'prolonged_sedentary'
            ? '2026-04-16T09:00'
            : '2026-04-16T08:30',
      });

      const events = generateEventsForSegment(segment);
      expect(events.length).toBeGreaterThan(0);

      // 所有事件应该包含 profileId
      for (const e of events) {
        expect(e.profileId).toBe('test-profile');
        expect(e.source).toBe('sensor');
      }
    });
  });

  describe('event format', () => {
    it('should generate eventId with correct pattern', () => {
      const segment = makeSegment({
        segmentId: 'seg-fmt-1',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:10',
      });

      const events = generateEventsForSegment(segment);
      for (const e of events) {
        expect(e.eventId).toMatch(/^evt-seg-fmt-1-\d+$/);
      }
    });

    it('should generate valid measuredAt timestamps', () => {
      const segment = makeSegment({
        segmentId: 'seg-fmt-2',
        type: 'walk',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:10',
      });

      const events = generateEventsForSegment(segment);
      for (const e of events) {
        expect(e.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      }
    });
  });
});
