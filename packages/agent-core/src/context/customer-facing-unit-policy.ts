import type { Locale } from '@health-advisor/shared';

/** 客户可见数值允许使用的封闭单位集合。 */
export type PublicMetricUnit = 'bpm' | 'ms' | '%' | 'steps' | 'h' | 'min' | 'km' | 'kcal';

export interface CustomerFacingMetricValue {
  value: number;
  unit: PublicMetricUnit;
}

export type CustomerFacingUnitValidationCode =
  | 'invalid_numeric_value'
  | 'unsupported_metric_unit';

/**
 * 公开单位投影失败时抛出的结构化错误。
 *
 * 公开包必须 fail closed：新增指标若未显式登记，不能依据上游 unit 猜测或透传。
 */
export class CustomerFacingUnitValidationError extends Error {
  readonly code: CustomerFacingUnitValidationCode;
  readonly metric: string;
  readonly sourceUnit: string;
  readonly value: number;

  constructor(params: {
    code: CustomerFacingUnitValidationCode;
    metric: string;
    sourceUnit: string;
    value: number;
  }) {
    const { code, metric, sourceUnit, value } = params;
    super(`Customer-facing unit validation failed: ${code} (${metric}, ${value} ${sourceUnit})`);
    this.name = 'CustomerFacingUnitValidationError';
    this.code = code;
    this.metric = metric;
    this.sourceUnit = sourceUnit;
    this.value = value;
  }
}

type Projection = (value: number) => CustomerFacingMetricValue;

interface MetricUnitRule {
  metric: string;
  sourceUnit: string;
  project: Projection;
}

const roundTo = (value: number, fractionDigits: number): number => {
  const factor = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const integer = (unit: PublicMetricUnit): Projection => (value) => ({
  value: Math.round(value),
  unit,
});

const oneDecimal = (unit: PublicMetricUnit): Projection => (value) => ({
  value: roundTo(value, 1),
  unit,
});

const sleepMinutesToHours: Projection = (minutes) => ({
  value: roundTo(minutes / 60, 1),
  unit: 'h',
});

const durationMinutesToCommonUnit: Projection = (minutes) =>
  minutes < 60
    ? { value: Math.round(minutes), unit: 'min' }
    : { value: roundTo(minutes / 60, 1), unit: 'h' };

const rules: MetricUnitRule[] = [];

function register(metrics: readonly string[], sourceUnit: string, project: Projection): void {
  for (const metric of metrics) rules.push({ metric, sourceUnit, project });
}

register(
  ['sleep', 'sleep_total', 'sleep_deep', 'sleep_light', 'sleep_rem', 'sleep_awake', 'avg_sleep'],
  'min',
  sleepMinutesToHours,
);
register(
  ['duration', 'event_duration', 'activity_duration', 'action_duration', 'active_minutes'],
  'min',
  durationMinutesToCommonUnit,
);
register(['heart_rate', 'resting_hr', 'resting-hr'], 'bpm', integer('bpm'));
register(['hrv', 'hrv_rmssd'], 'ms', integer('ms'));
register(['spo2'], '%', oneDecimal('%'));
register(['steps', 'activity'], 'steps', integer('steps'));
register(['distance'], 'km', oneDecimal('km'));
register(['calories'], 'kcal', integer('kcal'));

const RULES_BY_KEY = new Map(rules.map((rule) => [`${rule.metric}\u0000${rule.sourceUnit}`, rule]));

/**
 * 按指标语义把内部数值转换为面向客户的常用单位。
 *
 * 转换只发生在公开投影层，不修改调用方传入的内部对象。
 */
export function formatCustomerFacingMetric(
  metric: string,
  value: number,
  sourceUnit: string,
  _locale: Locale,
): CustomerFacingMetricValue {
  if (!Number.isFinite(value)) {
    throw new CustomerFacingUnitValidationError({
      code: 'invalid_numeric_value',
      metric,
      sourceUnit,
      value,
    });
  }

  const rule = RULES_BY_KEY.get(`${metric}\u0000${sourceUnit}`);
  if (!rule) {
    throw new CustomerFacingUnitValidationError({
      code: 'unsupported_metric_unit',
      metric,
      sourceUnit,
      value,
    });
  }

  return rule.project(value);
}

/** 渲染已投影的公开值；百分号紧贴数字，其余单位保留一个空格。 */
export function formatCustomerFacingValue(
  value: number,
  unit: PublicMetricUnit,
  locale: Locale,
): string {
  const maximumFractionDigits = unit === 'h' || unit === 'km' || unit === '%' ? 1 : 0;
  const formatted = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: unit === 'steps',
  }).format(value);

  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}

