import { create } from 'zustand';
import type { ChartTokenId, AgentTaskType, PageContext } from '@health-advisor/shared';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  meta?: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
  };
  timestamp: number;
}

interface AIAdvisorState {
  isOpen: boolean;
  messages: Message[];
  isLoading: boolean;
  setIsOpen: (open: boolean) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAIAdvisorStore = create<AIAdvisorState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  setIsOpen: (open) => set({ isOpen: open }),
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
