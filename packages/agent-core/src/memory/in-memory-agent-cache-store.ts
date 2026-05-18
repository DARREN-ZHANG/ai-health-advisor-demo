import type { AgentCacheEntry, AgentCacheLookup, AgentCacheStore } from '../types/agent-cache';

function identity(entry: Pick<AgentCacheEntry, 'cacheType' | 'profileId' | 'cacheKey' | 'dataFingerprint' | 'promptVersion' | 'modelVersion' | 'locale'>): string {
  return [
    entry.cacheType,
    entry.profileId,
    entry.cacheKey,
    entry.dataFingerprint,
    entry.promptVersion,
    entry.modelVersion,
    entry.locale,
  ].join('|');
}

export class InMemoryAgentCacheStore implements AgentCacheStore {
  private entries = new Map<string, AgentCacheEntry>();

  async get(input: AgentCacheLookup): Promise<AgentCacheEntry | undefined> {
    const entry = this.entries.get(identity(input));
    if (!entry || entry.expiresAt <= input.now) return undefined;
    return entry;
  }

  async set(entry: AgentCacheEntry): Promise<AgentCacheEntry> {
    this.entries.set(identity(entry), entry);
    return entry;
  }

  async invalidateProfile(input: { profileId: string; cacheType?: AgentCacheEntry['cacheType'] }): Promise<number> {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.profileId === input.profileId && (!input.cacheType || entry.cacheType === input.cacheType)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async clearExpired(now: number): Promise<number> {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}
