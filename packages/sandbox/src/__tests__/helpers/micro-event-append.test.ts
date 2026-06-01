import { describe, expect, it } from 'vitest';
import { appendMicroEvent } from '../../helpers/micro-event-append';

describe('appendMicroEvent', () => {
  it('creates micro event events and advances time by default duration', () => {
    const result = appendMicroEvent(
      '2026-06-01T09:00',
      'micro_deep_breathing',
      'profile-a',
      { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
    );

    expect(result.eventStart).toBe('2026-06-01T09:00');
    expect(result.eventEnd).toBe('2026-06-01T09:03');
    expect(result.newCurrentTime).toBe('2026-06-01T09:03');
    expect(result.segmentId).toBe('seg-micro-micro_deep_breathing-202606010900');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('supports duration override and no clock advance', () => {
    const result = appendMicroEvent(
      '2026-06-01T09:00',
      'micro_short_walk',
      'profile-a',
      undefined,
      { durationMinutes: 7, advanceClock: false },
    );

    expect(result.eventEnd).toBe('2026-06-01T09:07');
    expect(result.newCurrentTime).toBe('2026-06-01T09:00');
  });
});
