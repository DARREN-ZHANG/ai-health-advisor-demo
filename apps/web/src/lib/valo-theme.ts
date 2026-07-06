/**
 * Valo 主题与四态健康视觉状态的单一来源。
 *
 * 本模块仅承载主题 token 与状态元数据，不引入任何 React 依赖，
 * 便于下游组件（如 I3.1 HealthHero）与工具函数复用。
 *
 * 详见 `docs/ui/valo/design-manifest.md`。
 *
 * ## `labelKey` 命名契约（稳定，请勿破坏）
 *
 * 每个 `HealthStateMetadata.labelKey` 形如 `health.state.<state-slug>`，
 * 其中 `<state-slug>` 与 `HealthVisualState` 字面量一一对应。该格式是
 * i18n 翻译表的稳定 key，I7.1（双语 / i18n）在补齐翻译时必须沿用此
 * 命名，不得改名或加前缀。下游任何引用都应以 `labelKey` 为准，禁止
 * 自行拼接字符串重新构造。
 */

/** 健康视觉四态，严格收敛为这四个值 */
export type HealthVisualState =
  | 'prime-readiness'
  | 'active-recovery'
  | 'metabolic-sluggish'
  | 'glycogen-depleted';

/** 四态有序列表，用于驱动 Switch Status 列表与默认渲染顺序 */
export const HEALTH_VISUAL_STATES: readonly HealthVisualState[] = [
  'prime-readiness',
  'active-recovery',
  'metabolic-sluggish',
  'glycogen-depleted',
] as const;

/** 单态元数据：CSS 变量引用 + i18n 标签键 */
export interface HealthStateMetadata {
  /** 状态本身，方便从 metadata 反查 */
  readonly state: HealthVisualState;
  /** 该状态对应的语义 CSS 变量引用（如 `var(--valo-prime)`） */
  readonly cssVar: string;
  /** i18n 翻译键，由下游文案表统一翻译，避免在此硬编码中英文 */
  readonly labelKey: string;
}

/** 四态到元数据的映射，CSS 变量名严格对齐 design-manifest.md */
export const HEALTH_STATE_METADATA: Readonly<
  Record<HealthVisualState, HealthStateMetadata>
> = {
  'prime-readiness': {
    state: 'prime-readiness',
    cssVar: 'var(--valo-prime)',
    labelKey: 'health.state.prime-readiness',
  },
  'active-recovery': {
    state: 'active-recovery',
    cssVar: 'var(--valo-active)',
    labelKey: 'health.state.active-recovery',
  },
  'metabolic-sluggish': {
    state: 'metabolic-sluggish',
    cssVar: 'var(--valo-sluggish)',
    labelKey: 'health.state.metabolic-sluggish',
  },
  'glycogen-depleted': {
    state: 'glycogen-depleted',
    cssVar: 'var(--valo-depleted)',
    labelKey: 'health.state.glycogen-depleted',
  },
};

/** 运行时类型守卫，用于把外部字符串收窄为四态 */
export function isHealthVisualState(value: unknown): value is HealthVisualState {
  return (
    typeof value === 'string' &&
    HEALTH_VISUAL_STATES.includes(value as HealthVisualState)
  );
}

/**
 * 取某状态的元数据。
 *
 * 接受任意 `string`（典型来源：JSON payload、URL query、外部 API），
 * 内部用 `isHealthVisualState` 做运行时校验，非法值直接抛错以暴露上游 bug。
 * 这让本函数成为真正的运行时守卫，对来自边界的非类型化输入同样安全。
 */
export function getHealthStateMeta(state: string): HealthStateMetadata {
  if (!isHealthVisualState(state)) {
    throw new Error(`Unknown HealthVisualState: ${state}`);
  }
  return HEALTH_STATE_METADATA[state];
}
