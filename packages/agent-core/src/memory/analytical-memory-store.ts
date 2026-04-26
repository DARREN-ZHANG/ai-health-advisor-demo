import type { AnalyticalMemory } from '../types/memory';

export interface AnalyticalMemoryStore {
  get(sessionId: string): AnalyticalMemory | undefined;
  getForProfile(sessionId: string, profileId: string): AnalyticalMemory | undefined;
  setHomepageBrief(sessionId: string, profileId: string, brief: string): void;
  setViewSummary(sessionId: string, profileId: string, scope: string, summary: string): void;
  setRuleSummary(sessionId: string, profileId: string, summary: string): void;
  invalidateOnProfileSwitch(sessionId: string): void;
  invalidateOnOverride(sessionId: string): void;
  clearAll(): void;
}

export class InMemoryAnalyticalMemoryStore implements AnalyticalMemoryStore {
  private store = new Map<string, AnalyticalMemory>();

  get(sessionId: string): AnalyticalMemory | undefined {
    return this.store.get(sessionId);
  }

  getForProfile(sessionId: string, profileId: string): AnalyticalMemory | undefined {
    const memory = this.store.get(sessionId);
    if (!memory || memory.profileId !== profileId) return undefined;
    return memory;
  }

  private getOrCreate(sessionId: string, profileId: string): AnalyticalMemory {
    const existing = this.store.get(sessionId);
    if (existing && existing.profileId !== profileId) {
      this.store.delete(sessionId);
    }
    const current = this.store.get(sessionId);
    if (current) return current;

    const created: AnalyticalMemory = {
      sessionId,
      profileId,
      updatedAt: Date.now(),
    };
    this.store.set(sessionId, created);
    return created;
  }

  setHomepageBrief(sessionId: string, profileId: string, brief: string): void {
    const memory = this.getOrCreate(sessionId, profileId);
    this.store.set(sessionId, { ...memory, latestHomepageBrief: brief, updatedAt: Date.now() });
  }

  setViewSummary(sessionId: string, profileId: string, scope: string, summary: string): void {
    const memory = this.getOrCreate(sessionId, profileId);
    const viewSummaries = { ...(memory.latestViewSummaryByScope ?? {}) };
    viewSummaries[scope] = summary;
    this.store.set(sessionId, { ...memory, latestViewSummaryByScope: viewSummaries, updatedAt: Date.now() });
  }

  setRuleSummary(sessionId: string, profileId: string, summary: string): void {
    const memory = this.getOrCreate(sessionId, profileId);
    this.store.set(sessionId, { ...memory, latestRuleSummary: summary, updatedAt: Date.now() });
  }

  invalidateOnProfileSwitch(sessionId: string): void {
    this.store.delete(sessionId);
  }

  invalidateOnOverride(sessionId: string): void {
    const memory = this.store.get(sessionId);
    if (!memory) return;
    this.store.set(sessionId, {
      ...memory,
      latestViewSummaryByScope: undefined,
      latestRuleSummary: undefined,
      updatedAt: Date.now(),
    });
  }

  clearAll(): void {
    this.store.clear();
  }
}
