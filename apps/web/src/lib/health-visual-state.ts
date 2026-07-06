/**
 * API 健康状态到 Hero 视觉状态的映射，以及四态的 CSS 渐变背景。
 *
 * 本模块是纯逻辑层，不引入 React 依赖，方便单元测试与下游组件复用。
 *
 * 设计要点（参见 docs/ui/valo/design-manifest.md）：
 * - API `statusColor` 取 `'good' | 'warning' | 'error' | undefined`。
 * - 没有 brief（`hasBrief=false`）或 statusColor 缺失时回到 `prime-readiness`，
 *   表示"最佳准备"首屏状态。
 * - 有 brief 但 statusColor 缺失（API 没回字段）的边界场景同样落到
 *   `prime-readiness`：保持与首屏一致的"中性紫"，避免误报红/橙。
 *   该选择是无声降级，不抛错也不弹 toast。
 *
 * Hero 背景使用 CSS 渐变而非位图 PNG，避免新增静态资源与多分辨率适配。
 * 渐变由调用方以 `style={{ backgroundImage: ... }}` 注入。
 */
import type { HealthVisualState } from './valo-theme';
import { HEALTH_STATE_METADATA, HEALTH_VISUAL_STATES } from './valo-theme';

/**
 * API `AgentStatusColor` 的可见子集。
 *
 * 与 `@health-advisor/shared` 的枚举严格对齐：`'good' | 'warning' | 'error'`，
 * 另允许 `undefined`（数据未加载或字段缺失）。
 */
export type ApiHealthStatus = 'good' | 'warning' | 'error' | undefined;

/**
 * 将 API 状态穷尽映射到 Hero 视觉状态。
 *
 * @param apiStatus 来自 morning brief 的 `statusColor`
 * @param hasBrief  当前是否已有简报数据（`data !== null && data !== undefined`）
 */
export function mapApiStatusToVisualState(
  apiStatus: ApiHealthStatus,
  hasBrief: boolean,
): HealthVisualState {
  // 没有 brief 或 statusColor 缺失 → 回到首屏"最佳准备"
  if (!hasBrief || apiStatus === undefined) return 'prime-readiness';
  switch (apiStatus) {
    case 'good':
      return 'active-recovery';
    case 'warning':
      return 'metabolic-sluggish';
    case 'error':
      return 'glycogen-depleted';
  }
}

/**
 * 每个状态的 CSS 渐变背景（替代位图 PNG）。
 *
 * 渐变读取该状态对应的 CSS 变量（与 `HEALTH_STATE_METADATA[state].cssVar` 同名），
 * 调用方在 `<HealthHero>` 容器上同时挂载变量与渐变，无需额外 hex 字面量。
 *
 * 设计意图：
 * - prime-readiness：紫色径向，从环心向外晕开，传达"准备就绪"的静谧感。
 * - active-recovery：绿色径向 + 右上偏移，呼应活力恢复的方向感。
 * - metabolic-sluggish：橙色径向 + 收紧半径，表达"运转迟缓"的稠厚感。
 * - glycogen-depleted：红色径向 + 双中心叠加，传达"能量耗尽"的紧迫感。
 */
export const HEALTH_STATE_GRADIENTS: Readonly<
  Record<HealthVisualState, string>
> = {
  'prime-readiness':
    'radial-gradient(circle at 50% 35%, var(--valo-prime) 0%, transparent 70%)',
  'active-recovery':
    'radial-gradient(circle at 60% 30%, var(--valo-active) 0%, transparent 65%)',
  'metabolic-sluggish':
    'radial-gradient(circle at 50% 40%, var(--valo-sluggish) 0%, transparent 60%)',
  'glycogen-depleted':
    'radial-gradient(circle at 40% 35%, var(--valo-depleted) 0%, transparent 55%), ' +
    'radial-gradient(circle at 65% 60%, var(--valo-depleted) 0%, transparent 55%)',
};

/**
 * 用于 SwitchStatusDialog 的有序状态列表 + 元数据。
 *
 * 直接复用 `HEALTH_STATE_METADATA` 的同序映射，配合 `HEALTH_VISUAL_STATES`
 * 的稳定顺序驱动渲染；调用方应使用 `HEALTH_VISUAL_STATES` 遍历，再以
 * 本映射取元数据，避免重复维护顺序。
 */
export const SWITCH_STATUS_OPTIONS = HEALTH_STATE_METADATA;

/** 重新导出 `HEALTH_VISUAL_STATES`，方便调用方从单一入口拿到顺序 */
export { HEALTH_VISUAL_STATES };
