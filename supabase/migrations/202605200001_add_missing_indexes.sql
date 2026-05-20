-- 补充 agent_cache_entries、workflow_consents、workflow_events 查询索引

create index if not exists agent_cache_entries_profile_idx
  on agent_cache_entries (profile_id, cache_type);

create index if not exists agent_cache_entries_expires_idx
  on agent_cache_entries (expires_at);

create index if not exists workflow_consents_active_lookup_idx
  on workflow_consents (user_scope_id, profile_id, workflow_type, status);

create index if not exists workflow_events_outbox_idx
  on workflow_events (workflow_outbox_id, created_at);
