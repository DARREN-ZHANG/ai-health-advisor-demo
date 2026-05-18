import { describe, expect, it } from 'vitest';
import { InMemoryAgentCacheStore } from '../../memory/in-memory-agent-cache-store';
import type { AgentCacheEntry } from '../../types/agent-cache';

function entry(overrides: Partial<AgentCacheEntry> = {}): AgentCacheEntry {
  return {
    id: 'cache-1',
    cacheType: 'homepage_brief',
    profileId: 'profile-a',
    sessionId: 'sess-1',
    cacheKey: 'homepage:profile-a:2026-05-18:zh',
    dataFingerprint: 'fingerprint-a',
    promptVersion: 'memory-upgrade-v1',
    modelVersion: 'gpt-demo',
    locale: 'zh',
    pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
    payload: { summary: '今日状态稳定' },
    createdAt: 1760000000000,
    expiresAt: 1760007200000,
    ...overrides,
  };
}

describe('InMemoryAgentCacheStore', () => {
  it('returns only matching unexpired fingerprinted cache entry', async () => {
    const store = new InMemoryAgentCacheStore();
    await store.set(entry());
    await store.set(entry({ id: 'cache-2', dataFingerprint: 'fingerprint-b' }));

    const cached = await store.get({
      cacheType: 'homepage_brief',
      profileId: 'profile-a',
      cacheKey: 'homepage:profile-a:2026-05-18:zh',
      dataFingerprint: 'fingerprint-a',
      promptVersion: 'memory-upgrade-v1',
      modelVersion: 'gpt-demo',
      locale: 'zh',
      now: 1760000001000,
    });

    expect(cached?.id).toBe('cache-1');
  });

  it('treats expired cache as missing', async () => {
    const store = new InMemoryAgentCacheStore();
    await store.set(entry({ expiresAt: 1760000000001 }));

    const cached = await store.get({
      cacheType: 'homepage_brief',
      profileId: 'profile-a',
      cacheKey: 'homepage:profile-a:2026-05-18:zh',
      dataFingerprint: 'fingerprint-a',
      promptVersion: 'memory-upgrade-v1',
      modelVersion: 'gpt-demo',
      locale: 'zh',
      now: 1760000001000,
    });

    expect(cached).toBeUndefined();
  });
});
