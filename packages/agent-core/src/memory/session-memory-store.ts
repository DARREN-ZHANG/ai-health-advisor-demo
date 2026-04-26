import type {
  ConversationMessage,
  SessionConversationMemory,
} from '../types/memory';
import { MAX_TURNS, SESSION_TTL_MS } from '../constants/limits';
import { trimConversationTurns } from './memory-policy';

export interface SessionMemoryStore {
  get(sessionId: string): SessionConversationMemory | undefined;
  appendMessage(
    sessionId: string,
    profileId: string,
    message: ConversationMessage,
  ): SessionConversationMemory;
  getRecentMessages(sessionId: string, maxTurns?: number): ConversationMessage[];
  getRecentMessagesForProfile(sessionId: string, profileId: string, maxTurns?: number): ConversationMessage[];
  clearOnProfileSwitch(sessionId: string): void;
  clearAll(): void;
  evictExpired(): void;
}

export class InMemorySessionMemoryStore implements SessionMemoryStore {
  private store = new Map<string, SessionConversationMemory>();

  get(sessionId: string): SessionConversationMemory | undefined {
    return this.store.get(sessionId);
  }

  appendMessage(
    sessionId: string,
    profileId: string,
    message: ConversationMessage,
  ): SessionConversationMemory {
    const existing = this.store.get(sessionId);
    if (existing && existing.profileId !== profileId) {
      // profile 切换：自动清除旧 profile 记忆
      this.store.delete(sessionId);
    }

    const current = this.store.get(sessionId);
    const now = Date.now();

    const updated: SessionConversationMemory = {
      sessionId,
      profileId,
      messages: trimConversationTurns(
        current ? [...current.messages, message] : [message],
      ),
      updatedAt: now,
    };

    this.store.set(sessionId, updated);
    return updated;
  }

  getRecentMessages(sessionId: string, maxTurns: number = MAX_TURNS): ConversationMessage[] {
    const memory = this.store.get(sessionId);
    if (!memory) return [];
    const maxMessages = maxTurns * 2;
    if (memory.messages.length <= maxMessages) return [...memory.messages];
    return memory.messages.slice(-maxMessages);
  }

  getRecentMessagesForProfile(
    sessionId: string,
    profileId: string,
    maxTurns: number = MAX_TURNS,
  ): ConversationMessage[] {
    const memory = this.store.get(sessionId);
    if (!memory || memory.profileId !== profileId) return [];
    const maxMessages = maxTurns * 2;
    if (memory.messages.length <= maxMessages) return [...memory.messages];
    return memory.messages.slice(-maxMessages);
  }

  clearOnProfileSwitch(sessionId: string): void {
    this.store.delete(sessionId);
  }

  clearAll(): void {
    this.store.clear();
  }

  evictExpired(): void {
    for (const [key, memory] of this.store) {
      if (Date.now() - memory.updatedAt > SESSION_TTL_MS) {
        this.store.delete(key);
      }
    }
  }
}
