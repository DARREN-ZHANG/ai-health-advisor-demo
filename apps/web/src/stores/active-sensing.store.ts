import { create } from 'zustand';

export interface ActiveSensingBanner {
  id: string;
  type: 'event' | 'alert' | 'insight';
  title: string;
  content: string;
  priority: number;
}

interface ActiveSensingState {
  activeBanner: ActiveSensingBanner | null;
  isVisible: boolean;
  showBanner: (banner: ActiveSensingBanner) => void;
  hideBanner: () => void;
}

export const useActiveSensingStore = create<ActiveSensingState>((set) => ({
  activeBanner: null,
  isVisible: false,
  showBanner: (banner) => set({ activeBanner: banner, isVisible: true }),
  hideBanner: () => set({ isVisible: false }),
}));
