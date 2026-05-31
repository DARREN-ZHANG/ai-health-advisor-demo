import { describe, expect, it } from 'vitest';
import type { DeviceEvent, RecognizedEvent } from '@health-advisor/shared';
import { buildHomepageEventWindowSummary } from '../../context/homepage-event-window';

function event(overrides: Partial<RecognizedEvent> = {}): RecognizedEvent {
  return {
    recognizedEventId: 're-hiit-1',
    profileId: 'profile-a',
    type: 'intermittent_exercise',
    start: '2026-05-31T17:30',
    end: '2026-05-31T18:30',
    confidence: 0.92,
    evidence: ['心率标准差 35, 交替高低强度'],
    sourceSegmentId: 'seg-hiit-1',
    ...overrides,
  };
}

function sample(
  measuredAt: string,
  metric: DeviceEvent['metric'],
  value: DeviceEvent['value'],
  segmentId = 'seg-hiit-1',
): DeviceEvent {
  return {
    eventId: `evt-${metric}-${measuredAt}`,
    profileId: 'profile-a',
    measuredAt,
    metric,
    value,
    source: 'sensor',
    segmentId,
  };
}

describe('buildHomepageEventWindowSummary', () => {
  it('aggregates workout heart-rate peak, average, latest and RMSSD from source segment samples', () => {
    const result = buildHomepageEventWindowSummary({
      event: event(),
      syncedEvents: [
        sample('2026-05-31T17:30', 'heartRate', 118),
        sample('2026-05-31T17:45', 'heartRate', 172),
        sample('2026-05-31T18:15', 'heartRate', 155),
        sample('2026-05-31T18:30', 'heartRate', 92),
        sample('2026-05-31T17:35', 'hrvRmssd', 48),
        sample('2026-05-31T18:30', 'hrvRmssd', 35),
        sample('2026-05-31T18:30', 'spo2', 99),
        sample('2026-05-31T18:30', 'steps', 4200),
        sample('2026-05-31T18:30', 'motion', 8.5),
      ],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    expect(result.coverage).toBe('complete');
    expect(result.sampleCount).toBe(9);

    const hr = result.metrics.find((metric) => metric.metric === 'heart_rate');
    expect(hr?.max).toBe(172);
    expect(hr?.average).toBe(134);
    expect(hr?.latest).toBe(92);
    expect(hr?.qualifier).toBe('elevated');
    expect(hr?.interpretation).toContain('峰值 172bpm');

    const hrv = result.metrics.find((metric) => metric.metric === 'hrv_rmssd');
    expect(hrv?.latest).toBe(35);
    expect(hrv?.delta).toBe(-13);
    expect(hrv?.qualifier).toBe('compressed');

    const steps = result.metrics.find((metric) => metric.metric === 'steps');
    expect(steps?.max).toBe(4200);
  });

  it('uses time-window filtering when sourceSegmentId is missing', () => {
    const result = buildHomepageEventWindowSummary({
      event: event({ sourceSegmentId: undefined }),
      syncedEvents: [
        sample('2026-05-31T17:29', 'heartRate', 80, 'other'),
        sample('2026-05-31T17:31', 'heartRate', 120, 'other'),
        sample('2026-05-31T18:29', 'heartRate', 150, 'other'),
        sample('2026-05-31T18:31', 'heartRate', 75, 'other'),
      ],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    const hr = result.metrics.find((metric) => metric.metric === 'heart_rate');
    expect(result.sampleCount).toBe(2);
    expect(hr?.min).toBe(120);
    expect(hr?.max).toBe(150);
  });

  it('does not fabricate metrics when no synced samples match the event', () => {
    const result = buildHomepageEventWindowSummary({
      event: event(),
      syncedEvents: [],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    expect(result.coverage).toBe('missing');
    expect(result.metrics).toEqual([]);
    expect(result.evidenceIds).toEqual([]);
  });
});
