import { describe, expect, it } from 'vitest';
import { MICRO_EVENT_TYPES } from '@health-advisor/shared';
import { MICRO_EVENT_REGISTRY } from '../../helpers/micro-event-registry';
import { generateEventsForMicroEvent } from '../../helpers/micro-event-generators';

function makeSegment(type: (typeof MICRO_EVENT_TYPES)[number]) {
  const definition = MICRO_EVENT_REGISTRY[type];
  return {
    segmentId: `seg-micro-${type}-202606010900`,
    profileId: 'profile-a',
    type,
    start: '2026-06-01T09:00',
    end: `2026-06-01T09:${String(definition.defaultDurationMinutes).padStart(2, '0')}`,
    params: { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
  };
}

describe('generateEventsForMicroEvent', () => {
  it('generates events for every registered micro event type', () => {
    for (const type of MICRO_EVENT_TYPES) {
      const events = generateEventsForMicroEvent(makeSegment(type));
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.profileId === 'profile-a')).toBe(true);
      expect(events.every((event) => event.segmentId?.startsWith(`seg-micro-${type}-`))).toBe(true);
      expect(events.some((event) => event.metric === 'heartRate')).toBe(true);
      expect(events.some((event) => event.metric === 'motion')).toBe(true);
    }
  });

  it('deep breathing lowers heart rate and raises HRV', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_deep_breathing'));
    const hr = events.filter((event) => event.metric === 'heartRate').map((event) => Number(event.value));
    const hrv = events.filter((event) => event.metric === 'hrvRmssd').map((event) => Number(event.value));

    expect(hr.at(-1)!).toBeLessThan(hr[0]!);
    expect(hrv.at(-1)!).toBeGreaterThan(hrv[0]!);
    expect(events.filter((event) => event.metric === 'steps').every((event) => Number(event.value) === 0)).toBe(true);
  });

  it('short walk produces steps and motion without hydration claims', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_short_walk'));
    const steps = events.filter((event) => event.metric === 'steps').map((event) => Number(event.value));
    const motions = events.filter((event) => event.metric === 'motion').map((event) => Number(event.value));

    expect(steps.at(-1)!).toBeGreaterThan(200);
    expect(Math.max(...motions)).toBeGreaterThan(1);
    expect(events.map((event) => event.eventId).join('\n')).not.toMatch(/hydration|water|补水/);
  });

  it('sleep wind down never generates sleep stages', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_sleep_wind_down'));
    expect(events.some((event) => event.metric === 'sleepStage')).toBe(false);
  });

  it('box breathing has larger HR drop and HRV rise than deep breathing', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_box_breathing'));
    const hr = events.filter((e) => e.metric === 'heartRate').map((e) => Number(e.value));
    const hrv = events.filter((e) => e.metric === 'hrvRmssd').map((e) => Number(e.value));

    expect(hr.at(-1)!).toBeLessThan(hr[0]! - 6); // 至少下降 6 bpm
    expect(hrv.at(-1)!).toBeGreaterThan(hrv[0]! + 8); // 至少上升 8 ms
    expect(events.filter((e) => e.metric === 'steps').every((e) => Number(e.value) === 0)).toBe(true);
  });

  it('stair climb produces high steps and HR rise', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_stair_climb'));
    const steps = events.filter((e) => e.metric === 'steps').map((e) => Number(e.value));
    const hr = events.filter((e) => e.metric === 'heartRate').map((e) => Number(e.value));

    expect(steps.at(-1)!).toBeGreaterThan(200); // 总步数 > 200
    expect(Math.max(...hr)).toBeGreaterThan(58 + 15); // 最高心率 > restingHr + 15
  });

  it('cold face dip triggers dive reflex with sharp HR drop', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_cold_face_dip'));
    const hr = events.filter((e) => e.metric === 'heartRate').map((e) => Number(e.value));
    const hrv = events.filter((e) => e.metric === 'hrvRmssd').map((e) => Number(e.value));

    expect(hr.at(-1)!).toBeLessThan(hr[0]! - 6); // 心率骤降
    expect(hrv.at(-1)!).toBeGreaterThan(hrv[0]! + 8); // HRV 大幅拉升
    expect(events.filter((e) => e.metric === 'steps').every((e) => Number(e.value) === 0)).toBe(true);
  });

  it('power nap lowers HR below resting baseline and raises HRV', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_power_nap'));
    const hr = events.filter((e) => e.metric === 'heartRate').map((e) => Number(e.value));
    const hrv = events.filter((e) => e.metric === 'hrvRmssd').map((e) => Number(e.value));

    expect(hr.at(-1)!).toBeLessThan(58); // 低于 restingHr baseline
    expect(hrv.at(-1)!).toBeGreaterThan(hrv[0]! + 6); // HRV 显著上升
    expect(events.filter((e) => e.metric === 'steps').every((e) => Number(e.value) === 0)).toBe(true);
  });
});
