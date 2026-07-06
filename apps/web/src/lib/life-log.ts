/**
 * Life Log 领域类型与纯逻辑：三大摄入类目配置、cup 求和、物理量换算。
 *
 * 本模块是纯逻辑层（与 valo-theme / health-visual-state 同构），不引入 React
 * 与 Zustand 依赖，方便单元测试与下游组件复用。
 *
 * 设计要点（参见 docs/ui/valo/design-manifest.md）：
 * - 三类目：caffeine / alcohol / hydration。
 * - 单位"杯"（cup）映射到固定物理量：咖啡因 50mg / 杯，酒精 14g / 杯，水 250ml / 杯。
 * - 三类目各自绑定一个四态 CSS 变量，作为 UI 强调色：
 *   caffeine → orange（metabolic-sluggish），alcohol → red（glycogen-depleted），
 *   hydration → green（active-recovery）。
 *
 * `labelKey` / `unitLabelKey` 是 i18n 翻译键，由下游文案表统一翻译，
 * 避免在此硬编码中英文。
 */

/** Life Log 三大摄入类目 */
export type LifeLogCategory = 'caffeine' | 'alcohol' | 'hydration';

/** 单杯对应的物理量单位 */
export type LifeLogPerCupUnit = 'mg' | 'g' | 'ml';

/** Life Log 类目所绑定的四态 CSS 变量名（不含 `var()`，仅 token 字面量） */
export type LifeLogAccentToken =
  | '--valo-prime'
  | '--valo-active'
  | '--valo-sluggish'
  | '--valo-depleted';

/** 单个类目的不可变配置 */
export interface LifeLogCategoryConfig {
  /** 类目本身，便于从 config 反查 */
  readonly type: LifeLogCategory;
  /** i18n 标签键，例如 `lifeLog.category.caffeine` */
  readonly labelKey: string;
  /** i18n 单位键，例如 `lifeLog.unit.cup` */
  readonly unitLabelKey: string;
  /** 单杯对应的物理量数值（mg / g / ml） */
  readonly perCupAmount: number;
  /** 单杯物理量单位 */
  readonly perCupUnit: LifeLogPerCupUnit;
  /** 状态色 token（与四态色系一致） */
  readonly accentToken: LifeLogAccentToken;
  /** 图标 emoji */
  readonly icon: string;
}

/** 三类目配置，顺序固定为 caffeine → alcohol → hydration */
export const LIFE_LOG_CATEGORIES: Readonly<
  Record<LifeLogCategory, LifeLogCategoryConfig>
> = {
  caffeine: {
    type: 'caffeine',
    labelKey: 'lifeLog.category.caffeine',
    unitLabelKey: 'lifeLog.unit.cup',
    perCupAmount: 50,
    perCupUnit: 'mg',
    // 咖啡因 → 代谢迟缓（橙色）
    accentToken: '--valo-sluggish',
    icon: '☕',
  },
  alcohol: {
    type: 'alcohol',
    labelKey: 'lifeLog.category.alcohol',
    unitLabelKey: 'lifeLog.unit.cup',
    perCupAmount: 14,
    perCupUnit: 'g',
    // 酒精 → 糖原耗尽（红色）
    accentToken: '--valo-depleted',
    icon: '🍺',
  },
  hydration: {
    type: 'hydration',
    labelKey: 'lifeLog.category.hydration',
    unitLabelKey: 'lifeLog.unit.cup',
    perCupAmount: 250,
    perCupUnit: 'ml',
    // 补水 → 积极恢复（绿色）
    accentToken: '--valo-active',
    icon: '💧',
  },
} as const;

/** 三类目稳定顺序，便于 UI 遍历 */
export const LIFE_LOG_CATEGORY_ORDER: readonly LifeLogCategory[] = [
  'caffeine',
  'alcohol',
  'hydration',
] as const;

/** 单条 Life Log 记录 */
export interface LifeLogEntry {
  readonly id: string;
  readonly profileId: string;
  readonly type: LifeLogCategory;
  /** 杯数（默认 1，可为小数） */
  readonly cups: number;
  /** ISO 时间字符串 */
  readonly timestamp: string;
  /** 可选备注 */
  readonly note?: string;
}

/** 默认快捷新增的 cup 数量 */
export const DEFAULT_QUICK_CUPS = 1;

/**
 * 计算给定类目下 entries 的总杯数。
 *
 * 仅累计 `type` 匹配的条目；不修改输入数组。
 */
export function sumCups(
  entries: ReadonlyArray<LifeLogEntry>,
  type: LifeLogCategory,
): number {
  return entries.reduce((sum, e) => (e.type === type ? sum + e.cups : sum), 0);
}

/**
 * 把 cup 数量换算为原始物理量与单位。
 *
 * 例如 caffeine 2 杯 → 100mg；hydration 0.5 杯 → 125ml。
 * 不修改传入的 config 对象。
 */
export function computeRawAmount(
  cups: number,
  config: LifeLogCategoryConfig,
): { amount: number; unit: LifeLogPerCupUnit } {
  return {
    amount: cups * config.perCupAmount,
    unit: config.perCupUnit,
  };
}

/** 运行时类型守卫：把任意字符串收窄为 LifeLogCategory */
export function isLifeLogCategory(
  value: unknown,
): value is LifeLogCategory {
  return (
    typeof value === 'string' &&
    LIFE_LOG_CATEGORY_ORDER.includes(value as LifeLogCategory)
  );
}
