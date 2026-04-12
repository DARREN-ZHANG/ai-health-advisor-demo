import { create } from 'zustand';
import { env } from '@/config/env';

interface GodModeState {
  isEnabled: boolean;
  isOpen: boolean;
  activeScenarioId: string | null;
  toggleOpen: (open?: boolean) => void;
  setScenarioId: (id: string | null) => void;
}

export const useGodModeStore = create<GodModeState>((set) => ({
  isEnabled: env.NEXT_PUBLIC_ENABLE_GOD_MODE,
  isOpen: false,
  activeScenarioId: null,
  toggleOpen: (open) => set((state) => ({ isOpen: open ?? !state.isOpen })),
  setScenarioId: (id) => set({ activeScenarioId: id }),
}));
