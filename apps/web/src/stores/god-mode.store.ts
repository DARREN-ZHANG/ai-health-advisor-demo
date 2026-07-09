import { create } from 'zustand';
import { env } from '@/config/env';
import type { TimelineSegmentType } from '@/components/demo-control/types';

/**
 * God Mode 全局 UI 状态。
 *
 * - `isEnabled` 决定 Demo Control 入口和抽屉是否渲染；
 *   由 `NEXT_PUBLIC_ENABLE_GOD_MODE` 在构建/启动期决定，运行期不变。
 * - `isOpen` 是抽屉的开关状态，由 Trigger 切换。
 * - `pendingSegmentType` 与 `pendingAction` 用于在 I2.3 接通 mutation 后
 *   让对应的卡片或底部按钮进入 loading 态。I2.2 仅暴露这两个状态，
 *   默认 `null`，不会触发任何 loading UI。
 */
interface GodModeState {
  isEnabled: boolean;
  isOpen: boolean;
  /** 当前正在添加的事件类型；用于 Add Event 按钮的 loading 态 */
  pendingSegmentType: TimelineSegmentType | null;
  /** 当前正在执行的底部动作；用于 +1h / 重置 按钮的 loading 态 */
  pendingAction: 'advance' | 'reset' | null;
  toggleOpen: (open?: boolean) => void;
  setPendingSegmentType: (type: TimelineSegmentType | null) => void;
  setPendingAction: (action: 'advance' | 'reset' | null) => void;
}

export const useGodModeStore = create<GodModeState>((set) => ({
  isEnabled: env.NEXT_PUBLIC_ENABLE_GOD_MODE,
  isOpen: false,
  pendingSegmentType: null,
  pendingAction: null,
  toggleOpen: (open) => set((state) => ({ isOpen: open ?? !state.isOpen })),
  setPendingSegmentType: (type) => set({ pendingSegmentType: type }),
  setPendingAction: (action) => set({ pendingAction: action }),
}));
