import { describe, expect, it } from 'vitest';
import {
  CustomerFacingUnitValidationError,
  formatCustomerFacingMetric,
  formatCustomerFacingValue,
} from '../../context/customer-facing-unit-policy';

describe('customer-facing unit policy', () => {
  it.each([
    [45, 0.8],
    [450, 7.5],
    [480, 8],
  ])('sleep %d min 投影为 %d h', (minutes, expectedHours) => {
    expect(formatCustomerFacingMetric('sleep_total', minutes, 'min', 'zh')).toEqual({
      value: expectedHours,
      unit: 'h',
    });
  });

  it.each([
    [30, 30, 'min'],
    [60, 1, 'h'],
    [90, 1.5, 'h'],
    [120, 2, 'h'],
  ] as const)('非睡眠 duration %d min 使用常用单位', (minutes, value, unit) => {
    expect(formatCustomerFacingMetric('event_duration', minutes, 'min', 'en')).toEqual({
      value,
      unit,
    });
  });

  it('按指标执行舍入，不依据 source unit 猜测', () => {
    expect(formatCustomerFacingMetric('heart_rate', 99.6, 'bpm', 'en')).toEqual({
      value: 100,
      unit: 'bpm',
    });
    expect(formatCustomerFacingMetric('hrv_rmssd', 83.7, 'ms', 'en')).toEqual({
      value: 84,
      unit: 'ms',
    });
    expect(formatCustomerFacingMetric('spo2', 98.94, '%', 'en')).toEqual({
      value: 98.9,
      unit: '%',
    });
    expect(formatCustomerFacingMetric('steps', 2998.4, 'steps', 'en')).toEqual({
      value: 2998,
      unit: 'steps',
    });
    expect(formatCustomerFacingMetric('distance', 4.24, 'km', 'en')).toEqual({
      value: 4.2,
      unit: 'km',
    });
    expect(formatCustomerFacingMetric('calories', 319.6, 'kcal', 'en')).toEqual({
      value: 320,
      unit: 'kcal',
    });
  });

  it('格式遵循空格、百分号和千位分隔规则', () => {
    expect(formatCustomerFacingValue(7.5, 'h', 'en')).toBe('7.5 h');
    expect(formatCustomerFacingValue(99, '%', 'en')).toBe('99%');
    expect(formatCustomerFacingValue(2998, 'steps', 'en')).toBe('2,998 steps');
    expect(formatCustomerFacingValue(84, 'ms', 'zh')).toBe('84 ms');
  });

  it('未知 metric/unit 组合结构化失败，不透传或猜测', () => {
    expect(() => formatCustomerFacingMetric('unknown_metric', 12, 'min', 'zh')).toThrowError(
      CustomerFacingUnitValidationError,
    );

    try {
      formatCustomerFacingMetric('sleep_total', 480, 'hours', 'en');
      throw new Error('expected unit validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CustomerFacingUnitValidationError);
      expect(error).toMatchObject({
        code: 'unsupported_metric_unit',
        metric: 'sleep_total',
        sourceUnit: 'hours',
      });
    }
  });

  it('拒绝非有限数值', () => {
    expect(() => formatCustomerFacingMetric('hrv', Number.NaN, 'ms', 'zh')).toThrowError(
      expect.objectContaining({ code: 'invalid_numeric_value' }),
    );
  });
});

