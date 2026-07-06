import { create } from 'zustand';
import type { HealthVisualState } from '@/lib/valo-theme';

/**
 * 健康视觉状态 store：管理"API 自动状态"与"用户手动覆盖"。
 *
 * 数据流：
 * 1. `useMorningBrief(profileId)` 在 `app/page.tsx` 监听 TanStack Query 结果，
 *    通过 `setAutoState(visualState, brief.dataUpdatedAt)` 把"由 API 派生的
 *    视觉状态"写入 store。
 * 2. 当新简报到达（`dataUpdatedAt` 变化），`setAutoState` 内部会清除
 *    `manualOverride`，让最新 API 状态接管 Hero。
 * 3. 用户点击 Hero 圆环打开 SwitchStatusDialog，选择某状态后通过
 *    `setManualOverride(state)` 立即覆盖渲染。新简报到达后再被清除。
 *
 * 不在此处持久化（persist）：Hero 状态本质是"展示当前简报"，刷新页面后
 * 用户应重新感知最新状态；持久化手动覆盖反而会与最新简报产生认知偏差。
 */
export interface HealthStatusState {
  /** API 派生的自动状态（来自 morning brief） */
  autoState: HealthVisualState;
  /** 用户手动覆盖的状态；非 null 时优先于 autoState */
  manualOverride: HealthVisualState | null;
  /**
   * 上次同步的 brief `dataUpdatedAt`（ms 时间戳）。
   * TanStack Query 在每次 fetch 成功时更新该值；store 比较它是否变化来判断
   * "是否是新一次简报"，进而决定是否清空 manualOverride。
   */
  lastSyncedDataUpdatedAt: number | null;
  /**
   * 由 Hero 父组件根据当前简报状态调用。
   *
   * 若 `dataUpdatedAt` 与上次记录不同，说明新简报到达，清空 `manualOverride`；
   * 否则保留 manualOverride（用户在本次简报周期内的选择不被同周期刷新破坏）。
   */
  setAutoState: (state: HealthVisualState, dataUpdatedAt: number) => void;
  /** 由 SwitchStatusDialog 调用；传 null 清除覆盖 */
  setManualOverride: (state: HealthVisualState | null) => void;
}

export const useHealthStatusStore = create<HealthStatusState>((set) => ({
  autoState: 'prime-readiness',
  manualOverride: null,
  lastSyncedDataUpdatedAt: null,
  setAutoState: (state, dataUpdatedAt) =>
    set((s) => {
      const isNewBrief = s.lastSyncedDataUpdatedAt !== dataUpdatedAt;
      return {
        autoState: state,
        lastSyncedDataUpdatedAt: dataUpdatedAt,
        // 新简报到达 → 清除手动覆盖；同周期刷新 → 保留用户选择
        manualOverride: isNewBrief ? null : s.manualOverride,
      };
    }),
  setManualOverride: (override) => set({ manualOverride: override }),
}));

/**
 * Selector：当前生效的视觉状态。
 *
 * 优先返回 `manualOverride`，回退到 `autoState`。
 * 用 selector 而非 store 派生字段，避免在 set 时同步维护两份状态。
 */
export function selectActiveVisualState(s: HealthStatusState): HealthVisualState {
  return s.manualOverride ?? s.autoState;
}
