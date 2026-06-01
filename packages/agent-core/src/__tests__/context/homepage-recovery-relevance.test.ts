import { describe, expect, it } from 'vitest';
import {
  decideRecoveryMetricRelevance,
  isEveningSleepActionWindow,
} from '../../context/homepage-recovery-relevance';
import type { Latest24hMetric } from '../../context/context-packet';

const normalSleep: Latest24hMetric = {
  metric: 'sleep_total',
  value: 450,
  unit: 'min',
  baseline: 600,
  deltaPctVsBaseline: -25,
  status: 'normal',
  evidenceId: 'latest24h_sleep_total_2026-06-01',
};

const attentionSleep: Latest24hMetric = {
  ...normalSleep,
  status: 'attention',
};

const criticalSleep: Latest24hMetric = {
  ...normalSleep,
  status: 'critical',
};

it('suppresses sleep context for a 13:00 walk when sleep is not critical', () => {
  expect(decideRecoveryMetricRelevance({
    metric: normalSleep,
    primaryEventType: 'cardio_workout',
    demoNow: '2026-06-01T13:00',
  })).toEqual({
    visible: false,
    reason: 'not_material_to_current_event',
  });
});

it('keeps critical sleep context regardless of hour because it changes safety boundary', () => {
  expect(decideRecoveryMetricRelevance({
    metric: criticalSleep,
    primaryEventType: 'cardio_workout',
    demoNow: '2026-06-01T13:00',
  })).toEqual({
    visible: true,
    reason: 'metric_is_attention_or_critical',
  });
});

it('keeps attention sleep for evening high recovery demand events', () => {
  expect(decideRecoveryMetricRelevance({
    metric: attentionSleep,
    primaryEventType: 'hiit_workout',
    demoNow: '2026-06-01T19:30',
  })).toEqual({
    visible: true,
    reason: 'primary_event_has_evening_sleep_risk',
  });
});

it('keeps sleep context when the primary event itself is sleep-related', () => {
  expect(decideRecoveryMetricRelevance({
    metric: normalSleep,
    primaryEventType: 'possible_caffeine_intake',
    demoNow: '2026-06-01T15:30',
  })).toEqual({
    visible: true,
    reason: 'primary_event_is_sleep_related',
  });
});

it('treats 18:00 and later as the sleep action window', () => {
  expect(isEveningSleepActionWindow('2026-06-01T13:00')).toBe(false);
  expect(isEveningSleepActionWindow('2026-06-01T18:00')).toBe(true);
  expect(isEveningSleepActionWindow('2026-06-01T22:30')).toBe(true);
});
