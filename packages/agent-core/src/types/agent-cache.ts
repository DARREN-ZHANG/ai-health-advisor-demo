export type AgentCacheType = 'homepage_brief' | 'view_summary' | 'planner_output';

export interface AgentCacheEntry {
  id: string;
  cacheType: AgentCacheType;
  profileId: string;
  sessionId?: string;
  cacheKey: string;
  dataFingerprint: string;
  promptVersion: string;
  modelVersion: string;
  locale: string;
  pageContext: Record<string, unknown>;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export interface AgentCacheLookup {
  cacheType: AgentCacheType;
  profileId: string;
  cacheKey: string;
  dataFingerprint: string;
  promptVersion: string;
  modelVersion: string;
  locale: string;
  now: number;
}

export interface AgentCacheStore {
  get(input: AgentCacheLookup): Promise<AgentCacheEntry | undefined>;
  set(entry: AgentCacheEntry): Promise<AgentCacheEntry>;
  invalidateProfile(input: { profileId: string; cacheType?: AgentCacheType }): Promise<number>;
  clearExpired(now: number): Promise<number>;
}
