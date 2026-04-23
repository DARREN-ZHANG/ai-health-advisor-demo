import { create } from 'zustand';
import type { DataTab, Timeframe } from '@health-advisor/shared';

interface DataCenterState {
  activeTab: DataTab;
  timeframe: Timeframe;
  dateRange: { start: string; end: string } | null;
  setActiveTab: (tab: DataTab) => void;
  setTimeframe: (tf: Timeframe) => void;
  setDateRange: (range: { start: string; end: string } | null) => void;
}

export const useDataCenterStore = create<DataCenterState>((set) => ({
  activeTab: 'overview',
  timeframe: 'week',
  dateRange: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setDateRange: (range) => set({ dateRange: range }),
}));
