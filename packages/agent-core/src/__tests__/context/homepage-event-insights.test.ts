import { describe, expect, it } from 'vitest';
import { buildHomepageEventInsights, normalizeHomepageEventType } from '../../context/homepage-event-insights';
import type { HomepageContextPacket } from '../../context/context-packet';

describe('homepage event insights', () => {
  it.each([
    ['sleep', 'sleep_end'],
    ['nap', 'sleep_end'],
    ['meal_intake', 'meal'],
    ['deep_focus', 'work_focus'],
    ['prolonged_sedentary', 'work_sedentary'],
    ['relaxation', 'rest_break'],
    ['walk', 'cardio_workout'],
    ['steady_cardio', 'cardio_workout'],
    ['intermittent_exercise', 'hiit_workout'],
    ['strength_training', 'hiit_workout'],
    ['anxiety_episode', 'stress_spike'],
    ['caffeine_intake', 'possible_caffeine_intake'],
    ['possible_caffeine_intake', 'possible_caffeine_intake'],
    ['alcohol_intake', 'possible_alcohol_intake'],
    ['possible_alcohol_intake', 'possible_alcohol_intake'],
    ['unknown_event', 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeHomepageEventType(input)).toBe(expected);
  });
});

function makeHomepage(overrides: Partial<HomepageContextPacket> = {}): HomepageContextPacket {
  return {
    recentEvents: [],
    latest24h: {
      date: '2026-04-21',
      metrics: [
        { metric: 'sleep_total', value: 450, unit: 'min', baseline: 420, deltaPctVsBaseline: 7, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-04-21' },
        { metric: 'hrv', value: 42, unit: 'ms', baseline: 58, deltaPctVsBaseline: -28, status: 'attention', evidenceId: 'latest24h_hrv_2026-04-21' },
        { metric: 'resting_hr', value: 82, unit: 'bpm', baseline: 62, deltaPctVsBaseline: 32, status: 'attention', evidenceId: 'latest24h_resting_hr_2026-04-21' },
        { metric: 'spo2', value: 98, unit: '%', baseline: 98, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'latest24h_spo2_2026-04-21' },
        { metric: 'stress_load', value: 72, unit: 'score', status: 'attention', evidenceId: 'latest24h_stress_load_2026-04-21' },
      ],
    },
    trend7d: [],
    eventInsights: [],
    rulesInsights: [],
    suggestedChartTokens: [],
    ...overrides,
  };
}

it('builds a high-tension work focus insight from event-window HRV compressed and HR elevated', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-focus-1',
        type: 'deep_focus',
        start: '2026-04-21T10:00',
        end: '2026-04-21T12:00',
        durationMin: 120,
        confidence: 0.91,
        sourceSegmentId: 'seg-focus-1',
        recognitionEvidence: ['平均心率 72, 低运动, 深度专注'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-focus-1',
          sourceSegmentId: 'seg-focus-1',
          start: '2026-04-21T10:00',
          end: '2026-04-21T12:00',
          durationMin: 120,
          sampleCount: 4,
          metrics: [
            { metric: 'heart_rate', unit: 'bpm', sampleCount: 2, max: 95, latest: 92, average: 93, delta: -3, qualifier: 'elevated', interpretation: 'HR elevated during focus', evidenceId: 'ew_hr' },
            { metric: 'hrv_rmssd', unit: 'ms', sampleCount: 2, latest: 35, average: 38, delta: -5, qualifier: 'compressed', interpretation: 'HRV compressed during focus', evidenceId: 'ew_hrv' },
          ],
          evidenceIds: ['ew_hr', 'ew_hrv'],
        },
        syncState: { lastSyncedMeasuredAt: '2026-04-21T12:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_deep_focus_2026-04-21T10:00'],
      }],
    }),
    demoNow: '2026-04-21T12:10',
  });

  expect(insights).toHaveLength(1);
  expect(insights[0]!.eventType).toBe('work_focus');
  expect(insights[0]!.priority).toBe('high');
  expect(insights[0]!.tension.level).toBe('high');
  expect(insights[0]!.physiology.some((p) => p.metric === 'hrv' && p.qualifier === 'compressed')).toBe(true);
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'movement_reset')).toBe(true);
  expect(insights[0]!.evidenceIds).toContain('event_deep_focus_2026-04-21T10:00');
});

it('marks SpO2 critical context as critical tension', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      latest24h: {
        date: '2026-04-21',
        metrics: [
          { metric: 'spo2', value: 88, unit: '%', baseline: 98, deltaPctVsBaseline: -10, status: 'critical', clinicalNote: '低氧血症，建议尽快就医', evidenceId: 'latest24h_spo2_2026-04-21' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-sleep-1',
        type: 'sleep',
        start: '2026-04-20T23:00',
        end: '2026-04-21T07:00',
        durationMin: 480,
        confidence: 0.95,
        sourceSegmentId: 'seg-sleep-1',
        recognitionEvidence: ['低运动, 心率平稳, 睡眠模式'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T07:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_sleep_2026-04-20T23:00'],
      }],
    }),
    demoNow: '2026-04-21T07:10',
  });

  expect(insights[0]!.eventType).toBe('sleep_end');
  expect(insights[0]!.tension.level).toBe('critical');
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'medical_attention')).toBe(true);
});

it('uses only supported product capabilities in action intents', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-sedentary-1',
        type: 'prolonged_sedentary',
        start: '2026-04-21T13:00',
        end: '2026-04-21T16:00',
        durationMin: 180,
        confidence: 0.88,
        sourceSegmentId: 'seg-sedentary-1',
        recognitionEvidence: ['低运动, 心率平稳, 久坐模式'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T16:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_prolonged_sedentary_2026-04-21T13:00'],
      }],
    }),
    demoNow: '2026-04-21T16:05',
  });

  const actions = insights[0]!.actionIntents;
  expect(actions.length).toBeGreaterThanOrEqual(2);
  expect(actions.every((a) => a.productCapability === 'record_choice' || a.productCapability === 'contextual_followup')).toBe(true);
  expect(actions.map((a) => a.aiPromise).join('\n')).not.toMatch(/提醒|开启.*模式|实时监控|调整监测逻辑/);
});

it('creates event-appropriate action categories for post-workout recovery', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'steady_cardio',
        start: '2026-04-21T17:30',
        end: '2026-04-21T18:10',
        durationMin: 40,
        confidence: 0.92,
        sourceSegmentId: 'seg-cardio-1',
        recognitionEvidence: ['心率标准差 20, 持续有氧运动'],
        syncState: { lastSyncedMeasuredAt: '2026-04-21T18:10', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_steady_cardio_2026-04-21T17:30'],
      }],
    }),
    demoNow: '2026-04-21T18:20',
  });

  const focusCategories = insights[0]!.recommendedFocus.map((f) => f.category);
  expect(focusCategories).toContain('hydration');
  expect(focusCategories).toContain('sleep_protection');
});
