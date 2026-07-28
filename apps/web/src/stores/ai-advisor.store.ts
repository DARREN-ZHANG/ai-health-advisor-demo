import { create } from 'zustand';
import type {
  ChartTokenId,
  AgentResponseEnvelope,
  MemoryCandidateConfirmation,
  PlanDraft,
  AdvisorProactivePrompt,
} from '@health-advisor/shared';

/** 消息内 meta 字段，从 AgentResponseEnvelope.meta 派生 */
type MessageMeta = Pick<AgentResponseEnvelope['meta'], 'taskType' | 'pageContext' | 'finishReason'>;

/**
 * 消息附带的计划草稿。
 *
 * - `status: 'executable'` 表示该 draftId 仍可执行；后续 chat 调整产出新 draftId 时，
 *   store 会把所有历史 message 的 planDraft 翻转为 `revoked`，UI 不可再触发执行。
 * - `status: 'executed'` 表示已通过 /execute 接口落地为 plan；UI 应禁用执行按钮。
 */
export interface MessagePlanDraft {
  status: 'executable' | 'revoked' | 'executed';
  draft: PlanDraft;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  memoryCandidates?: MemoryCandidateConfirmation[];
  source?: AgentResponseEnvelope['source'];
  statusColor?: AgentResponseEnvelope['statusColor'];
  meta?: MessageMeta;
  /** 当 chat 响应携带可执行 planDraft 时挂这里；不存在为 undefined。 */
  planDraft?: MessagePlanDraft;
  proactivePrompt?: {
    status: 'pending' | 'accepted' | 'declined';
    prompt: AdvisorProactivePrompt;
  };
  timestamp: number;
}

interface AIAdvisorState {
  isOpen: boolean;
  messages: Message[];
  composerValue: string;
  isLoading: boolean;
  pendingPrompt: string | null;
  setIsOpen: (open: boolean) => void;
  setComposerValue: (value: string) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setPendingPrompt: (prompt: string | null) => void;
  /** 新 draft 写入时把所有旧 draft 标记为 revoked。 */
  markPlanDraftsRevokedExcept: (activeDraftId: string) => void;
  /** 执行成功时把对应 draft 标记为 executed。 */
  markPlanDraftExecuted: (draftId: string) => void;
  markProactivePromptResponded: (
    messageId: string,
    decision: 'accept' | 'decline',
  ) => void;
}

export const useAIAdvisorStore = create<AIAdvisorState>((set) => ({
  isOpen: false,
  messages: [],
  composerValue: '',
  isLoading: false,
  pendingPrompt: null,
  setIsOpen: (open) => set({ isOpen: open }),
  setComposerValue: (composerValue) => set({ composerValue }),
  addMessage: (msg) =>
    set((state) => {
      const nextMessage: Message = {
        ...msg,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      // 写入新 executable draft 时，把旧 executable 翻转为 revoked。
      if (nextMessage.planDraft?.status === 'executable') {
        const activeDraftId = nextMessage.planDraft.draft.draftId;
        return {
          messages: [
            ...state.messages.map((m) =>
              m.planDraft?.status === 'executable' && m.planDraft.draft.draftId !== activeDraftId
                ? { ...m, planDraft: { ...m.planDraft, status: 'revoked' as const } }
                : m,
            ),
            nextMessage,
          ],
        };
      }
      return { messages: [...state.messages, nextMessage] };
    }),
  clearMessages: () => set({ messages: [], composerValue: '', isLoading: false, pendingPrompt: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
  markPlanDraftsRevokedExcept: (activeDraftId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.planDraft?.status === 'executable' && m.planDraft.draft.draftId !== activeDraftId
          ? { ...m, planDraft: { ...m.planDraft, status: 'revoked' as const } }
          : m,
      ),
    })),
  markPlanDraftExecuted: (draftId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.planDraft && m.planDraft.draft.draftId === draftId
          ? { ...m, planDraft: { ...m.planDraft, status: 'executed' as const } }
        : m,
      ),
    })),
  markProactivePromptResponded: (messageId, decision) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId && message.proactivePrompt?.status === 'pending'
          ? {
              ...message,
              proactivePrompt: {
                ...message.proactivePrompt,
                status: decision === 'accept' ? 'accepted' as const : 'declined' as const,
              },
            }
          : message,
      ),
    })),
}));
