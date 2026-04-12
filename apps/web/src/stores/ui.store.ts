import { create } from 'zustand';

interface UIState {
  isAdvisorDrawerOpen: boolean;
  isGodModePanelOpen: boolean;
  activeDrawer: string | null;
  toggleAdvisorDrawer: (open?: boolean) => void;
  toggleGodModePanel: (open?: boolean) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isAdvisorDrawerOpen: false,
  isGodModePanelOpen: false,
  activeDrawer: null,
  toggleAdvisorDrawer: (open) =>
    set((state) => ({
      isAdvisorDrawerOpen: open ?? !state.isAdvisorDrawerOpen,
    })),
  toggleGodModePanel: (open) =>
    set((state) => ({
      isGodModePanelOpen: open ?? !state.isGodModePanelOpen,
    })),
  openDrawer: (id) => set({ activeDrawer: id }),
  closeDrawer: () => set({ activeDrawer: null }),
}));
