import type { ConversationMessage, SessionConversationMemory } from '../types/memory';
import { MAX_TURNS, SESSION_TTL_MS } from '../constants/limits';

export function trimConversationTurns(
  messages: ConversationMessage[],
  maxTurns: number = MAX_TURNS,
): ConversationMessage[] {
  const maxMessages = maxTurns * 2;
  if (messages.length <= maxMessages) return [...messages];
  return messages.slice(-maxMessages);
}

export function isSessionExpired(memory: SessionConversationMemory): boolean {
  return Date.now() - memory.updatedAt > SESSION_TTL_MS;
}
