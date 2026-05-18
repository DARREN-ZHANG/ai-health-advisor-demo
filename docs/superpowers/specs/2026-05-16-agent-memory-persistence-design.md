# Agent Durable Memory Persistence Design

> Status: approved design
> Date: 2026-05-16
> Updated: 2026-05-17
> Scope: `packages/agent-core`, `apps/agent-api`, future workflow adapters

## 1. Goal

Upgrade Agent memory from process-local `Map` state to a durable, production-shaped memory architecture while keeping the current demo/sandbox product lightweight.

The demo data source is mocked, but user-declared facts and workflow state should be modeled like production data. The design must support a later transition from demo to real users without redesigning backend memory boundaries.

## 2. Decisions

1. Durable memory is reserved for user-confirmed facts, preferences, constraints, contacts, consent, and workflow state.
2. Homepage summaries, view summaries, and planner outputs are derived artifacts. They are cacheable, but they are not durable memory.
3. Memory extraction creates candidates only. It cannot write durable memory directly.
4. User confirmation is required before a candidate becomes durable memory.
5. Workflow side effects use an outbox model. The Agent may propose an action, but deterministic workflow code owns confirmation, enqueueing, execution, and audit.
6. The authoritative persistence model should be SQL-first because memory facts, revisions, contacts, consent, and workflow events have relational shape.

## 3. Recommended Storage

Use a storage port in code and a Supabase Postgres adapter as the first durable backend.

Recommended first backend:

- Supabase Free project for the current Render-hosted backend.

Supabase is used as managed Postgres for the demo. The first implementation should use backend-owned database access from `apps/agent-api`; it should not require production Supabase Auth integration, client-side direct table access, or Row Level Security as a demo prerequisite.

To keep the demo inside the free-tier shape, the first implementation should rely only on Postgres tables and backend API routes. Supabase Storage, Realtime, Edge Functions, and Auth are outside the demo dependency set.

Future-compatible backends remain possible through the same storage port:

- Supabase Pro when the demo outgrows the free quota.
- AWS RDS or Aurora Serverless when moving deeper into AWS.
- Cloudflare D1 if the backend later moves to Cloudflare Workers.

DynamoDB remains a viable alternative for high-scale key-value memory, but it is not the preferred first backend because workflow consent, contact records, memory revisions, and action audit trails are easier to operate and inspect in SQL.

## 4. Memory Boundary

### 4.1 Durable Memory

Durable memory includes only confirmed user-level information:

- Allergies and medical constraints explicitly declared by the user.
- Long-term goals.
- Preferences that affect advice style or action feasibility.
- Contact records such as therapist name and email.
- Workflow consent and authorization scope.
- User-confirmed corrections or revocations.

Durable memory may be injected into future Agent context only after confirmation.

### 4.2 Candidate Memory

Candidate memory is extracted from conversation but not yet trusted as durable memory.

Candidate examples:

- "I am allergic to peanuts."
- "My therapist is Dr. Chen."
- "You can email my therapist if I am too tired."

Candidates must be shown to the user for confirmation before durable write.

### 4.3 Cache And Artifacts

The following are not durable memory:

- Homepage summaries.
- Data center view summaries.
- Advisor chat plans.
- Reflection reports.
- Tool traces.
- Raw prompt and model outputs.

They may be stored as cache or artifacts for performance, debugging, eval, and audit. Cache reuse must be keyed by a data fingerprint and generation metadata.

## 5. Data Model

### 5.1 `memory_candidates`

Stores extracted but unconfirmed memory.

Required fields:

- `id`
- `user_scope_id`
- `profile_id`
- `session_id`
- `source_message_id`
- `kind`
- `canonical_key`
- `payload_json`
- `evidence_quote`
- `confidence`
- `proposed_confirmation_text`
- `status`: `pending`, `confirmed`, `rejected`, `expired`, `superseded`
- `created_at`
- `updated_at`
- `expires_at`

Rules:

- Candidate payloads are not injected into Agent durable memory context.
- A candidate must retain source evidence.
- Expired candidates are hidden from normal confirmation UI.

### 5.2 `user_memory_facts`

Stores confirmed durable memory.

Required fields:

- `id`
- `user_scope_id`
- `profile_id`
- `kind`
- `canonical_key`
- `payload_json`
- `status`: `active`, `revoked`, `superseded`
- `sensitivity`
- `source_candidate_id`
- `created_at`
- `updated_at`
- `revoked_at`

Rules:

- `profile_id` is mandatory for profile-scoped memory.
- Read APIs must require `profile_id`.
- Active facts with the same `canonical_key` should be merged or superseded through revision logic, not duplicated blindly.

### 5.3 `memory_revisions`

Stores durable memory history.

Required fields:

- `id`
- `memory_fact_id`
- `revision_type`: `create`, `update`, `revoke`, `supersede`
- `previous_payload_json`
- `next_payload_json`
- `source_candidate_id`
- `created_at`

Rules:

- Corrections and revocations create revisions.
- Destructive deletion is not part of normal memory update flow.

### 5.4 `workflow_contacts`

Stores external workflow contacts.

Required fields:

- `id`
- `user_scope_id`
- `profile_id`
- `contact_type`: `therapist`, `coach`, `doctor`, `caregiver`, `other`
- `display_name`
- `email`
- `phone`
- `metadata_json`
- `status`: `active`, `inactive`
- `created_at`
- `updated_at`

### 5.5 `workflow_consents`

Stores user authorization for external actions.

Required fields:

- `id`
- `user_scope_id`
- `profile_id`
- `workflow_type`
- `contact_id`
- `scope_json`
- `status`: `active`, `revoked`
- `created_at`
- `updated_at`
- `revoked_at`

Rules:

- Consent must be explicit.
- Ambiguous chat language creates a candidate, not active consent.
- High-impact actions still require runtime confirmation unless product policy later defines a narrower pre-approved flow.

### 5.6 `workflow_outbox`

Stores external actions waiting for execution.

Required fields:

- `id`
- `user_scope_id`
- `profile_id`
- `workflow_type`
- `contact_id`
- `consent_id`
- `payload_json`
- `status`: `pending`, `processing`, `sent`, `cancelled`, `failed`
- `created_at`
- `updated_at`
- `processed_at`

Rules:

- External adapters consume outbox rows.
- The Agent never sends email or books appointments directly.

### 5.7 `workflow_events`

Stores audit events for workflow decisions and side effects.

Required fields:

- `id`
- `workflow_outbox_id`
- `event_type`
- `payload_json`
- `created_at`

### 5.8 `agent_cache_entries`

Stores derived cache entries.

Required fields:

- `id`
- `cache_type`
- `profile_id`
- `session_id`
- `cache_key`
- `data_fingerprint`
- `prompt_version`
- `model_version`
- `locale`
- `page_context_json`
- `payload_json`
- `created_at`
- `expires_at`

Rules:

- Cache entries are not durable memory.
- Cache payloads cannot be used as user facts.
- A cache hit requires matching fingerprint and generation metadata.

## 6. Runtime Architecture

```text
user message
  -> Agent request
  -> MemoryExtractor produces candidates
  -> deterministic candidate validation
  -> memory_candidates write
  -> response includes confirmation prompts when relevant
  -> user confirms or rejects
  -> confirmed candidate writes user_memory_facts + memory_revisions
  -> future Agent context reads active durable facts by profile
```

Workflow path:

```text
current context + confirmed memory + consent
  -> workflow policy evaluation
  -> proposed action
  -> user confirmation or active consent check
  -> workflow_outbox insert
  -> external adapter executes
  -> workflow_events append
```

## 7. Code Boundaries

### 7.1 Agent Core

Add interfaces, not vendor-specific persistence:

- `MemoryCandidateStore`
- `DurableMemoryStore`
- `MemoryExtractionService`
- `AgentCacheStore`
- `WorkflowStateStore`

`agent-core` owns schemas, validation, and prompt-facing memory contracts. It should not import Supabase clients, Prisma, AWS SDK, or Cloudflare bindings directly.

### 7.2 Agent API

`apps/agent-api` owns concrete adapters and request wiring:

- Supabase Postgres adapter initialization.
- Memory confirmation routes.
- Workflow contact and consent routes.
- Outbox execution worker or scheduled task.
- Cache adapter wiring.

For the demo, API routes remain the trusted backend boundary. Supabase Auth, browser-side database access, and production account linking are not required to demonstrate durable memory behavior.

### 7.3 Frontend

The frontend should support a confirmation surface for candidate memory:

- Show proposed memory text.
- Confirm.
- Reject.
- Edit if a later product pass needs it.

First version can support confirm/reject only.

## 8. Memory Extraction Contract

The extractor returns structured candidates. It does not write durable memory.

Candidate schema should include:

- `kind`
- `canonicalKey`
- `payload`
- `evidenceQuote`
- `source`
- `confidence`
- `proposedConfirmationText`
- `requiresConfirmation`

The deterministic validator must reject candidates without user-declared source evidence, candidates outside the supported taxonomy, and candidates that attempt to infer durable facts from sensor data or model reasoning.

## 9. Supported First Taxonomy

First implementation should support a narrow taxonomy:

- `allergy`
- `medical_constraint`
- `goal`
- `preference`
- `workflow_contact`
- `workflow_consent`
- `correction`
- `revocation`

This is enough for demo-critical memory and therapy appointment workflow preparation without introducing a broad personal knowledge graph.

## 10. Invalidations

Durable memory is not invalidated by sensor data changes because it represents confirmed user statements and consent.

Cache entries are invalidated by:

- Data fingerprint changes.
- Prompt version changes.
- Model version changes.
- Locale changes.
- Page context changes.
- TTL expiry.

Workflow consent is invalidated only by explicit revocation, admin cleanup, or product-defined expiry.

## 11. Migration Path

Phase 1:

- Add interfaces and in-memory implementations for tests.
- Add SQL schema and SQL adapter.
- Add candidate extraction and confirmation lifecycle.
- Move homepage/view/planner derived state to cache/artifact terminology.

Phase 2:

- Read confirmed durable memory into Agent context.
- Add memory-specific eval cases for allergy, preference, revocation, and profile isolation.
- Add UI confirmation surface.

Phase 3:

- Add workflow contacts and consent.
- Add mock email outbox adapter.
- Add workflow audit events.

Future readiness note, not part of the current demo:

- Keep a short future-readiness note for real email providers, production auth, retention, and export controls.
- Do not implement real email delivery in the current demo.
- Do not implement production Auth in the current demo.
- Use the Phase 1-3 schema and interfaces to keep the demo path compatible with those future decisions.

## 12. Testing

Unit tests:

- Extractor output schema validation.
- Candidate validation rejects inferred facts.
- Confirmation writes durable fact and revision.
- Rejection does not write durable fact.
- Revocation closes active fact through revision.
- Profile mismatch never returns another profile memory.

Integration tests:

- SQL adapter persists candidates and facts.
- Agent context reads only confirmed active facts.
- Cache entries are ignored when data fingerprint changes.
- Workflow outbox records proposed action only after confirmation or active consent.

Eval cases:

- User declares allergy, confirms, later chat respects it.
- User declares allergy but rejects memory, later chat does not treat it as durable fact.
- User corrects allergy, old fact is revoked or superseded.
- Profile switch does not leak confirmed facts.
- Therapist workflow creates proposed action, not direct external side effect.

## 13. Non-Goals

- Do not persist homepage or view summaries as durable memory.
- Do not let LLM-generated summaries become facts.
- Do not let the extractor write durable memory.
- Do not let the Agent directly execute external workflow actions.
- Do not build vector memory in the first implementation.
- Do not design a broad personal knowledge graph before the first taxonomy proves useful.

## 14. Completion Criteria

The design is implemented when:

- Durable memory has a repository interface and SQL adapter.
- Confirmed user facts survive backend restart.
- Unconfirmed candidates never enter durable Agent context.
- Derived summaries are stored only as cache/artifact data.
- Workflow contacts, consent, outbox, and events have reserved schema and interfaces.
- Tests cover confirmation, rejection, revocation, profile isolation, and cache invalidation.
