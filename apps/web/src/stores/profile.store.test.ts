import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('profile store', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('切换 profile 时清空 AI Advisor 旧消息', async () => {
    const { useAIAdvisorStore } = await import('./ai-advisor.store');
    const { useProfileStore } = await import('./profile.store');

    useAIAdvisorStore.getState().addMessage({
      role: 'user',
      content: 'legacy-message',
    });

    useProfileStore.getState().setProfileId('profile-b');

    expect(useProfileStore.getState().currentProfileId).toBe('profile-b');
    expect(useAIAdvisorStore.getState().messages).toHaveLength(0);
  });

  it('重复选择同一 profile 时不清空当前消息', async () => {
    const { useAIAdvisorStore } = await import('./ai-advisor.store');
    const { useProfileStore } = await import('./profile.store');

    useAIAdvisorStore.getState().addMessage({
      role: 'user',
      content: 'keep-message',
    });

    useProfileStore.getState().setProfileId('profile-a');

    expect(useAIAdvisorStore.getState().messages).toHaveLength(1);
  });
});
