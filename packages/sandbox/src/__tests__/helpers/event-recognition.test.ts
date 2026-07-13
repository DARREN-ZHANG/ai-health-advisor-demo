import { describe, it, expect } from 'vitest';
import type { ActivitySegment, DeviceEvent, RecognizedEvent, SensorObservation, BaselineMetrics } from '@health-advisor/shared';
import { generateEventsForSegment } from '../../helpers/activity-generators';
import {
  recognizeEvents,
  aggregatePerMinute,
  detectCandidateWindows,
  weightedIntervalScheduling,
  mergeAdjacentSameType,
} from '../../helpers/event-recognition';
import { appendMicroEvent } from '../../helpers/micro-event-append';

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
      // 任务 1.2：识别器从无标签观察估算边界，start 可能有 1 分钟偏差
      expect(sleepEvent!.start).toBe('2026-04-16T22:00');
      // 任务 1.2：sensor 推断路径不暴露 sourceSegmentId
      expect(sleepEvent!.sourceSegmentId).toBeUndefined();
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
      // 任务 1.2：边界由 PELT 变化点估算，最后有数据的分钟为 08:24（08:25 只有 wearState）
      expect(mealEvent!.start).toBe('2026-04-16T08:00');
      expect(mealEvent!.end).toBe('2026-04-16T08:24');
      // 任务 1.2：sensor 推断路径不暴露 sourceSegmentId
      expect(mealEvent!.sourceSegmentId).toBeUndefined();
    });
  });

  describe('稳态有氧识别', () => {
    it('任务 1.3：steady_cardio 因与 intermittent_exercise 混淆而 publishable=false，不进入输出', () => {
      // 校准 artifact 显示 steady_cardio 在验证集上达不到 0.95 precision
      // （intermittent_exercise 活跃期被误分类为 steady_cardio）
      // 因此 steady_cardio 一律不发布
      const segment = makeSegment({
        segmentId: 'seg-cardio-1',
        type: 'steady_cardio',
        start: '2026-04-16T09:00',
        end: '2026-04-16T09:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const cardioEvent = results.find((r) => r.type === 'steady_cardio');
      // 不应出现在输出中（publishable=false）
      expect(cardioEvent).toBeUndefined();
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

  describe('力量训练识别', () => {
    it('应识别力量训练为 strength_training 类型', () => {
      const segment = makeSegment({
        segmentId: 'seg-strength-1',
        type: 'strength_training',
        start: '2026-04-16T10:00',
        end: '2026-04-16T10:30',
        params: { setMinutes: 1, restMinutes: 2 },
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const strengthEvent = results.find((r) => r.type === 'strength_training');
      expect(strengthEvent).toBeDefined();
      expect(strengthEvent!.confidence).toBeGreaterThan(0);
    });

    it('HIIT 不应被误识别为 strength_training', () => {
      const segment = makeSegment({
        segmentId: 'seg-hiit-2',
        type: 'intermittent_exercise',
        start: '2026-04-16T14:00',
        end: '2026-04-16T14:25',
        params: { rounds: 8, activeMinutes: 2, restMinutes: 1 },
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const strengthEvent = results.find((r) => r.type === 'strength_training');
      // HIIT 步数高，不应被识别为力量训练
      expect(strengthEvent).toBeUndefined();
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

      // 任务 1.3：steady_cardio 在校准后 publishable=false，不进入输出
      // 应该识别出 sleep 和 meal_intake
      const types = new Set(results.map((r) => r.type));
      expect(types.has('sleep')).toBe(true);
      expect(types.has('meal_intake')).toBe(true);
      // steady_cardio 因混淆不发布
      expect(types.has('steady_cardio')).toBe(false);
      expect(results.length).toBe(2);
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

  // ============================================================
  // 咖啡因摄入检测测试
  // ============================================================

  describe('咖啡因摄入检测', () => {
    /** 生成咖啡因摄入的事件数据（加上前置基线） */
    function generateCaffeineScenario(
      dose: 'light' | 'moderate' | 'high_or_sensitive' = 'moderate',
    ): { events: DeviceEvent[]; caffeineStart: string } {
      // 先生成一段低活动基线（07:00~08:00）作为 baseline
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline',
        type: 'prolonged_sedentary',
        start: '2026-04-16T07:00',
        end: '2026-04-16T08:00',
      });

      // 生成咖啡因摄入段（08:00~12:00）
      const caffeineSegment = makeSegment({
        segmentId: 'seg-caffeine-test',
        type: 'caffeine_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T12:00',
        params: { dose },
      });

      const baselineEvents = generateEventsForSegment(baselineSegment);
      const caffeineEvents = generateEventsForSegment(caffeineSegment);
      const events = [...baselineEvents, ...caffeineEvents];
      return { events, caffeineStart: '2026-04-16T08:00' };
    }

    it('moderate 咖啡因响应应生成 possible_caffeine_intake 且 confidence >= 0.72', () => {
      const { events } = generateCaffeineScenario('moderate');
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeDefined();
      expect(caffeineEvent!.confidence).toBeGreaterThanOrEqual(0.72);
      expect(caffeineEvent!.evidence.length).toBeGreaterThan(0);
      expect(caffeineEvent!.evidence[0]).toContain('caffeine');
    });

    it('high_or_sensitive 与 moderate 均应识别为 possible_caffeine_intake（任务 1.3：校准后概率分布）', () => {
      const { events: modEvents } = generateCaffeineScenario('moderate');
      const { events: highEvents } = generateCaffeineScenario('high_or_sensitive');

      const modResults = recognizeEvents(modEvents, profileId, currentTime);
      const highResults = recognizeEvents(highEvents, profileId, currentTime);

      const modCaffeine = modResults.find((r) => r.type === 'possible_caffeine_intake');
      const highCaffeine = highResults.find((r) => r.type === 'possible_caffeine_intake');

      expect(modCaffeine).toBeDefined();
      expect(highCaffeine).toBeDefined();
      // 任务 1.3：校准后 confidence 是 isotonic 概率
      // moderate 和 high_or_sensitive 都满足发布阈值，校准概率均 >= publishThreshold(0.77)
      expect(modCaffeine!.confidence).toBeGreaterThanOrEqual(0.77);
      expect(highCaffeine!.confidence).toBeGreaterThanOrEqual(0.77);
    });

    it('light 默认不应生成 public event（或 confidence 较低）', () => {
      const { events } = generateCaffeineScenario('light');
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      // light 的响应可能不够强，不应达到 0.72 阈值
      if (caffeineEvent) {
        expect(caffeineEvent.confidence).toBeLessThan(0.72);
      }
      // 即使没有 caffeine event 也是可以接受的
    });

    it('无 hrvRmssd 数据不应生成 caffeine event', () => {
      const { events } = generateCaffeineScenario('moderate');
      // 过滤掉 hrvRmssd 事件
      const noRmssd = events.filter((e) => e.metric !== 'hrvRmssd');
      const results = recognizeEvents(noRmssd, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeUndefined();
    });

    it('运动重叠不应生成 caffeine event', () => {
      // 生成咖啡因数据，但在 response 窗口内注入高运动事件
      const { events } = generateCaffeineScenario('moderate');

      // 添加运动事件覆盖 response 窗口
      const exerciseSegment = makeSegment({
        segmentId: 'seg-exercise',
        type: 'steady_cardio',
        start: '2026-04-16T08:30',
        end: '2026-04-16T09:30',
      });
      const exerciseEvents = generateEventsForSegment(exerciseSegment);

      const allEvents = [...events, ...exerciseEvents];
      const results = recognizeEvents(allEvents, profileId, currentTime);

      // 高运动数据可能让 caffeine 检测失败（低活动条件不满足）
      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      // 运动混杂下不应输出，或者如果输出则 confidence 应该很低
      if (caffeineEvent) {
        // 不应该有高 confidence 的 caffeine 事件
        expect(caffeineEvent.confidence).toBeLessThan(0.72);
      }
    });

    it('SpO2 明显下降不应生成 caffeine event', () => {
      const { events } = generateCaffeineScenario('moderate');
      // 添加低 SpO2 事件
      const lowSpo2Events: DeviceEvent[] = [];
      for (let m = 15; m <= 120; m += 5) {
        const time = `2026-04-16T${String(8 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        lowSpo2Events.push({
          eventId: `evt-low-spo2-${m}`,
          profileId,
          measuredAt: time,
          metric: 'spo2',
          value: 92, // 明显低于基线 97
          source: 'sensor',
        });
      }

      const allEvents = [...events, ...lowSpo2Events];
      const results = recognizeEvents(allEvents, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeUndefined();
    });

    it('drink_intake 单独不应生成 caffeine event', () => {
      // 只生成 meal_intake 事件，没有咖啡因生理响应
      const segment = makeSegment({
        segmentId: 'seg-drink-only',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeUndefined();
    });

    it('不应使用 segmentId 文本判断咖啡因', () => {
      const { events } = generateCaffeineScenario('moderate');
      // 将 segmentId 改成无关名称
      const maskedEvents = events.map((e) => ({
        ...e,
        segmentId: e.segmentId?.replace(/caffeine/gi, 'unknown'),
      }));

      const results = recognizeEvents(maskedEvents, profileId, currentTime);
      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      // 即使 segmentId 不包含 caffeine，只要数据特征匹配就应该能识别
      expect(caffeineEvent).toBeDefined();
      expect(caffeineEvent!.confidence).toBeGreaterThanOrEqual(0.72);
    });

    it('baseline 窗口包含睡眠时 HR 应使用伪基线（避免 delta 偏高）', () => {
      // 模拟 God Mode 早晨场景：睡眠段 + 咖啡因段
      // 睡眠 HR（~58bpm）低于清醒静息 HR（~68bpm）
      // 如果用睡眠 HR 作 baseline，delta 会虚高（+24bpm）
      // 正确行为：检测到 baseline 有 sleep stages → 使用伪基线 HR

      // 1. 睡眠段 05:00~08:00，HR 偏低
      const sleepSegment = makeSegment({
        segmentId: 'seg-sleep-morning',
        type: 'sleep',
        start: '2026-04-16T05:00',
        end: '2026-04-16T08:00',
      });

      // 2. 咖啡因段 08:00~12:00
      const caffeineSegment = makeSegment({
        segmentId: 'seg-morning-coffee',
        type: 'caffeine_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T12:00',
        params: { dose: 'moderate' },
      });

      const sleepEvents = generateEventsForSegment(sleepSegment);
      const caffeineEvents = generateEventsForSegment(caffeineSegment);
      const events = [...sleepEvents, ...caffeineEvents];

      const results = recognizeEvents(events, profileId, currentTime);
      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');

      expect(caffeineEvent).toBeDefined();
      expect(caffeineEvent!.confidence).toBeGreaterThanOrEqual(0.72);

      // 从 evidence 中提取 HR delta
      const hrEvidence = caffeineEvent!.evidence.find((e) => e.includes('HR +'));
      expect(hrEvidence).toBeDefined();
      const hrDeltaMatch = hrEvidence!.match(/HR \+(\d+)bpm/);
      expect(hrDeltaMatch).toBeDefined();
      const hrDelta = parseInt(hrDeltaMatch![1], 10);

      // 使用伪基线后，HR delta 应该在合理范围内（moderate 剂量 8-14bpm）
      // 不应出现 +20bpm 以上的虚高值（来自睡眠 baseline）
      expect(hrDelta).toBeLessThanOrEqual(18);

      // evidence 应标注使用了 HR 伪基线
      expect(caffeineEvent!.evidence.some((e) =>
        e.includes('HR baseline estimated from early response data'),
      )).toBe(true);
    });

    it('数据空白期 + 伪基线兜底应仍能检测咖啡因', () => {
      // 模拟实际 demo 场景：睡眠段 21:05~07:05，咖啡因段 12:15~16:15
      // 07:05~12:15 之间无任何事件（数据空白），基线窗口无数据
      // 正确行为：伪基线窗口（吸收延迟期 m=0~15）有 m=0 基线事件可用
      const sleepSegment = makeSegment({
        segmentId: 'seg-sleep-gap',
        type: 'sleep',
        start: '2026-04-16T21:05',
        end: '2026-04-17T07:05',
      });
      const caffeineSegment = makeSegment({
        segmentId: 'seg-afternoon-coffee',
        type: 'caffeine_intake',
        start: '2026-04-17T12:15',
        end: '2026-04-17T16:15',
        params: { dose: 'moderate' },
      });

      const events = [...generateEventsForSegment(sleepSegment), ...generateEventsForSegment(caffeineSegment)];
      const results = recognizeEvents(events, profileId, '2026-04-17T16:15');
      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');

      expect(caffeineEvent).toBeDefined();
      expect(caffeineEvent!.confidence).toBeGreaterThanOrEqual(0.72);
      // 检测到的摄入时间应接近咖啡因段开始时间（12:15）
      expect(caffeineEvent!.start).toMatch(/^2026-04-17T12:1/);
    });

    it('response 窗口重叠睡眠时应排除', () => {
      // 基线窗口可以重叠睡眠（早晨场景），但 response 窗口不应重叠睡眠
      // 模拟：睡眠段延伸到 response 窗口内（t0+15~t0+120）
      const sleepSegment = makeSegment({
        segmentId: 'seg-sleep-long',
        type: 'sleep',
        start: '2026-04-16T04:00',
        end: '2026-04-16T09:30', // 延伸到咖啡因 response 窗口
      });
      const caffeineSegment = makeSegment({
        segmentId: 'seg-caffeine',
        type: 'caffeine_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T12:00',
        params: { dose: 'moderate' },
      });

      const events = [
        ...generateEventsForSegment(sleepSegment),
        ...generateEventsForSegment(caffeineSegment),
      ];
      const results = recognizeEvents(events, profileId, currentTime);
      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');

      // response 窗口有睡眠 → 应排除
      expect(caffeineEvent).toBeUndefined();
    });
  });

  // ============================================================
  // 饮酒摄入检测测试
  // ============================================================

  describe('饮酒摄入检测', () => {
    /** 生成饮酒摄入的事件数据（加上前置基线） */
    function generateAlcoholScenario(
      amount: 'light' | 'moderate' | 'heavy' = 'moderate',
    ): { events: DeviceEvent[]; alcoholStart: string } {
      // 先生成一段低活动基线（07:00~08:00）作为 baseline
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline',
        type: 'prolonged_sedentary',
        start: '2026-04-16T07:00',
        end: '2026-04-16T08:00',
      });

      // 生成饮酒摄入段（08:00~11:00）
      const alcoholSegment = makeSegment({
        segmentId: 'seg-alcohol-test',
        type: 'alcohol_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T11:00',
        params: { amount },
      });

      const baselineEvents = generateEventsForSegment(baselineSegment);
      const alcoholEvents = generateEventsForSegment(alcoholSegment);
      const events = [...baselineEvents, ...alcoholEvents];
      return { events, alcoholStart: '2026-04-16T08:00' };
    }

    it('moderate 酒精响应应生成 possible_alcohol_intake 且 confidence >= 0.70', () => {
      const { events } = generateAlcoholScenario('moderate');
      const results = recognizeEvents(events, profileId, currentTime);

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeDefined();
      expect(alcoholEvent!.confidence).toBeGreaterThanOrEqual(0.70);
      expect(alcoholEvent!.evidence.length).toBeGreaterThan(0);
      expect(alcoholEvent!.evidence[0]).toContain('alcohol');
    });

    it('heavy 与 moderate 均应识别为 possible_alcohol_intake（任务 1.3：校准后概率分布）', () => {
      const { events: modEvents } = generateAlcoholScenario('moderate');
      const { events: heavyEvents } = generateAlcoholScenario('heavy');

      const modResults = recognizeEvents(modEvents, profileId, currentTime);
      const heavyResults = recognizeEvents(heavyEvents, profileId, currentTime);

      const modAlcohol = modResults.find((r) => r.type === 'possible_alcohol_intake');
      const heavyAlcohol = heavyResults.find((r) => r.type === 'possible_alcohol_intake');

      expect(modAlcohol).toBeDefined();
      expect(heavyAlcohol).toBeDefined();
      // 任务 1.3：校准后 confidence 是 isotonic 概率
      // moderate 和 heavy 都满足发布阈值，校准概率均 >= publishThreshold(0.85)
      expect(modAlcohol!.confidence).toBeGreaterThanOrEqual(0.85);
      expect(heavyAlcohol!.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('light 默认不应生成 public event（或 confidence 较低）', () => {
      const { events } = generateAlcoholScenario('light');
      const results = recognizeEvents(events, profileId, currentTime);

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      // light 的响应可能不够强，confidence 应低于 moderate 的阈值
      if (alcoholEvent) {
        expect(alcoholEvent.confidence).toBeLessThan(0.85);
      }
      // 即使没有 alcohol event 也是可以接受的
    });

    it('无 hrvRmssd 数据不应生成 alcohol event', () => {
      const { events } = generateAlcoholScenario('moderate');
      // 过滤掉 hrvRmssd 事件
      const noRmssd = events.filter((e) => e.metric !== 'hrvRmssd');
      const results = recognizeEvents(noRmssd, profileId, currentTime);

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeUndefined();
    });

    it('运动重叠不应生成 alcohol event', () => {
      // 生成酒精数据，但在 response 窗口内注入高运动事件
      const { events } = generateAlcoholScenario('moderate');

      // 添加运动事件覆盖 response 窗口
      const exerciseSegment = makeSegment({
        segmentId: 'seg-exercise',
        type: 'steady_cardio',
        start: '2026-04-16T08:30',
        end: '2026-04-16T09:30',
      });
      const exerciseEvents = generateEventsForSegment(exerciseSegment);

      const allEvents = [...events, ...exerciseEvents];
      const results = recognizeEvents(allEvents, profileId, currentTime);

      // 高运动数据可能让 alcohol 检测失败（低活动条件不满足）
      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      // 运动混杂下不应输出，或者如果输出则 confidence 应该很低
      if (alcoholEvent) {
        expect(alcoholEvent.confidence).toBeLessThan(0.70);
      }
    });

    it('SpO2 明显下降不应生成 alcohol event', () => {
      const { events } = generateAlcoholScenario('moderate');
      // 添加低 SpO2 事件
      const lowSpo2Events: DeviceEvent[] = [];
      for (let m = 20; m <= 120; m += 5) {
        const time = `2026-04-16T${String(8 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        lowSpo2Events.push({
          eventId: `evt-low-spo2-${m}`,
          profileId,
          measuredAt: time,
          metric: 'spo2',
          value: 92, // 明显低于基线 97
          source: 'sensor',
        });
      }

      const allEvents = [...events, ...lowSpo2Events];
      const results = recognizeEvents(allEvents, profileId, currentTime);

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeUndefined();
    });

    it('meal_intake 单独不应生成 alcohol event', () => {
      // 只生成 meal_intake 事件，没有酒精生理响应
      const segment = makeSegment({
        segmentId: 'seg-meal-only',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeUndefined();
    });

    it('不应使用 segmentId 文本判断酒精', () => {
      const { events } = generateAlcoholScenario('moderate');
      // 将 segmentId 改成无关名称
      const maskedEvents = events.map((e) => ({
        ...e,
        segmentId: e.segmentId?.replace(/alcohol/gi, 'unknown'),
      }));

      const results = recognizeEvents(maskedEvents, profileId, currentTime);
      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      // 即使 segmentId 不包含 alcohol，只要数据特征匹配就应该能识别
      expect(alcoholEvent).toBeDefined();
      expect(alcoholEvent!.confidence).toBeGreaterThanOrEqual(0.70);
    });
  });

  // ============================================================
  // 咖啡因/饮酒互斥测试
  // ============================================================

  describe('咖啡因与饮酒互斥', () => {
    /** 生成咖啡因摄入场景（含前置基线） */
    function generateCaffeineScenario(
      dose: 'light' | 'moderate' | 'high_or_sensitive' = 'moderate',
    ): { events: DeviceEvent[]; caffeineStart: string } {
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline',
        type: 'prolonged_sedentary',
        start: '2026-04-16T07:00',
        end: '2026-04-16T08:00',
      });
      const caffeineSegment = makeSegment({
        segmentId: 'seg-caffeine-test',
        type: 'caffeine_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T12:00',
        params: { dose },
      });
      const baselineEvents = generateEventsForSegment(baselineSegment);
      const caffeineEvents = generateEventsForSegment(caffeineSegment);
      const events = [...baselineEvents, ...caffeineEvents];
      return { events, caffeineStart: '2026-04-16T08:00' };
    }

    it('咖啡因事件不应产生饮酒误判', () => {
      // 咖啡因和饮酒的生理响应模式相似（HR↑、RMSSD↓、stress↑），
      // 需确保饮酒检测器不会将咖啡因数据误判为饮酒
      const { events } = generateCaffeineScenario('moderate');
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeDefined();

      // 关键断言：不应同时出现饮酒事件
      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeUndefined();
    });

    it('high_or_sensitive 咖啡因也不应产生饮酒误判', () => {
      const { events } = generateCaffeineScenario('high_or_sensitive');
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeineEvent).toBeDefined();

      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcoholEvent).toBeUndefined();
    });

    it('不相关的咖啡因和饮酒数据应各自独立识别', () => {
      // 咖啡因和饮酒间隔足够远（>3小时），应各自独立检测
      // 需要在饮酒前提供基线数据，否则饮酒检测器无法建立基线
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline',
        type: 'prolonged_sedentary',
        start: '2026-04-16T06:00',
        end: '2026-04-16T07:00',
      });
      const caffeineSegment = makeSegment({
        segmentId: 'seg-caffeine',
        type: 'caffeine_intake',
        start: '2026-04-16T07:00',
        end: '2026-04-16T11:00',
        params: { dose: 'moderate' },
      });
      // 饮酒前的基线段
      const preAlcoholBaseline = makeSegment({
        segmentId: 'seg-pre-alcohol-baseline',
        type: 'prolonged_sedentary',
        start: '2026-04-16T13:00',
        end: '2026-04-16T14:00',
      });
      const alcoholSegment = makeSegment({
        segmentId: 'seg-alcohol',
        type: 'alcohol_intake',
        start: '2026-04-16T14:00',
        end: '2026-04-16T17:00',
        params: { amount: 'moderate' },
      });

      const events = [
        ...generateEventsForSegment(baselineSegment),
        ...generateEventsForSegment(caffeineSegment),
        ...generateEventsForSegment(preAlcoholBaseline),
        ...generateEventsForSegment(alcoholSegment),
      ];
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeineEvent = results.find((r) => r.type === 'possible_caffeine_intake');
      const alcoholEvent = results.find((r) => r.type === 'possible_alcohol_intake');

      // 间隔足够远，两者应独立检测到
      expect(caffeineEvent).toBeDefined();
      expect(alcoholEvent).toBeDefined();
    });
  });

  it('recognizes micro event segment ids as micro events', () => {
    const result = appendMicroEvent(
      '2026-06-01T09:00',
      'micro_deep_breathing',
      'profile-a',
      { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
    );

    const recognized = recognizeEvents(result.events, 'profile-a', result.newCurrentTime);

    expect(recognized).toHaveLength(1);
    expect(recognized[0]!.type).toBe('micro_deep_breathing');
    expect(recognized[0]!.confidence).toBe(1);
    expect(recognized[0]!.sourceSegmentId).toBe(result.segmentId);
    expect(recognized[0]!.evidence.join('\n')).toContain('用户选择触发微事件 micro_deep_breathing');
  });

  // ============================================================
  // 微事件双通道语义：用户上报来源标记
  // ============================================================

  describe('微事件用户上报来源', () => {
    it('微事件应标记为 recognitionSource=user_report 且 calibrationStatus=not_applicable', () => {
      const result = appendMicroEvent(
        '2026-06-01T09:00',
        'micro_deep_breathing',
        'profile-a',
        { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
      );

      const recognized = recognizeEvents(result.events, 'profile-a', result.newCurrentTime);

      expect(recognized).toHaveLength(1);
      // 关键断言：用户显式上报路径，非传感器推断
      expect(recognized[0]!.recognitionSource).toBe('user_report');
      expect(recognized[0]!.calibrationStatus).toBe('not_applicable');
    });

    it('微事件不应继承默认的 sensor_inference / calibrated', () => {
      const result = appendMicroEvent(
        '2026-06-01T10:00',
        'micro_cool_shower',
        'profile-a',
      );

      const recognized = recognizeEvents(result.events, 'profile-a', result.newCurrentTime);

      expect(recognized).toHaveLength(1);
      expect(recognized[0]!.recognitionSource).not.toBe('sensor_inference');
      expect(recognized[0]!.calibrationStatus).not.toBe('calibrated');
    });

    it('混合场景：微事件为 user_report，传感器事件保持 sensor_inference', () => {
      // 传感器推断片段（进餐）— profileId 与微事件一致以便在同一识别调用中处理
      const mealSegment = makeSegment({
        segmentId: 'seg-meal-mixed',
        type: 'meal_intake',
        profileId: 'profile-a',
        start: '2026-06-01T08:00',
        end: '2026-06-01T08:25',
      });
      const sensorEvents = generateEventsForSegment(mealSegment);

      // 用户上报的微事件
      const microResult = appendMicroEvent(
        '2026-06-01T09:00',
        'micro_deep_breathing',
        'profile-a',
        { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
      );

      const allEvents = [...sensorEvents, ...microResult.events];
      const recognized = recognizeEvents(allEvents, 'profile-a', microResult.newCurrentTime);

      const micro = recognized.find((r) => r.type === 'micro_deep_breathing');
      const sensor = recognized.find((r) => r.type === 'meal_intake');

      expect(micro).toBeDefined();
      expect(sensor).toBeDefined();
      // 双通道语义隔离
      expect(micro!.recognitionSource).toBe('user_report');
      expect(micro!.calibrationStatus).toBe('not_applicable');
      expect(sensor!.recognitionSource).toBe('sensor_inference');
      expect(sensor!.calibrationStatus).toBe('calibrated');
    });
  });

  // ============================================================
  // 任务 1.2：标签不变量、边界估算、纯函数单元测试
  // ============================================================

  describe('任务 1.2：标签不变量', () => {
    /** 生成包含 walk + meal 的混合场景 */
    function generateMixedScenario(): DeviceEvent[] {
      const segments = [
        makeSegment({
          segmentId: 'seg-walk-invariance',
          type: 'walk',
          start: '2026-04-16T07:00',
          end: '2026-04-16T07:30',
        }),
        makeSegment({
          segmentId: 'seg-meal-invariance',
          type: 'meal_intake',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        }),
      ];
      return generateAllEvents(segments);
    }

    it('相同观察序列配上不同 segmentId 标签应产生相同识别结果', () => {
      const events = generateMixedScenario();
      // 第一组：使用原始 segmentId
      const resultsA = recognizeEvents(events, profileId, currentTime);

      // 第二组：重命名所有 segmentId（保持观察值不变）
      const renamed = events.map((e, idx) => ({
        ...e,
        segmentId: e.segmentId ? `seg-foo-${idx}` : e.segmentId,
      }));
      const resultsB = recognizeEvents(renamed, profileId, currentTime);

      // 标签不变量：识别结果数量相同
      expect(resultsB.length).toBe(resultsA.length);

      // 每个对应事件的 type、confidence、start、end 相同
      for (let i = 0; i < resultsA.length; i++) {
        const a = resultsA[i]!;
        const b = resultsB[i]!;
        expect(b.type).toBe(a.type);
        expect(b.start).toBe(a.start);
        expect(b.end).toBe(a.end);
        expect(b.confidence).toBeCloseTo(a.confidence, 5);
        expect(b.recognitionSource).toBe(a.recognitionSource);
        expect(b.calibrationStatus).toBe(a.calibrationStatus);
      }
    });

    it('相同观察序列配上 god-mode 风格 segmentId 不应因 segmentId 获得特权识别', () => {
      const events = generateMixedScenario();
      // 注入 god-mode 风格 segmentId
      const godModeEvents = events.map((e) => ({
        ...e,
        segmentId: e.segmentId ? `seg-gm-walk-${Date.now()}` : e.segmentId,
      }));
      const results = recognizeEvents(godModeEvents, profileId, currentTime);
      // 任务 1.3：校准后 confidence 可以达到 1.0（isotonic 完美分离）
      // 但所有事件必须来自 sensor_inference 路径，且没有 sourceSegmentId 泄漏
      for (const r of results) {
        expect(r.recognitionSource).toBe('sensor_inference');
        expect(r.sourceSegmentId).toBeUndefined();
      }
    });
  });

  describe('任务 1.2：边界估算', () => {
    it('20 分钟进餐样本不提供 segment 边界，识别器仍估算 start/end', () => {
      // meal_intake 生成 20 分钟数据
      const segment = makeSegment({
        segmentId: 'seg-meal-boundary',
        type: 'meal_intake',
        start: '2026-04-16T12:00',
        end: '2026-04-16T12:20',
      });
      const events = generateEventsForSegment(segment);

      // 重命名 segmentId 为不相关名称（模拟"不提供 segment 边界"）
      const unlabeled = events.map((e) => ({
        ...e,
        segmentId: e.segmentId ? 'seg-unknown' : e.segmentId,
      }));
      const results = recognizeEvents(unlabeled, profileId, currentTime);

      const meal = results.find((r) => r.type === 'meal_intake');
      expect(meal).toBeDefined();
      // 估算的 start 应在 12:00 附近（±2 分钟）— ISO 格式字符串可直接字典序比较
      expect(meal!.start >= '2026-04-16T11:58').toBe(true);
      expect(meal!.start <= '2026-04-16T12:02').toBe(true);
      // 估算的 end 应在 12:19 附近（最后有数据分钟）
      expect(meal!.end >= '2026-04-16T12:17').toBe(true);
      expect(meal!.end <= '2026-04-16T12:20').toBe(true);
    });
  });

  // ============================================================
  // 纯函数单元测试
  // ============================================================

  describe('aggregatePerMinute', () => {
    it('应按分钟聚合观察并生成 z-score 特征', () => {
      const baseline: BaselineMetrics = {
        restingHr: 60,
        hrv: 50,
        spo2: 97,
        avgSleepMinutes: 420,
        avgSteps: 8000,
      };
      const observations: SensorObservation[] = [
        { observationId: 'a', profileId: 'p', measuredAt: '2026-04-16T08:00', metric: 'heartRate', value: 70 },
        { observationId: 'b', profileId: 'p', measuredAt: '2026-04-16T08:00', metric: 'motion', value: 4 },
        { observationId: 'c', profileId: 'p', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 75 },
        { observationId: 'd', profileId: 'p', measuredAt: '2026-04-16T08:01', metric: 'motion', value: 6 },
      ];
      const samples = aggregatePerMinute(observations, baseline);
      expect(samples).toHaveLength(2);
      expect(samples[0]!.minute).toBe('2026-04-16T08:00');
      expect(samples[1]!.minute).toBe('2026-04-16T08:01');
      // z-score for hr=70 with mean=60 std=15 → (70-60)/15 = 0.667
      expect(samples[0]!.features.heartRate).toBeCloseTo(0.667, 2);
    });

    it('应跳过只有非数值 metric 的分钟', () => {
      const baseline: BaselineMetrics = {
        restingHr: 60,
        hrv: 50,
        spo2: 97,
        avgSleepMinutes: 420,
        avgSteps: 8000,
      };
      const observations: SensorObservation[] = [
        { observationId: 'a', profileId: 'p', measuredAt: '2026-04-16T08:00', metric: 'wearState', value: true },
        { observationId: 'b', profileId: 'p', measuredAt: '2026-04-16T08:01', metric: 'heartRate', value: 70 },
      ];
      const samples = aggregatePerMinute(observations, baseline);
      // 08:00 只有 wearState，应被跳过
      expect(samples).toHaveLength(1);
      expect(samples[0]!.minute).toBe('2026-04-16T08:01');
    });
  });

  describe('detectCandidateWindows', () => {
    it('应在稳定段内不产生变化点', () => {
      // 构造 20 分钟的稳定数据（所有特征相同）
      const samples = Array.from({ length: 20 }, (_, i) => ({
        minute: `2026-04-16T08:${String(i).padStart(2, '0')}`,
        offset: i,
        features: {
          heartRate: 0.5,
          hrv: 0,
          motion: 1.0,
          stepRate: 0,
          spo2: 0,
          stressLoad: 0,
        },
        raw: {
          heartRates: [70],
          motions: [2],
          steps: [0],
          spo2Values: [],
          hrvRmssds: [],
          stressLoads: [],
          sleepStages: [],
        },
      }));
      const windows = detectCandidateWindows(samples);
      // 稳定段应该只有 1 个窗口
      expect(windows.length).toBe(1);
      expect(windows[0]!.startOffset).toBe(0);
      expect(windows[0]!.endOffset).toBe(19);
    });

    it('应在显著跳变处产生变化点', () => {
      // 前 10 分钟 hr_z=0，后 10 分钟 hr_z=5（巨大跳变）
      const samples = Array.from({ length: 20 }, (_, i) => ({
        minute: `2026-04-16T08:${String(i).padStart(2, '0')}`,
        offset: i,
        features: {
          heartRate: i < 10 ? 0 : 5,
          hrv: 0,
          motion: i < 10 ? 0 : 3,
          stepRate: 0,
          spo2: 0,
          stressLoad: 0,
        },
        raw: {
          heartRates: [i < 10 ? 60 : 135],
          motions: [i < 10 ? 0 : 6],
          steps: [0],
          spo2Values: [],
          hrvRmssds: [],
          stressLoads: [],
          sleepStages: [],
        },
      }));
      const windows = detectCandidateWindows(samples);
      // 应至少切成 2 个窗口
      expect(windows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('weightedIntervalScheduling', () => {
    it('应选择非重叠的最优子集', () => {
      const makeEvent = (type: string, start: string, end: string, confidence: number): RecognizedEvent => ({
        recognizedEventId: `re-${type}-${start}`,
        profileId: 'p',
        type: type as RecognizedEvent['type'],
        start,
        end,
        confidence,
        evidence: [],
        recognitionSource: 'sensor_inference',
        calibrationStatus: 'calibrated',
      });

      // 两个重叠窗口，应选 confidence 高的
      const intervals = [
        { event: makeEvent('walk', '2026-04-16T08:00', '2026-04-16T08:30', 0.7), start: '2026-04-16T08:00', end: '2026-04-16T08:30' },
        { event: makeEvent('meal_intake', '2026-04-16T08:10', '2026-04-16T08:40', 0.9), start: '2026-04-16T08:10', end: '2026-04-16T08:40' },
      ];
      const selected = weightedIntervalScheduling(intervals);
      expect(selected).toHaveLength(1);
      expect(selected[0]!.type).toBe('meal_intake');
    });

    it('不重叠窗口应全部保留', () => {
      const makeEvent = (type: string, start: string, end: string, confidence: number): RecognizedEvent => ({
        recognizedEventId: `re-${type}-${start}`,
        profileId: 'p',
        type: type as RecognizedEvent['type'],
        start,
        end,
        confidence,
        evidence: [],
        recognitionSource: 'sensor_inference',
        calibrationStatus: 'calibrated',
      });

      const intervals = [
        { event: makeEvent('meal_intake', '08:00', '08:25', 0.8), start: '2026-04-16T08:00', end: '2026-04-16T08:25' },
        { event: makeEvent('walk', '09:00', '09:30', 0.7), start: '2026-04-16T09:00', end: '2026-04-16T09:30' },
      ];
      const selected = weightedIntervalScheduling(intervals);
      expect(selected).toHaveLength(2);
    });

    it('空输入应返回空', () => {
      expect(weightedIntervalScheduling([])).toEqual([]);
    });
  });

  describe('任务 1.2：micro event 显式合并', () => {
    it('micro event 通过 userReportedEvents 通道合并，不经过传感器推断', () => {
      // 传感器观察（meal_intake）
      const mealSegment = makeSegment({
        segmentId: 'seg-meal-micro-merge',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const sensorEvents = generateEventsForSegment(mealSegment);

      // 用户上报的 micro event（已构造为 RecognizedEvent）
      const userReported: RecognizedEvent[] = [
        {
          recognizedEventId: 're-micro-test',
          profileId,
          type: 'micro_deep_breathing',
          start: '2026-04-16T09:00',
          end: '2026-04-16T09:03',
          confidence: 1.0,
          evidence: ['用户选择触发微事件 micro_deep_breathing'],
          sourceSegmentId: 'seg-micro-micro_deep_breathing-202604160900',
          recognitionSource: 'user_report',
          calibrationStatus: 'not_applicable',
        },
      ];

      // 通过新签名调用：observations 只含 sensor 数据
      const sensorObs: SensorObservation[] = sensorEvents
        .filter((e) => e.metric !== 'wearState' || typeof e.value === 'boolean')
        .map((e) => ({
          observationId: `obs-${e.eventId}`,
          profileId: e.profileId,
          measuredAt: e.measuredAt,
          metric: e.metric,
          value: e.value,
        }));

      const results = recognizeEvents({
        observations: sensorObs,
        userReportedEvents: userReported,
        profileId,
        currentTime,
      });

      // micro event 应原样出现在结果中
      const micro = results.find((r) => r.type === 'micro_deep_breathing');
      expect(micro).toBeDefined();
      expect(micro!.recognitionSource).toBe('user_report');
      expect(micro!.calibrationStatus).toBe('not_applicable');
      expect(micro!.confidence).toBe(1.0);

      // sensor 事件也应出现
      const sensor = results.find((r) => r.type === 'meal_intake');
      expect(sensor).toBeDefined();
      expect(sensor!.recognitionSource).toBe('sensor_inference');
    });
  });

  // ============================================================
  // 任务 1.3：校准发布阈值行为测试
  // ============================================================
  describe('任务 1.3：校准发布阈值', () => {
    it('高于 publishThreshold 的 meal_intake 应返回 calibrationStatus=calibrated', () => {
      const segment = makeSegment({
        segmentId: 'seg-meal-calib',
        type: 'meal_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:25',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const meal = results.find((r) => r.type === 'meal_intake');
      expect(meal).toBeDefined();
      expect(meal!.recognitionSource).toBe('sensor_inference');
      // 任务 1.3：返回的事件必须为 calibrated 状态
      expect(meal!.calibrationStatus).toBe('calibrated');
      // 校准后 confidence 应在 [0, 1] 范围内
      expect(meal!.confidence).toBeGreaterThanOrEqual(0);
      expect(meal!.confidence).toBeLessThanOrEqual(1);
    });

    it('高于 publishThreshold 的 possible_caffeine_intake 应返回 calibrationStatus=calibrated', () => {
      // moderate 咖啡因场景（需要前置基线）
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline-calib',
        type: 'prolonged_sedentary',
        start: '2026-04-16T07:00',
        end: '2026-04-16T08:00',
      });
      const caffeineSegment = makeSegment({
        segmentId: 'seg-caffeine-calib',
        type: 'caffeine_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T12:00',
        params: { dose: 'moderate' },
      });
      const events = [
        ...generateEventsForSegment(baselineSegment),
        ...generateEventsForSegment(caffeineSegment),
      ];
      const results = recognizeEvents(events, profileId, currentTime);

      const caffeine = results.find((r) => r.type === 'possible_caffeine_intake');
      expect(caffeine).toBeDefined();
      expect(caffeine!.calibrationStatus).toBe('calibrated');
    });

    it('高于 publishThreshold 的 possible_alcohol_intake 应返回 calibrationStatus=calibrated', () => {
      const baselineSegment = makeSegment({
        segmentId: 'seg-baseline-alcohol',
        type: 'prolonged_sedentary',
        start: '2026-04-16T07:00',
        end: '2026-04-16T08:00',
      });
      const alcoholSegment = makeSegment({
        segmentId: 'seg-alcohol-calib',
        type: 'alcohol_intake',
        start: '2026-04-16T08:00',
        end: '2026-04-16T11:00',
        params: { amount: 'moderate' },
      });
      const events = [
        ...generateEventsForSegment(baselineSegment),
        ...generateEventsForSegment(alcoholSegment),
      ];
      const results = recognizeEvents(events, profileId, currentTime);

      const alcohol = results.find((r) => r.type === 'possible_alcohol_intake');
      expect(alcohol).toBeDefined();
      expect(alcohol!.calibrationStatus).toBe('calibrated');
    });

    it('高于 publishThreshold 的 strength_training 应返回 calibrationStatus=calibrated', () => {
      const segment = makeSegment({
        segmentId: 'seg-strength-calib',
        type: 'strength_training',
        start: '2026-04-16T10:00',
        end: '2026-04-16T10:30',
        params: { setMinutes: 1, restMinutes: 2 },
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const strength = results.find((r) => r.type === 'strength_training');
      expect(strength).toBeDefined();
      expect(strength!.calibrationStatus).toBe('calibrated');
    });

    it('steady_cardio 因 publishable=false 一律不进入输出', () => {
      // 校准 artifact 中 steady_cardio 因 intermittent_exercise 混淆而 publishable=false
      const segment = makeSegment({
        segmentId: 'seg-cardio-filtered',
        type: 'steady_cardio',
        start: '2026-04-16T09:00',
        end: '2026-04-16T09:30',
      });
      const events = generateEventsForSegment(segment);
      const results = recognizeEvents(events, profileId, currentTime);

      const cardio = results.find((r) => r.type === 'steady_cardio');
      expect(cardio).toBeUndefined();
    });

    it('所有返回的 sensor_inference 事件都应有 calibrationStatus=calibrated', () => {
      // 混合场景：sleep + meal
      const segments = [
        makeSegment({
          segmentId: 'seg-mix-calib-sleep',
          type: 'sleep',
          start: '2026-04-16T22:00',
          end: '2026-04-17T06:00',
        }),
        makeSegment({
          segmentId: 'seg-mix-calib-meal',
          type: 'meal_intake',
          start: '2026-04-16T08:00',
          end: '2026-04-16T08:25',
        }),
      ];
      const allEvents = segments.flatMap((seg) => generateEventsForSegment(seg));
      const results = recognizeEvents(allEvents, profileId, currentTime);

      // 所有 sensor_inference 事件必须为 calibrated
      const sensorEvents = results.filter((r) => r.recognitionSource === 'sensor_inference');
      expect(sensorEvents.length).toBeGreaterThan(0);
      for (const e of sensorEvents) {
        expect(e.calibrationStatus).toBe('calibrated');
      }
    });
  });
});
