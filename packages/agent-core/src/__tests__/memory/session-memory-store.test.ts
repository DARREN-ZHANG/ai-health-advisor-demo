import { describe, it, expect } from 'vitest';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import type { ConversationMessage } from '../../types/memory';
import { MAX_TURNS, SESSION_TTL_MS } from '../../constants/limits';

function makeMessage(role: 'user' | 'assistant', text: string): ConversationMessage {
  return { role, text, createdAt: Date.now() };
}

describe('InMemorySessionMemoryStore', () => {
  it('starts empty for new session', () => {
    const store = new InMemorySessionMemoryStore();
    expect(store.get('sess-1')).toBeUndefined();
    expect(store.getRecentMessages('sess-1')).toEqual([]);
  });

  it('appends messages and updates timestamp', () => {
    const store = new InMemorySessionMemoryStore();
    const msg = makeMessage('user', '你好');
    const result = store.appendMessage('sess-1', 'profile-a', msg);

    expect(result.sessionId).toBe('sess-1');
    expect(result.profileId).toBe('profile-a');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.text).toBe('你好');
    expect(result.updatedAt).toBeGreaterThan(0);
  });

  it('trims messages to MAX_TURNS * 2', () => {
    const store = new InMemorySessionMemoryStore();
    for (let i = 0; i < MAX_TURNS * 2 + 4; i++) {
      const role = i % 2 === 0 ? 'user' as const : 'assistant' as const;
      store.appendMessage('sess-1', 'profile-a', makeMessage(role, `msg-${i}`));
    }

    const memory = store.get('sess-1');
    expect(memory?.messages).toHaveLength(MAX_TURNS * 2);
    // 保留最后 MAX_TURNS * 2 条
    expect(memory?.messages[0]?.text).toBe('msg-4');
  });

  it('auto-clears on profile mismatch', () => {
    const store = new InMemorySessionMemoryStore();
    store.appendMessage('sess-1', 'profile-a', makeMessage('user', '旧消息'));

    // 不同 profile 写入同一 session → 自动清除
    const result = store.appendMessage('sess-1', 'profile-b', makeMessage('user', '新消息'));
    expect(result.profileId).toBe('profile-b');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.text).toBe('新消息');
  });

  it('clearOnProfileSwitch deletes entry', () => {
    const store = new InMemorySessionMemoryStore();
    store.appendMessage('sess-1', 'profile-a', makeMessage('user', 'hi'));
    store.clearOnProfileSwitch('sess-1');
    expect(store.get('sess-1')).toBeUndefined();
  });

  it('getRecentMessages respects maxTurns', () => {
    const store = new InMemorySessionMemoryStore();
    for (let i = 0; i < 10; i++) {
      const role = i % 2 === 0 ? 'user' as const : 'assistant' as const;
      store.appendMessage('sess-1', 'profile-a', makeMessage(role, `msg-${i}`));
    }

    const recent = store.getRecentMessages('sess-1', 2);
    expect(recent).toHaveLength(4); // 2 turns * 2 messages
  });

  it('evictExpired removes stale sessions', () => {
    const store = new InMemorySessionMemoryStore();
    store.appendMessage('sess-1', 'profile-a', makeMessage('user', 'old'));

    // 手动将 updatedAt 设为过期
    const memory = store.get('sess-1')!;
    memory.updatedAt = Date.now() - SESSION_TTL_MS - 1000;

    store.evictExpired();
    expect(store.get('sess-1')).toBeUndefined();
  });

  it('evictExpired keeps active sessions', () => {
    const store = new InMemorySessionMemoryStore();
    store.appendMessage('sess-1', 'profile-a', makeMessage('user', 'recent'));

    store.evictExpired();
    expect(store.get('sess-1')).toBeDefined();
  });
});
