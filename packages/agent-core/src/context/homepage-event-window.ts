import type { DeviceEvent, RecognizedEvent } from '@health-advisor/shared';
import type {
  HomepageEventWindowMetric,
  HomepageEventWindowMetricName,
  HomepageEventWindowSummary,
  UserContextPacket,
} from './context-packet';

export interface BuildHomepageEventWindowSummaryInput {
  event: RecognizedEvent;
  syncedEvents: DeviceEvent[];
  baselines: UserContextPacket['baselines'];
}

const METRIC_MAP: Record<DeviceEvent['metric'], HomepageEventWindowMetricName | undefined> = {
  heartRate: 'heart_rate',
  hrvRmssd: 'hrv_rmssd',
  spo2: 'spo2',
  motion: 'motion',
  steps: 'steps',
  stressLoad: 'stress_load',
  sleepStage: undefined,
  wearState: undefined,
};

const UNIT_MAP: Record<HomepageEventWindowMetricName, string> = {
  heart_rate: 'bpm',
  hrv_rmssd: 'ms',
  spo2: '%',
  motion: 'score',
  steps: 'steps',
  stress_load: 'score',
};

export function buildHomepageEventWindowSummary(
  input: BuildHomepageEventWindowSummaryInput,
): HomepageEventWindowSummary {
  const { event, syncedEvents, baselines } = input;
  const samples = selectEventSamples(event, syncedEvents ?? []);
  const metrics = buildMetrics(event, samples, baselines);
  const evidenceIds = metrics.map((metric) => metric.evidenceId);

  return {
    source: 'synced_device_samples',
    coverage: samples.length === 0 ? 'missing' : metrics.length >= 2 ? 'complete' : 'partial',
    recognizedEventId: event.recognizedEventId,
    sourceSegmentId: event.sourceSegmentId,
    start: event.start,
    end: event.end,
    durationMin: diffMinutes(event.start, event.end),
    sampleCount: samples.length,
    metrics,
    evidenceIds,
  };
}

function selectEventSamples(event: RecognizedEvent, syncedEvents: DeviceEvent[]): DeviceEvent[] {
  const sameProfile = syncedEvents.filter((sample) => sample.profileId === event.profileId);
  const selected = event.sourceSegmentId
    ? sameProfile.filter((sample) => sample.segmentId === event.sourceSegmentId)
    : sameProfile.filter((sample) => sample.measuredAt >= event.start && sample.measuredAt <= event.end);

  return selected
    .filter((sample) => METRIC_MAP[sample.metric] !== undefined && typeof sample.value === 'number')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

function buildMetrics(
  event: RecognizedEvent,
  samples: DeviceEvent[],
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric[] {
  const metrics: HomepageEventWindowMetric[] = [];
  for (const metric of ['heart_rate', 'hrv_rmssd', 'spo2', 'motion', 'steps', 'stress_load'] as const) {
    const values = samples
      .filter((sample) => METRIC_MAP[sample.metric] === metric)
      .map((sample) => sample.value)
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) continue;

    metrics.push(summarizeMetric(event, metric, values, baselines));
  }
  return metrics;
}

function summarizeMetric(
  event: RecognizedEvent,
  metric: HomepageEventWindowMetricName,
  values: number[],
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric {
  const startValue = values[0]!;
  const endValue = values[values.length - 1]!;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const averageValue = average(values);
  const averageRounded = metric === 'motion' ? round1(averageValue) : Math.round(averageValue);
  const delta = round1(endValue - startValue);
  const evidenceId = `event_window_${event.recognizedEventId}_${metric}`;

  return {
    metric,
    unit: UNIT_MAP[metric],
    sampleCount: values.length,
    startValue,
    endValue,
    latest: endValue,
    min,
    max,
    average: averageRounded,
    delta,
    qualifier: qualifyMetric(metric, { min, max, average: averageValue, latest: endValue, delta }, baselines),
    interpretation: interpretMetric(metric, { min, max, average: averageRounded, latest: endValue, delta }, baselines),
    evidenceId,
  };
}

function qualifyMetric(
  metric: HomepageEventWindowMetricName,
  values: { min: number; max: number; average: number; latest: number; delta: number },
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric['qualifier'] {
  switch (metric) {
    case 'heart_rate':
      return values.max >= baselines.restingHR + 35 || values.latest >= baselines.restingHR + 20 ? 'elevated' : 'normal';
    case 'hrv_rmssd':
      return values.latest <= baselines.hrv * 0.75 || values.delta < -8 ? 'compressed' : values.delta > 8 ? 'recovering' : 'normal';
    case 'spo2':
      return values.min < 95 ? 'low' : 'normal';
    case 'motion':
      return values.average >= 5 ? 'elevated' : 'normal';
    case 'steps':
      return values.max > 0 ? 'elevated' : 'normal';
    case 'stress_load':
      return values.max >= 60 ? 'elevated' : 'normal';
  }
}

function interpretMetric(
  metric: HomepageEventWindowMetricName,
  values: { min: number; max: number; average: number; latest: number; delta: number },
  baselines: UserContextPacket['baselines'],
): string {
  switch (metric) {
    case 'heart_rate':
      return `事件窗口心率峰值 ${values.max}bpm，均值 ${values.average}bpm，末段 ${values.latest}bpm，相对静息心率 ${baselines.restingHR}bpm 显示当前事件负荷`;
    case 'hrv_rmssd':
      return `事件窗口 RMSSD 从起点到末段变化 ${formatSigned(values.delta)}ms，末段 ${values.latest}ms，用于判断自主神经是否仍被压缩`;
    case 'spo2':
      return `事件窗口血氧最低 ${values.min}%，末段 ${values.latest}%，用于判断呼吸状态是否稳定`;
    case 'motion':
      return `事件窗口运动强度均值 ${values.average}，峰值 ${values.max}，用于区分静止、轻活动和训练负荷`;
    case 'steps':
      return `事件窗口累计步数峰值 ${values.max}，用于判断活动量和循环激活程度`;
    case 'stress_load':
      return `事件窗口压力负荷峰值 ${values.max}，末段 ${values.latest}，用于判断交感神经占优程度`;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function diffMinutes(start: string, end: string): number {
  return Math.round((new Date(`${end}:00`).getTime() - new Date(`${start}:00`).getTime()) / 60000);
}
