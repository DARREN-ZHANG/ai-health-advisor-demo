import { describe, expect, it } from 'vitest';
import { SupabaseAgentCacheStore } from '../../../persistence/supabase/cache-store';

class FakeSql {
  responses: unknown[][] = [];
  queries: string[] = [];

  async query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    this.queries.push(strings.join('?'));
    void values;
    return (this.responses.shift() ?? []) as T[];
  }
}

const row = {
  id: 'cache-1',
  cache_type: 'homepage_brief',
  profile_id: 'profile-a',
  session_id: 'sess-1',
  cache_key: 'cache-key',
  data_fingerprint: 'fingerprint',
  prompt_version: 'memory-upgrade-v1',
  model_version: 'gpt-demo',
  locale: 'zh',
  page_context_json: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
  payload_json: { summary: '今日状态稳定' },
  created_at: new Date(1760000000000).toISOString(),
  expires_at: new Date(1760007200000).toISOString(),
};

describe('SupabaseAgentCacheStore', () => {
  it('queries agent_cache_entries with fingerprint identity', async () => {
    const sql = new FakeSql();
    sql.responses = [[row]];
    const store = new SupabaseAgentCacheStore(sql);

    const cached = await store.get({
      cacheType: 'homepage_brief',
      profileId: 'profile-a',
      cacheKey: 'cache-key',
      dataFingerprint: 'fingerprint',
      promptVersion: 'memory-upgrade-v1',
      modelVersion: 'gpt-demo',
      locale: 'zh',
      now: 1760000001000,
    });

    expect(cached?.id).toBe('cache-1');
    expect(sql.queries[0]).toContain('from agent_cache_entries');
    expect(sql.queries[0]).toContain('data_fingerprint');
  });
});
