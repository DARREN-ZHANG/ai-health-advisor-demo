import { create } from 'zustand';
import { env } from '@/config/env';

interface GodModeState {
  isEnabled: boolean;
  isOpen: boolean;
  toggleOpen: (open?: boolean) => void;
}

export const useGodModeStore = create<GodModeState>((set) => ({
  isEnabled: env.NEXT_PUBLIC_ENABLE_GOD_MODE,
  isOpen: false,
  toggleOpen: (open) => set((state) => ({ isOpen: open ?? !state.isOpen })),
}));
