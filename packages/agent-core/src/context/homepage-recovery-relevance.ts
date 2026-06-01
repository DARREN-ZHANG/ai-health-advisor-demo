import type { HomepageSemanticEventType, Latest24hMetric, RecoveryContextReason } from './context-packet';

export interface RecoveryMetricRelevanceInput {
  metric: Latest24hMetric;
  primaryEventType: HomepageSemanticEventType;
  demoNow?: string;
}

export interface RecoveryMetricRelevance {
  visible: boolean;
  reason: RecoveryContextReason;
}

const SLEEP_RISK_EVENT_TYPES = new Set<HomepageSemanticEventType>([
  'sleep_end',
  'prepare_sleep',
  'possible_caffeine_intake',
  'possible_alcohol_intake',
]);

const RECOVERY_DEMAND_EVENT_TYPES = new Set<HomepageSemanticEventType>([
  'hiit_workout',
  'stress_spike',
]);

export function getLocalHour(timestamp?: string): number | undefined {
  if (!timestamp) return undefined;
  const match = timestamp.match(/T(\d{2}):/);
  if (!match) return undefined;
  return Number(match[1]);
}

export function isEveningSleepActionWindow(timestamp?: string): boolean {
  const hour = getLocalHour(timestamp);
  return hour !== undefined && hour >= 18;
}

export function isSleepMetric(metricName: string): boolean {
  return metricName === 'sleep_total' || metricName === 'sleep_deep' || metricName === 'sleep_rem';
}

export function decideRecoveryMetricRelevance(input: RecoveryMetricRelevanceInput): RecoveryMetricRelevance {
  const { metric, primaryEventType, demoNow } = input;

  if (!isSleepMetric(metric.metric)) {
    return { visible: true, reason: 'metric_supports_current_event' };
  }

  if (SLEEP_RISK_EVENT_TYPES.has(primaryEventType)) {
    return { visible: true, reason: 'primary_event_is_sleep_related' };
  }

  if (metric.status === 'critical') {
    return { visible: true, reason: 'metric_is_attention_or_critical' };
  }

  if (
    metric.status === 'attention'
    && RECOVERY_DEMAND_EVENT_TYPES.has(primaryEventType)
    && isEveningSleepActionWindow(demoNow)
  ) {
    return { visible: true, reason: 'primary_event_has_evening_sleep_risk' };
  }

  return { visible: false, reason: 'not_material_to_current_event' };
}
