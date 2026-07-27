import { create } from 'zustand';
import type { HomeTrendCardDisplay } from '@health-advisor/shared';

/**
 * Home Trend Card 内存 store：按 profileId 分区，**不持久化**。
 *
 * 设计意图（与 life-log.store 一致）：
 * - 首页 Trends Brief 状态是会话级交互态，不写 localStorage。
 * - 刷新页面后所有 profile 回到默认 `hidden`，避免持久化跨会话污染。
 * - 按 profile 隔离，A 的 Chat 指令不会切换 B 看到的卡片。
 *
 * 仅由 Advisor Planner verifier 通过的 `uiDirectives` 才能调用 setDisplay；
 * 默认 `hidden` 既不渲染也不占用布局。
 */
export interface HomeTrendCardState {
  /** 按 profileId 分区的 display 状态 */
  displayByProfile: Readonly<Record<string, HomeTrendCardDisplay>>;
  /** 写入指定 profile 的最新 display（不可变更新） */
  setDisplay: (profileId: string, display: HomeTrendCardDisplay) => void;
  /** 仅清除指定 profile（其他 profile 不受影响） */
  clearForProfile: (profileId: string) => void;
  /** 清空所有 profile，回到初始状态（测试 / 显式会话重置） */
  reset: () => void;
}

export const useHomeTrendCardStore = create<HomeTrendCardState>((set) => ({
  displayByProfile: {},

  setDisplay: (profileId, display) =>
    set((state) => ({
      displayByProfile: {
        ...state.displayByProfile,
        [profileId]: display,
      },
    })),

  clearForProfile: (profileId) =>
    set((state) => {
      if (!(profileId in state.displayByProfile)) return state;
      const next = { ...state.displayByProfile };
      delete next[profileId];
      return { displayByProfile: next };
    }),

  reset: () => set({ displayByProfile: {} }),
}));

/**
 * 选择器：返回指定 profile 的 display 状态。
 *
 * 未知 profile 默认 `hidden`，对应"初次访问或刷新后 Trends Brief 不存在且不占布局"。
 */
export function selectHomeTrendCardDisplay(
  state: HomeTrendCardState,
  profileId: string,
): HomeTrendCardDisplay {
  return state.displayByProfile[profileId] ?? 'hidden';
}
