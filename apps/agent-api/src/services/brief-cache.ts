import type { AgentResponseEnvelope } from '@health-advisor/shared';

/** 缓存 TTL：2 小时 */
const BRIEF_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CacheEntry {
  date: string;
  response: AgentResponseEnvelope;
  cachedAt: number;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Morning Brief 内存缓存。
 * key = profileId:YYYY-MM-DD，同一天内相同 profile 复用 LLM 结果。
 */
export class BriefCache {
  private store = new Map<string, CacheEntry>();

  get(profileId: string, locale?: string): AgentResponseEnvelope | null {
    const today = getToday();
    const key = `${profileId}:${today}:${locale ?? 'zh'}`;
    const entry = this.store.get(key);

    if (!entry) return null;

    // 超过 TTL 视为失效
    if (Date.now() - entry.cachedAt > BRIEF_CACHE_TTL_MS) {
      this.store.delete(key);
      return null;
    }

    // 标记为缓存命中，保留原始内容
    return {
      ...entry.response,
      meta: { ...entry.response.meta, finishReason: 'cached' },
    };
  }

  set(profileId: string, response: AgentResponseEnvelope, locale?: string): void {
    const today = getToday();
    const key = `${profileId}:${today}:${locale ?? 'zh'}`;
    this.store.set(key, { date: today, response, cachedAt: Date.now() });
  }

  /** 清除指定 profile 当日所有语言的缓存 */
  invalidate(profileId: string): void {
    const today = getToday();
    for (const key of this.store.keys()) {
      if (key.startsWith(`${profileId}:${today}:`)) {
        this.store.delete(key);
      }
    }
  }

  /** 清除全部缓存，供 God Mode 等全局数据变更后使用 */
  clearAll(): void {
    this.store.clear();
  }

  /** 清除所有过期条目 */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.cachedAt > BRIEF_CACHE_TTL_MS) {
        this.store.delete(key);
      }
    }
  }
}
