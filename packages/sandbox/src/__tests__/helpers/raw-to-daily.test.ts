import { describe, it, expect } from 'vitest';
import type { ActivitySegment, DeviceEvent } from '@health-advisor/shared';
import { generateEventsForSegment } from '../../helpers/activity-generators';
import { aggregateDailyRecord, aggregateCurrentDayRecord, mergeIntradayData } from '../../helpers/raw-to-daily';

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

// ============================================================
// 测试套件
// ============================================================

describe('raw-to-daily', () => {
  describe('aggregateDailyRecord', () => {
    describe('心率聚合', () => {
      it('应从事件中提取心率并采样', () => {
        const segment = makeSegment({
          segmentId: 'seg-walk-hr',
          type: 'walk',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.hr).toBeDefined();
        expect(record.hr!.length).toBeGreaterThan(0);
        expect(record.hr!.length).toBeLessThanOrEqual(5);
        // 步行心率应在 80-120 范围内
        for (const hr of record.hr!) {
          expect(hr).toBeGreaterThanOrEqual(70);
          expect(hr).toBeLessThanOrEqual(130);
        }
      });
    });

    describe('睡眠数据', () => {
      it('应从睡眠阶段事件构建 SleepData', () => {
        const segment = makeSegment({
          segmentId: 'seg-sleep-agg',
          type: 'sleep',
          start: '2026-04-16T22:00',
          end: '2026-04-17T06:00',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.sleep).toBeDefined();
        expect(record.sleep!.totalMinutes).toBeGreaterThan(0);
        expect(record.sleep!.startTime).toBe('2026-04-16T22:00');
        expect(record.sleep!.stages).toBeDefined();
        expect(record.sleep!.stages.deep).toBeGreaterThanOrEqual(0);
        expect(record.sleep!.stages.light).toBeGreaterThanOrEqual(0);
        expect(record.sleep!.stages.rem).toBeGreaterThanOrEqual(0);
        expect(record.sleep!.stages.awake).toBeGreaterThanOrEqual(0);
        expect(record.sleep!.score).toBeGreaterThanOrEqual(0);
        expect(record.sleep!.score).toBeLessThanOrEqual(100);
      });
    });

    describe('活动聚合', () => {
      it('应从步数和运动事件构建 ActivityData', () => {
        const segment = makeSegment({
          segmentId: 'seg-cardio-agg',
          type: 'steady_cardio',
          start: '2026-04-16T09:00',
          end: '2026-04-16T09:30',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.activity).toBeDefined();
        expect(record.activity!.steps).toBeGreaterThan(0);
        expect(record.activity!.calories).toBeGreaterThan(0);
        expect(record.activity!.activeMinutes).toBeGreaterThan(0);
        expect(record.activity!.distanceKm).toBeGreaterThan(0);
      });

      it('久坐事件应产生低活动数据', () => {
        const segment = makeSegment({
          segmentId: 'seg-sed-agg',
          type: 'prolonged_sedentary',
          start: '2026-04-16T10:00',
          end: '2026-04-16T11:30',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.activity).toBeDefined();
        expect(record.activity!.steps).toBe(0);
      });
    });

    describe('血氧聚合', () => {
      it('应计算平均血氧', () => {
        const segment = makeSegment({
          segmentId: 'seg-walk-spo2',
          type: 'walk',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.spo2).toBeDefined();
        expect(record.spo2!).toBeGreaterThanOrEqual(90);
        expect(record.spo2!).toBeLessThanOrEqual(100);
      });
    });

    describe('压力聚合', () => {
      it('应估算压力值', () => {
        const segment = makeSegment({
          segmentId: 'seg-cardio-stress',
          type: 'steady_cardio',
          start: '2026-04-16T09:00',
          end: '2026-04-16T09:30',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');

        expect(record.stress).toBeDefined();
        expect(record.stress!.load).toBeGreaterThanOrEqual(0);
        expect(record.stress!.load).toBeLessThanOrEqual(100);
      });
    });

    describe('空事件', () => {
      it('空事件应返回仅含日期的最小 DailyRecord', () => {
        const record = aggregateDailyRecord([], '2026-04-16');
        expect(record).toEqual({ date: '2026-04-16' });
      });

      it('无匹配日期事件应返回仅含日期的记录', () => {
        const segment = makeSegment({
          segmentId: 'seg-other-day',
          type: 'walk',
          start: '2026-04-17T08:00',
          end: '2026-04-17T08:25',
        });
        const events = generateEventsForSegment(segment);
        const record = aggregateDailyRecord(events, '2026-04-16');
        expect(record).toEqual({ date: '2026-04-16' });
      });
    });

    describe('多片段聚合', () => {
      it('应聚合一天中多个片段的数据', () => {
        const segments: ActivitySegment[] = [
          makeSegment({
            segmentId: 'seg-day-meal',
            type: 'meal_intake',
            start: '2026-04-16T08:00',
            end: '2026-04-16T08:25',
          }),
          makeSegment({
            segmentId: 'seg-day-cardio',
            type: 'steady_cardio',
            start: '2026-04-16T09:00',
            end: '2026-04-16T09:30',
          }),
          makeSegment({
            segmentId: 'seg-day-walk',
            type: 'walk',
            start: '2026-04-16T16:00',
            end: '2026-04-16T16:20',
          }),
        ];
        const allEvents = segments.flatMap((s) => generateEventsForSegment(s));
        const record = aggregateDailyRecord(allEvents, '2026-04-16');

        expect(record.date).toBe('2026-04-16');
        expect(record.hr).toBeDefined();
        expect(record.hr!.length).toBeGreaterThan(0);
        expect(record.activity).toBeDefined();
        expect(record.activity!.steps).toBeGreaterThan(0);
        expect(record.spo2).toBeDefined();
      });
    });
  });

  describe('aggregateCurrentDayRecord', () => {
    it('应从 currentTime 提取日期并聚合', () => {
      const segment = makeSegment({
        segmentId: 'seg-current-day',
        type: 'walk',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const events = generateEventsForSegment(segment);
      const record = aggregateCurrentDayRecord(events, '2026-04-16T10:00');

      expect(record.date).toBe('2026-04-16');
      expect(record.hr).toBeDefined();
    });

    it('应只聚合当前日期的事件', () => {
      const segments: ActivitySegment[] = [
        makeSegment({
          segmentId: 'seg-today',
          type: 'walk',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        }),
        makeSegment({
          segmentId: 'seg-tomorrow',
          type: 'walk',
          start: '2026-04-17T08:00',
          end: '2026-04-17T08:25',
        }),
      ];
      const allEvents = segments.flatMap((s) => generateEventsForSegment(s));
      const record = aggregateCurrentDayRecord(allEvents, '2026-04-16T12:00');

      expect(record.date).toBe('2026-04-16');
      // 只包含 4/16 的事件，步数应只有一次步行
      expect(record.activity).toBeDefined();
    });
  });

  describe('mergeIntradayData', () => {
    /** 创建完整的 12 快照 intraday（模拟历史记录） */
    function makeCompleteIntraday(): IntradaySnapshot[] {
      return [
        { hour: 0, hr: 55, spo2: 96, steps: 0 },
        { hour: 2, hr: 53, spo2: 95, steps: 0 },
        { hour: 4, hr: 54, spo2: 96, steps: 0 },
        { hour: 6, hr: 58, spo2: 97, steps: 10 },
        { hour: 8, hr: 72, spo2: 98, steps: 800 },
        { hour: 10, hr: 68, spo2: 97, steps: 1200 },
        { hour: 12, hr: 75, spo2: 98, steps: 3500 },
        { hour: 14, hr: 70, spo2: 97, steps: 4200 },
        { hour: 16, hr: 85, spo2: 97, steps: 6800 },
        { hour: 18, hr: 78, spo2: 98, steps: 8500 },
        { hour: 20, hr: 65, spo2: 97, steps: 9200 },
        { hour: 22, hr: 60, spo2: 96, steps: 9500 },
      ];
    }

    it('聚合数据覆盖历史数据，空缺时段保留历史值', () => {
      // 模拟：聚合 intraday 只有 0-6 点（睡眠）有数据，其余只有 hour
      const aggregated: IntradaySnapshot[] = [
        { hour: 0, hr: 56, spo2: 96, steps: 0 },
        { hour: 2, hr: 55, spo2: 96, steps: 0 },
        { hour: 4, hr: 54, spo2: 95, steps: 0 },
        { hour: 6, hr: 57, spo2: 97, steps: 0 },
        { hour: 8 },
        { hour: 10 },
        { hour: 12 },
        { hour: 14 },
        { hour: 16 },
        { hour: 18 },
        { hour: 20 },
        { hour: 22 },
      ];
      const historical = makeCompleteIntraday();

      const merged = mergeIntradayData(historical, aggregated);

      // 合并后仍是 12 个快照
      expect(merged).toHaveLength(12);
      // 索引对应 base 的 hour 顺序：[0, 2, 4, 6, 8, 10, ...]
      // 索引 0 = hour 0，索引 1 = hour 2：使用聚合数据（实时值）
      expect(merged[0]!.hr).toBe(56);
      expect(merged[1]!.hr).toBe(55);
      // 索引 4 = hour 8，索引 8 = hour 16：使用历史数据（补充）
      expect(merged[4]!.hr).toBe(72);
      expect(merged[4]!.steps).toBe(800);
      expect(merged[8]!.hr).toBe(85);
      expect(merged[8]!.steps).toBe(6800);
      expect(merged[10]!.hr).toBe(65);
    });

    it('无聚合数据时完全使用历史 intraday', () => {
      const historical = makeCompleteIntraday();
      const aggregated: IntradaySnapshot[] = [];

      const merged = mergeIntradayData(historical, aggregated);

      expect(merged).toHaveLength(12);
      expect(merged[0]!.hr).toBe(55);
      expect(merged[4]!.hr).toBe(72);
    });

    it('无历史数据时完全使用聚合 intraday', () => {
      const aggregated: IntradaySnapshot[] = [
        { hour: 0, hr: 56 },
        { hour: 2 },
      ];
      const merged = mergeIntradayData([], aggregated);

      expect(merged).toHaveLength(2);
      expect(merged[0]!.hr).toBe(56);
    });
  });
});
