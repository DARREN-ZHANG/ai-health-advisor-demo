import { describe, it, expect } from 'vitest';
import { projectDeviceEventsToSensorObservations } from '../../helpers/sensor-observation';
import type { DeviceEvent, SensorObservation } from '@health-advisor/shared';

// ============================================================
// 投影 DeviceEvent → SensorObservation 测试
// 验证不变量：
// 1. 改变 segment.type / segmentId / eventId 后，metric/time/value 序列不变
// 2. 任何字符串字段都不含活动类型语义（meal_intake 等）
// 3. micro event 不被投影（保留为独立的用户上报通道）
// 4. observationId 是稳定的 opaque hash，不含 segmentId/eventId/type
// ============================================================

/** 构建测试用 DeviceEvent */
function makeEvent(overrides: Partial<DeviceEvent>): DeviceEvent {
  return {
    eventId: 'evt-test-1',
    profileId: 'profile-a',
    measuredAt: '2026-04-21T09:30',
    metric: 'heartRate',
    value: 72,
    source: 'sensor',
    ...overrides,
  };
}

describe('projectDeviceEventsToSensorObservations', () => {
  it('returns empty array for empty input', () => {
    expect(projectDeviceEventsToSensorObservations([])).toEqual([]);
  });

  it('projects a single event to a single observation', () => {
    const event = makeEvent({});
    const result = projectDeviceEventsToSensorObservations([event]);
    expect(result).toHaveLength(1);
    expect(result[0]!.profileId).toBe('profile-a');
    expect(result[0]!.measuredAt).toBe('2026-04-21T09:30');
    expect(result[0]!.metric).toBe('heartRate');
    expect(result[0]!.value).toBe(72);
  });

  it('produces observations without segmentId or eventId fields', () => {
    const event = makeEvent({ segmentId: 'seg-meal_intake-20260421T0730' });
    const result = projectDeviceEventsToSensorObservations([event]);
    expect(result).toHaveLength(1);
    const obs = result[0]!;
    // SensorObservation 契约：不得包含 segmentId / eventId
    expect(obs).not.toHaveProperty('segmentId');
    expect(obs).not.toHaveProperty('eventId');
    expect(obs).not.toHaveProperty('source');
  });

  it('preserves numeric, string, and boolean values unchanged', () => {
    const events: DeviceEvent[] = [
      makeEvent({ metric: 'heartRate', value: 72, measuredAt: '2026-04-21T09:30' }),
      makeEvent({ metric: 'sleepStage', value: 'deep', measuredAt: '2026-04-21T09:31' }),
      makeEvent({ metric: 'wearState', value: true, measuredAt: '2026-04-21T09:32' }),
    ];
    const result = projectDeviceEventsToSensorObservations(events);
    expect(result.map((o) => o.value)).toEqual([72, 'deep', true]);
  });

  it('sorts output by measuredAt ascending', () => {
    const events: DeviceEvent[] = [
      makeEvent({ measuredAt: '2026-04-21T09:35', eventId: 'e3' }),
      makeEvent({ measuredAt: '2026-04-21T09:30', eventId: 'e1' }),
      makeEvent({ measuredAt: '2026-04-21T09:32', eventId: 'e2' }),
    ];
    const result = projectDeviceEventsToSensorObservations(events);
    expect(result.map((o) => o.measuredAt)).toEqual([
      '2026-04-21T09:30',
      '2026-04-21T09:32',
      '2026-04-21T09:35',
    ]);
  });

  // ============================================================
  // 核心不变量：改变语义字段不影响 metric/time/value 序列
  // ============================================================
  describe('invariance under semantic field changes', () => {
    const baseEvents: DeviceEvent[] = [
      makeEvent({
        eventId: 'evt-orig-1',
        segmentId: 'seg-meal_intake-20260421T0730',
        measuredAt: '2026-04-21T07:30',
        metric: 'heartRate',
        value: 75,
      }),
      makeEvent({
        eventId: 'evt-orig-2',
        segmentId: 'seg-meal_intake-20260421T0730',
        measuredAt: '2026-04-21T07:31',
        metric: 'motion',
        value: 3.2,
      }),
    ];

    // 提取观察的可比较签名：metric|time|value 三元组
    const signature = (obs: SensorObservation[]) =>
      obs.map((o) => `${o.metric}|${o.measuredAt}|${String(o.value)}`);

    it('changing segment.type leaves metric/time/value sequence identical', () => {
      // 将 segmentId 从 meal_intake 改为 steady_cardio
      const mutated: DeviceEvent[] = baseEvents.map((e) => ({
        ...e,
        segmentId: e.segmentId?.replace('meal_intake', 'steady_cardio'),
      }));
      const a = projectDeviceEventsToSensorObservations(baseEvents);
      const b = projectDeviceEventsToSensorObservations(mutated);
      expect(signature(b)).toEqual(signature(a));
    });

    it('changing segmentId entirely leaves metric/time/value sequence identical', () => {
      const mutated: DeviceEvent[] = baseEvents.map((e) => ({
        ...e,
        segmentId: `seg-completely-different-${e.eventId}`,
      }));
      const a = projectDeviceEventsToSensorObservations(baseEvents);
      const b = projectDeviceEventsToSensorObservations(mutated);
      expect(signature(b)).toEqual(signature(a));
    });

    it('changing eventId leaves metric/time/value sequence identical', () => {
      const mutated: DeviceEvent[] = baseEvents.map((e, i) => ({
        ...e,
        eventId: `evt-rewritten-${i}`,
      }));
      const a = projectDeviceEventsToSensorObservations(baseEvents);
      const b = projectDeviceEventsToSensorObservations(mutated);
      expect(signature(b)).toEqual(signature(a));
    });

    it('removing segmentId entirely leaves metric/time/value sequence identical', () => {
      const mutated: DeviceEvent[] = baseEvents.map((e) => {
        const { segmentId: _drop, ...rest } = e;
        return rest as DeviceEvent;
      });
      const a = projectDeviceEventsToSensorObservations(baseEvents);
      const b = projectDeviceEventsToSensorObservations(mutated);
      expect(signature(b)).toEqual(signature(a));
    });
  });

  // ============================================================
  // 不变量：观察流中任何字符串都不含活动类型语义
  // ============================================================
  describe('no activity-type leakage', () => {
    const activityTypes = [
      'meal_intake',
      'steady_cardio',
      'prolonged_sedentary',
      'intermittent_exercise',
      'walk',
      'sleep',
      'nap',
      'deep_focus',
      'anxiety_episode',
      'alcohol_intake',
      'caffeine_intake',
      'hydration_intake',
      'relaxation',
      'strength_training',
    ];

    it('observation fields never contain activity type strings', () => {
      const events: DeviceEvent[] = [
        makeEvent({
          eventId: 'evt-meal_intake-leak',
          segmentId: 'seg-meal_intake-20260421T0730',
          measuredAt: '2026-04-21T07:30',
          metric: 'heartRate',
          value: 75,
        }),
        makeEvent({
          eventId: 'evt-steady_cardio-leak',
          segmentId: 'seg-steady_cardio-20260421T0800',
          measuredAt: '2026-04-21T08:00',
          metric: 'steps',
          value: 120,
        }),
      ];
      const result = projectDeviceEventsToSensorObservations(events);

      for (const obs of result) {
        // 检查所有字符串字段
        const stringFields = [
          obs.observationId,
          obs.profileId,
          obs.measuredAt,
          obs.metric,
          typeof obs.value === 'string' ? obs.value : '',
        ];
        for (const field of stringFields) {
          for (const activityType of activityTypes) {
            expect(field).not.toContain(activityType);
          }
        }
      }
    });
  });

  // ============================================================
  // 不变量：observationId 是稳定 opaque hash
  // ============================================================
  describe('observationId stability and opacity', () => {
    it('same profile/time/metric/index produces same observationId', () => {
      const event = makeEvent({ measuredAt: '2026-04-21T09:30', metric: 'heartRate' });
      const a = projectDeviceEventsToSensorObservations([event]);
      const b = projectDeviceEventsToSensorObservations([event]);
      expect(a[0]!.observationId).toBe(b[0]!.observationId);
    });

    it('observationId is a hex digest (opaque, not semantic)', () => {
      const event = makeEvent({});
      const [obs] = projectDeviceEventsToSensorObservations([event]);
      // sha256 hex: 64 字符 [0-9a-f]
      expect(obs!.observationId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('observationId does not leak segmentId or eventId', () => {
      const event = makeEvent({
        eventId: 'evt-secret-xyz',
        segmentId: 'seg-secret-fragment',
      });
      const [obs] = projectDeviceEventsToSensorObservations([event]);
      expect(obs!.observationId).not.toContain('evt');
      expect(obs!.observationId).not.toContain('seg');
      expect(obs!.observationId).not.toContain('secret');
    });

    it('different metrics at same time produce different observationIds', () => {
      const events: DeviceEvent[] = [
        makeEvent({ measuredAt: '2026-04-21T09:30', metric: 'heartRate', value: 72 }),
        makeEvent({ measuredAt: '2026-04-21T09:30', metric: 'steps', value: 10 }),
      ];
      const result = projectDeviceEventsToSensorObservations(events);
      expect(result[0]!.observationId).not.toBe(result[1]!.observationId);
    });

    it('same metric at same minute but different values still gets distinct observationId', () => {
      // 同分钟序号区分：即使 value 不同，相同 metric+time 应有序号区分
      const events: DeviceEvent[] = [
        makeEvent({ measuredAt: '2026-04-21T09:30', metric: 'heartRate', value: 72 }),
        makeEvent({ measuredAt: '2026-04-21T09:30', metric: 'heartRate', value: 75 }),
      ];
      const result = projectDeviceEventsToSensorObservations(events);
      expect(result[0]!.observationId).not.toBe(result[1]!.observationId);
    });
  });

  // ============================================================
  // micro event 过滤：micro event 不被投影为 SensorObservation
  // ============================================================
  describe('micro event filtering', () => {
    it('excludes events whose segmentId matches micro event pattern', () => {
      const events: DeviceEvent[] = [
        makeEvent({
          eventId: 'e1',
          segmentId: 'seg-micro-micro_deep_breathing-20260421T1000',
          measuredAt: '2026-04-21T10:00',
          metric: 'heartRate',
          value: 70,
        }),
        makeEvent({
          eventId: 'e2',
          segmentId: 'seg-meal_intake-20260421T0730',
          measuredAt: '2026-04-21T07:30',
          metric: 'heartRate',
          value: 75,
        }),
      ];
      const result = projectDeviceEventsToSensorObservations(events);
      expect(result).toHaveLength(1);
      expect(result[0]!.measuredAt).toBe('2026-04-21T07:30');
    });

    it('returns empty array when all events are micro events', () => {
      const events: DeviceEvent[] = [
        makeEvent({
          segmentId: 'seg-micro-micro_short_walk-20260421T0900',
          measuredAt: '2026-04-21T09:00',
          metric: 'steps',
          value: 50,
        }),
      ];
      const result = projectDeviceEventsToSensorObservations(events);
      expect(result).toEqual([]);
    });

    it('does not break on events without segmentId', () => {
      const event = makeEvent({});
      // 不含 segmentId 的事件仍应正常投影
      const { segmentId: _drop, ...noSeg } = event;
      const result = projectDeviceEventsToSensorObservations([noSeg as DeviceEvent]);
      expect(result).toHaveLength(1);
    });
  });
});
