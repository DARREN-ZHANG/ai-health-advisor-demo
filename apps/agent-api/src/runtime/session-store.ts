import {
  InMemorySessionMemoryStore,
  type SessionMemoryStore,
} from '@health-advisor/agent-core';

export interface SessionStoreService {
  readonly store: SessionMemoryStore;
  clearOnProfileSwitch(sessionId: string): void;
  evictExpired(): void;
}

export function createSessionStore(): SessionStoreService {
  const store = new InMemorySessionMemoryStore();

  return {
    store,
    clearOnProfileSwitch(sessionId: string) {
      store.clearOnProfileSwitch(sessionId);
    },
    evictExpired() {
      store.evictExpired();
    },
  };
}
