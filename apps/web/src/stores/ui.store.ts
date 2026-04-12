import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface UIState {
  isAdvisorDrawerOpen: boolean;
  isGodModePanelOpen: boolean;
  activeDrawer: string | null;
  toasts: Toast[];
  toggleAdvisorDrawer: (open?: boolean) => void;
  toggleGodModePanel: (open?: boolean) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isAdvisorDrawerOpen: false,
  isGodModePanelOpen: false,
  activeDrawer: null,
  toasts: [],
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
  showToast: (message, type = 'info', duration = 3000) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
