import { create } from 'zustand';

export interface ActiveSensingBanner {
  id: string;
  type: 'event' | 'alert' | 'insight';
  title: string;
  content: string;
  priority: number;
  events?: string[]; // 包含触发该 banner 的原始事件列表
}

/** 待确认的概率事件对应的 timeline segment */
export interface PendingProbabilisticAction {
  segmentType: 'alcohol_intake' | 'caffeine_intake';
  params: Record<string, number | string | boolean>;
}

interface ActiveSensingState {
  activeBanner: ActiveSensingBanner | null;
  isVisible: boolean;
  pendingProbabilisticAction: PendingProbabilisticAction | null;
  showBanner: (banner: ActiveSensingBanner) => void;
  hideBanner: () => void;
  setPendingProbabilisticAction: (action: PendingProbabilisticAction | null) => void;
}

export const useActiveSensingStore = create<ActiveSensingState>((set) => ({
  activeBanner: null,
  isVisible: false,
  pendingProbabilisticAction: null,
  showBanner: (banner) => set({ activeBanner: banner, isVisible: true }),
  hideBanner: () => set({ isVisible: false, activeBanner: null }),
  setPendingProbabilisticAction: (action) => set({ pendingProbabilisticAction: action }),
}));
