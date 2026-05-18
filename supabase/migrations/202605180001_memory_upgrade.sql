create extension if not exists pgcrypto;

create table if not exists memory_candidates (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  session_id text not null,
  source_message_id text not null,
  kind text not null check (kind in ('allergy', 'medical_constraint', 'goal', 'preference', 'workflow_contact', 'workflow_consent', 'correction', 'revocation')),
  canonical_key text not null,
  payload_json jsonb not null,
  evidence_quote text not null,
  confidence text not null check (confidence in ('explicit', 'ambiguous')),
  proposed_confirmation_text text not null,
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'expired', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists memory_candidates_pending_idx
  on memory_candidates (user_scope_id, profile_id, session_id, status, expires_at);

create table if not exists user_memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  kind text not null check (kind in ('allergy', 'medical_constraint', 'goal', 'preference', 'workflow_contact', 'workflow_consent', 'correction', 'revocation')),
  canonical_key text not null,
  payload_json jsonb not null,
  status text not null check (status in ('active', 'revoked', 'superseded')),
  sensitivity text not null check (sensitivity in ('standard', 'health', 'workflow')),
  source_candidate_id uuid not null references memory_candidates(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists user_memory_facts_active_idx
  on user_memory_facts (user_scope_id, profile_id, status);

create unique index if not exists user_memory_facts_one_active_key_idx
  on user_memory_facts (user_scope_id, profile_id, canonical_key)
  where status = 'active';

create table if not exists memory_revisions (
  id uuid primary key default gen_random_uuid(),
  memory_fact_id uuid not null references user_memory_facts(id),
  revision_type text not null check (revision_type in ('create', 'update', 'revoke', 'supersede')),
  previous_payload_json jsonb,
  next_payload_json jsonb,
  source_candidate_id uuid not null references memory_candidates(id),
  created_at timestamptz not null default now()
);

create table if not exists workflow_contacts (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  contact_type text not null check (contact_type in ('therapist', 'coach', 'doctor', 'caregiver', 'other')),
  display_name text not null,
  email text,
  phone text,
  metadata_json jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_consents (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  workflow_type text not null,
  contact_id uuid references workflow_contacts(id),
  scope_json jsonb not null,
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  workflow_type text not null,
  contact_id uuid references workflow_contacts(id),
  consent_id uuid references workflow_consents(id),
  payload_json jsonb not null,
  status text not null check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_outbox_id uuid references workflow_outbox(id),
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_cache_entries (
  id uuid primary key default gen_random_uuid(),
  cache_type text not null,
  profile_id text not null,
  session_id text,
  cache_key text not null,
  data_fingerprint text not null,
  prompt_version text not null,
  model_version text not null,
  locale text not null,
  page_context_json jsonb not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (cache_type, profile_id, cache_key, data_fingerprint, prompt_version, model_version, locale)
);
