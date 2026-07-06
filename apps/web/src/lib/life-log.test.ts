import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUICK_CUPS,
  LIFE_LOG_CATEGORIES,
  computeRawAmount,
  sumCups,
  isLifeLogCategory,
  type LifeLogEntry,
} from './life-log';

/**
 * Life Log 纯逻辑层测试：类目配置、cup 求和、原始物理量换算。
 *
 * 与组件 / store 无关，便于聚焦边界条件。
 */

const baseEntry = (
  overrides: Partial<LifeLogEntry> = {},
): LifeLogEntry => ({
  id: 'entry-1',
  profileId: 'profile-a',
  type: 'caffeine',
  cups: 1,
  timestamp: '2026-07-05T08:00:00.000Z',
  ...overrides,
});

describe('LIFE_LOG_CATEGORIES', () => {
  it('严格收敛为三个类目', () => {
    expect(Object.keys(LIFE_LOG_CATEGORIES).sort()).toEqual([
      'alcohol',
      'caffeine',
      'hydration',
    ]);
  });

  it('caffeine 单杯 50mg，对应 metabolic-sluggish 色系', () => {
    expect(LIFE_LOG_CATEGORIES.caffeine).toEqual({
      type: 'caffeine',
      labelKey: 'lifeLog.category.caffeine',
      unitLabelKey: 'lifeLog.unit.cup',
      perCupAmount: 50,
      perCupUnit: 'mg',
      accentToken: '--valo-sluggish',
      icon: '☕',
    });
  });

  it('alcohol 单杯 14g，对应 glycogen-depleted 色系', () => {
    expect(LIFE_LOG_CATEGORIES.alcohol).toEqual({
      type: 'alcohol',
      labelKey: 'lifeLog.category.alcohol',
      unitLabelKey: 'lifeLog.unit.cup',
      perCupAmount: 14,
      perCupUnit: 'g',
      accentToken: '--valo-depleted',
      icon: '🍺',
    });
  });

  it('hydration 单杯 250ml，对应 active-recovery 色系', () => {
    expect(LIFE_LOG_CATEGORIES.hydration).toEqual({
      type: 'hydration',
      labelKey: 'lifeLog.category.hydration',
      unitLabelKey: 'lifeLog.unit.cup',
      perCupAmount: 250,
      perCupUnit: 'ml',
      accentToken: '--valo-active',
      icon: '💧',
    });
  });

  it('所有 accentToken 均落在四态 CSS 变量命名空间内', () => {
    for (const cfg of Object.values(LIFE_LOG_CATEGORIES)) {
      expect(cfg.accentToken.startsWith('--valo-')).toBe(true);
    }
  });
});

describe('sumCups', () => {
  it('空列表返回 0', () => {
    expect(sumCups([], 'caffeine')).toBe(0);
  });

  it('只累计指定类目的 cups', () => {
    const entries: LifeLogEntry[] = [
      baseEntry({ id: '1', type: 'caffeine', cups: 1 }),
      baseEntry({ id: '2', type: 'caffeine', cups: 2 }),
      baseEntry({ id: '3', type: 'hydration', cups: 5 }),
      baseEntry({ id: '4', type: 'alcohol', cups: 0.5 }),
    ];
    expect(sumCups(entries, 'caffeine')).toBe(3);
    expect(sumCups(entries, 'hydration')).toBe(5);
    expect(sumCups(entries, 'alcohol')).toBe(0.5);
  });

  it('支持小数 cups', () => {
    const entries: LifeLogEntry[] = [
      baseEntry({ id: '1', type: 'caffeine', cups: 0.25 }),
      baseEntry({ id: '2', type: 'caffeine', cups: 0.75 }),
    ];
    expect(sumCups(entries, 'caffeine')).toBeCloseTo(1, 10);
  });

  it('不修改输入数组（保持不可变）', () => {
    const entries: LifeLogEntry[] = [
      baseEntry({ id: '1', type: 'caffeine', cups: 2 }),
    ];
    const snapshot = [...entries];
    sumCups(entries, 'caffeine');
    expect(entries).toEqual(snapshot);
  });
});

describe('computeRawAmount', () => {
  it('caffeine 1 杯 = 50mg', () => {
    const r = computeRawAmount(1, LIFE_LOG_CATEGORIES.caffeine);
    expect(r).toEqual({ amount: 50, unit: 'mg' });
  });

  it('caffeine 2.5 杯 = 125mg', () => {
    const r = computeRawAmount(2.5, LIFE_LOG_CATEGORIES.caffeine);
    expect(r.amount).toBe(125);
    expect(r.unit).toBe('mg');
  });

  it('alcohol 1 杯 = 14g', () => {
    const r = computeRawAmount(1, LIFE_LOG_CATEGORIES.alcohol);
    expect(r).toEqual({ amount: 14, unit: 'g' });
  });

  it('hydration 1 杯 = 250ml', () => {
    const r = computeRawAmount(1, LIFE_LOG_CATEGORIES.hydration);
    expect(r).toEqual({ amount: 250, unit: 'ml' });
  });

  it('0 杯返回 amount=0', () => {
    expect(computeRawAmount(0, LIFE_LOG_CATEGORIES.caffeine).amount).toBe(0);
  });

  it('不修改传入的 config 对象', () => {
    const cfg = LIFE_LOG_CATEGORIES.caffeine;
    const snapshot = { ...cfg };
    computeRawAmount(3, cfg);
    expect({ ...cfg }).toEqual(snapshot);
  });
});

describe('DEFAULT_QUICK_CUPS', () => {
  it('默认快捷新增为 1 杯', () => {
    expect(DEFAULT_QUICK_CUPS).toBe(1);
  });
});

describe('isLifeLogCategory', () => {
  it('接受三个合法类目', () => {
    expect(isLifeLogCategory('caffeine')).toBe(true);
    expect(isLifeLogCategory('alcohol')).toBe(true);
    expect(isLifeLogCategory('hydration')).toBe(true);
  });

  it('拒绝非法字符串', () => {
    expect(isLifeLogCategory('unknown')).toBe(false);
    expect(isLifeLogCategory('')).toBe(false);
    expect(isLifeLogCategory('Caffeine')).toBe(false);
  });
});
