import { describe, it, expect } from 'vitest';
import { trimConversationTurns, isSessionExpired } from '../../memory/memory-policy';
import type { ConversationMessage, SessionConversationMemory } from '../../types/memory';
import { SESSION_TTL_MS } from '../../constants/limits';

function makeMessages(count: number): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    text: `msg-${i}`,
    createdAt: Date.now(),
  }));
}

describe('trimConversationTurns', () => {
  it('returns all messages when under limit', () => {
    const messages = makeMessages(4);
    const result = trimConversationTurns(messages, 6);
    expect(result).toHaveLength(4);
  });

  it('trims to maxTurns * 2 from the end', () => {
    const messages = makeMessages(20);
    const result = trimConversationTurns(messages, 3);
    expect(result).toHaveLength(6);
    expect(result[0]?.text).toBe('msg-14');
  });

  it('returns copy of array', () => {
    const messages = makeMessages(4);
    const result = trimConversationTurns(messages, 6);
    expect(result).not.toBe(messages);
  });
});

describe('isSessionExpired', () => {
  it('returns true for old session', () => {
    const memory: SessionConversationMemory = {
      sessionId: 's1',
      profileId: 'p1',
      messages: [],
      updatedAt: Date.now() - SESSION_TTL_MS - 1000,
    };
    expect(isSessionExpired(memory)).toBe(true);
  });

  it('returns false for recent session', () => {
    const memory: SessionConversationMemory = {
      sessionId: 's1',
      profileId: 'p1',
      messages: [],
      updatedAt: Date.now(),
    };
    expect(isSessionExpired(memory)).toBe(false);
  });
});
