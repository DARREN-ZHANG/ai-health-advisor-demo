import { create } from 'zustand';
import type { ChartTokenId, AgentResponseEnvelope } from '@health-advisor/shared';

/** 消息内 meta 字段，从 AgentResponseEnvelope.meta 派生 */
type MessageMeta = Pick<AgentResponseEnvelope['meta'], 'taskType' | 'pageContext' | 'finishReason'>;

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  source?: AgentResponseEnvelope['source'];
  statusColor?: AgentResponseEnvelope['statusColor'];
  meta?: MessageMeta;
  timestamp: number;
}

interface AIAdvisorState {
  isOpen: boolean;
  messages: Message[];
  composerValue: string;
  isLoading: boolean;
  setIsOpen: (open: boolean) => void;
  setComposerValue: (value: string) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAIAdvisorStore = create<AIAdvisorState>((set) => ({
  isOpen: false,
  messages: [],
  composerValue: '',
  isLoading: false,
  setIsOpen: (open) => set({ isOpen: open }),
  setComposerValue: (composerValue) => set({ composerValue }),
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [], composerValue: '', isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
