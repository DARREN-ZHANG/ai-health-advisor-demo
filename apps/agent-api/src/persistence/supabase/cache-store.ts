import type { AgentCacheEntry, AgentCacheLookup, AgentCacheStore } from '@health-advisor/agent-core';
import type { SqlExecutor } from './client.js';

function fromCacheRow(row: Record<string, unknown>): AgentCacheEntry {
  return {
    id: String(row.id),
    cacheType: row.cache_type as AgentCacheEntry['cacheType'],
    profileId: String(row.profile_id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    cacheKey: String(row.cache_key),
    dataFingerprint: String(row.data_fingerprint),
    promptVersion: String(row.prompt_version),
    modelVersion: String(row.model_version),
    locale: String(row.locale),
    pageContext: row.page_context_json as Record<string, unknown>,
    payload: row.payload_json as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
  };
}

export class SupabaseAgentCacheStore implements AgentCacheStore {
  constructor(private readonly sql: SqlExecutor) {}

  async get(input: AgentCacheLookup): Promise<AgentCacheEntry | undefined> {
    const rows = await this.sql.query<Record<string, unknown>>`
      select * from agent_cache_entries
      where cache_type = ${input.cacheType}
        and profile_id = ${input.profileId}
        and cache_key = ${input.cacheKey}
        and data_fingerprint = ${input.dataFingerprint}
        and prompt_version = ${input.promptVersion}
        and model_version = ${input.modelVersion}
        and locale = ${input.locale}
        and expires_at > ${new Date(input.now)}
      limit 1
    `;
    return rows[0] ? fromCacheRow(rows[0]) : undefined;
  }

  async set(entry: AgentCacheEntry): Promise<AgentCacheEntry> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into agent_cache_entries (
        id, cache_type, profile_id, session_id, cache_key, data_fingerprint,
        prompt_version, model_version, locale, page_context_json, payload_json,
        created_at, expires_at
      )
      values (
        ${entry.id}, ${entry.cacheType}, ${entry.profileId}, ${entry.sessionId ?? null},
        ${entry.cacheKey}, ${entry.dataFingerprint}, ${entry.promptVersion}, ${entry.modelVersion},
        ${entry.locale}, ${entry.pageContext}, ${entry.payload},
        ${new Date(entry.createdAt)}, ${new Date(entry.expiresAt)}
      )
      on conflict (cache_type, profile_id, cache_key, data_fingerprint, prompt_version, model_version, locale)
      do update set
        session_id = excluded.session_id,
        page_context_json = excluded.page_context_json,
        payload_json = excluded.payload_json,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
      returning *
    `;
    return fromCacheRow(rows[0]!);
  }

  async invalidateProfile(input: { profileId: string; cacheType?: AgentCacheEntry['cacheType'] }): Promise<number> {
    const rows = input.cacheType
      ? await this.sql.query<Record<string, unknown>>`
          delete from agent_cache_entries
          where profile_id = ${input.profileId} and cache_type = ${input.cacheType}
          returning id
        `
      : await this.sql.query<Record<string, unknown>>`
          delete from agent_cache_entries
          where profile_id = ${input.profileId}
          returning id
        `;
    return rows.length;
  }

  async clearExpired(now: number): Promise<number> {
    const rows = await this.sql.query<Record<string, unknown>>`
      delete from agent_cache_entries
      where expires_at <= ${new Date(now)}
      returning id
    `;
    return rows.length;
  }
}
