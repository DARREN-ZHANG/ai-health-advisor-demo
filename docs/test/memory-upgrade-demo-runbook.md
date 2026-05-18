# Memory Upgrade Demo Runbook

## Local in-memory demo

1. Start API with `MEMORY_BACKEND=memory`, `FALLBACK_ONLY_MODE=false`, a valid LLM key, and `MEMORY_EXTRACTION_ENABLED=true`.
2. Start web app.
3. Open Advisor chat.
4. Send: `我对花生过敏`.
5. Confirm the memory candidate card.
6. Send: `我今天适合吃花生酱补充能量吗？`
7. Expected: answer acknowledges the confirmed peanut allergy and avoids treating peanut butter as suitable.

## Supabase demo

1. Apply `supabase/migrations/202605180001_memory_upgrade.sql` to the Supabase project.
2. Set `MEMORY_BACKEND=supabase`.
3. Set `SUPABASE_DB_URL` to the backend Postgres connection string.
4. Repeat the local demo.
5. Restart the API.
6. Repeat step 6.
7. Expected: confirmed allergy still influences the answer after restart.

## Workflow mock

1. Confirm a therapist contact candidate when the extractor returns one.
2. Confirm a therapist outreach consent candidate when the extractor returns one.
3. Call `POST /workflows/therapist-outreach/propose`.
4. Expected: backend returns a pending mock outbox item persisted in `workflow_outbox`.
5. Expected: backend persists an `outbox_created` event in `workflow_events`.
6. Expected: no real email is sent.
