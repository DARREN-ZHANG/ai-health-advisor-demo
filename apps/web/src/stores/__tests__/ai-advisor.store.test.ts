import { describe, it, expect, beforeEach } from 'vitest';
import { useAIAdvisorStore } from '../ai-advisor.store';
import type { PlanDraft } from '@health-advisor/shared';

function makeDraft(draftId: string): PlanDraft {
  return {
    draftId,
    title: '计划',
    summary: '摘要',
    groups: [
      {
        title: '第 1 天',
        tasks: [{ title: '任务 A' }],
      },
    ],
    createdAt: '2026-07-27T00:00:00.000Z',
  };
}

beforeEach(() => {
  useAIAdvisorStore.setState({
    messages: [],
    composerValue: '',
    isLoading: false,
    isOpen: false,
    pendingPrompt: null,
  });
});

describe('useAIAdvisorStore plan draft lifecycle', () => {
  it('adds an executable plan draft to the new message', () => {
    const { addMessage, getState } = bindStore();
    addMessage({
      role: 'assistant',
      content: '已为你准备好计划。',
      planDraft: { status: 'executable', draft: makeDraft('d1') },
    });

    const state = getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.planDraft).toEqual({
      status: 'executable',
      draft: makeDraft('d1'),
    });
  });

  it('revokes previous executable drafts when a newer executable one arrives', () => {
    const { addMessage, getState } = bindStore();
    addMessage({
      role: 'assistant',
      content: '旧版本',
      planDraft: { status: 'executable', draft: makeDraft('d1') },
    });
    addMessage({
      role: 'assistant',
      content: '新版本',
      planDraft: { status: 'executable', draft: makeDraft('d2') },
    });

    const state = getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.planDraft?.status).toBe('revoked');
    expect(state.messages[1]!.planDraft?.status).toBe('executable');
  });

  it('markPlanDraftExecuted flips the matching draft and leaves others untouched', () => {
    const { addMessage, markPlanDraftExecuted, getState } = bindStore();
    addMessage({
      role: 'assistant',
      content: '旧版本',
      planDraft: { status: 'executable', draft: makeDraft('d1') },
    });
    addMessage({
      role: 'assistant',
      content: '新版本',
      planDraft: { status: 'executable', draft: makeDraft('d2') },
    });

    markPlanDraftExecuted('d2');

    const state = getState();
    expect(state.messages[0]!.planDraft?.status).toBe('revoked');
    expect(state.messages[1]!.planDraft?.status).toBe('executed');
  });

  it('markPlanDraftsRevokedExcept revokes all executable drafts but the active one', () => {
    const { addMessage, markPlanDraftsRevokedExcept, getState } = bindStore();
    addMessage({
      role: 'assistant',
      content: '第一个',
      planDraft: { status: 'executable', draft: makeDraft('d1') },
    });
    // 模拟外部恢复：手动塞一个 executed 状态
    addMessage({
      role: 'assistant',
      content: '第二个',
      planDraft: { status: 'executable', draft: makeDraft('d2') },
    });

    markPlanDraftsRevokedExcept('d3');

    const state = getState();
    expect(state.messages[0]!.planDraft?.status).toBe('revoked');
    expect(state.messages[1]!.planDraft?.status).toBe('revoked');
  });

  it('clearMessages wipes the message list but does not touch plan-store on the server', () => {
    const { addMessage, clearMessages, getState } = bindStore();
    addMessage({
      role: 'assistant',
      content: '执行过',
      planDraft: { status: 'executed', draft: makeDraft('d1') },
    });
    clearMessages();
    expect(getState().messages).toEqual([]);
  });
});

function bindStore() {
  return {
    addMessage: useAIAdvisorStore.getState().addMessage,
    clearMessages: useAIAdvisorStore.getState().clearMessages,
    markPlanDraftExecuted: useAIAdvisorStore.getState().markPlanDraftExecuted,
    markPlanDraftsRevokedExcept: useAIAdvisorStore.getState().markPlanDraftsRevokedExcept,
    getState: () => useAIAdvisorStore.getState(),
  };
}
