# Offline sync protocol

Implementation: server `src/lib/services/sync.ts` (+ routes in `src/lib/api/handlers.ts`), device `src/lib/offline/{store,sync-engine,http-transport}.ts`. Verified by `tests/sync-server.test.ts`, `tests/offline-store.test.ts`, `tests/offline-sync.test.ts` (results in `docs/MOBILE_QA_REPORT.md`).

## 1. Ids and versions

- Records created offline get a client-generated **UUID** (`crypto.randomUUID`, with a `getRandomValues` fallback for non-secure contexts). The server stores the record under that same id, so the device and the server never need an id mapping and a retry cannot create a second record. Non-UUID ids are refused.
- A record's **version** is the server's `updated_at` string. The device remembers the last version it saw (`sync.serverVersion`). Updates carry `expected_updated_at`; if the server's value differs the update is **not applied** (409 `stale_edit` → sync status `conflict`). Server timestamps are authoritative; device clocks are never used for ordering decisions.
- Per-record state on the device: `pending` (saved here, not acknowledged), `synced`, `failed`, `conflict`. A record is `synced` only after the server's per-operation answer.

## 2. Outbox (device)

Every record write and its outbox entry are committed in **one IndexedDB transaction** (record + operation together or neither). An entry holds: `opId` (UUID, idempotency key), `entityType` (visit | observation | commitment), `entityId`, `op` (create | update | delete | transition), `payload` (only the fields the server needs), `chain` (the visit id), `schemaVersion`, `createdAt`, `lastAttemptAt`, `nextAttemptAt`, `retryCount`, `status` (queued | inflight | failed | rejected | conflict), and a sanitized `errorCode`. No record text is written to the sync history or to diagnostics.

Coalescing: edits to a record whose create/update has not been sent are merged into that queued operation (a record edited five times offline sends one change). Deleting a record that never reached the server removes it and its queued operations without a server trace. Editing a record whose operation is in conflict is refused until the conflict is resolved.

## 3. Wire format

`POST /api/v1/sync/push` (session cookie required, mentors only, JSON ≤ 256 KB, **≤ 25 operations**):

```json
{ "account_id": "demo-mentor-asha",
  "ops": [ { "op_id": "uuid", "entity_type": "visit", "entity_id": "uuid", "op": "create",
             "payload": { "...": "..." }, "expected_updated_at": "optional", "created_at": "ISO", "schema_version": 1 } ] }
```

Response `{ data: { results: [...], server_time } }`, one result per operation, in order:

| status | meaning | device action |
|---|---|---|
| `applied` | change is on the server; `server_version` returned | remove from outbox, store version, record becomes `synced` if nothing else waits |
| `duplicate` | this `op_id` was already applied (a retry) | same as applied |
| `conflict` | server copy changed since the device's version; `server_record` returned; nothing was changed | keep local copy, store both versions, mark `conflict`, wait for the user |
| `rejected` | refused for a stable reason (`validation_failed`, `forbidden`, `not_found`, a state rule such as `feedback_already_approved`, `visit_locked`); remembered by the server | keep the operation and the user's text, mark `failed` with a plain reason; user can fix and retry (fresh `op_id`) or discard |
| `skipped` | an earlier operation on the same visit was not applied, so this one was not attempted | stays queued |
| `error` | temporary server problem; **not** remembered | retry with backoff |

`GET /api/v1/sync/snapshot` returns the mentor's assigned schools, their own recent visits (≤ 200) with observations and commitments, and the approved practice cards, plus `server_time`. It contains nothing about other mentors and only fields already visible to that user online.

## 4. Server guarantees

- **Idempotency:** terminal outcomes (`applied`, `rejected`) are stored in `sync_operations` (`op_id` primary key, `actor_id`, entity, status, response of ids and codes only). A repeated `op_id` returns the stored answer (`applied` → `duplicate`); another account replaying someone else's `op_id` is refused. A repeated `op_id` inside one batch is applied once.
- **Same rules as online:** operations call the existing service functions (authorization, ownership 404/403, Zod validation, state machine, audit). There is no weaker offline path. The one deliberate difference: a commitment created through sync is flagged `mentorAgreed` and may exist **without** an approved AI feedback card; it is stored with `feedback_id = NULL` and the audit entry says `mentor_agreed_without_feedback`. One active commitment per visit is enforced for both paths.
- **Account binding:** `account_id` in the body must equal the signed-in account (403 otherwise). The client also refuses to push when `/me` returns a different account than the one that owns the local database.
- **Ordering and partial failure:** operations on one visit are applied in order; after a failure on a visit, later operations on that visit are `skipped`; other visits still apply. A failed operation never marks others as synced.
- **Audit:** each push writes one `sync.pushed` audit entry containing status counts only.
- Rate limiting and body caps apply as for any mutation.

## 5. Client sync engine

Triggers: app start, network restored (`online` event), app visible again, a 30-second timer while anything waits, and the **Sync now** button. Background Sync is not relied on. Connectivity is established with a real request (`/api/v1/health`), not `navigator.onLine`.

Run: one sync at a time per account (in-tab map + Web Locks across tabs when available) → reset operations left `inflight` by a crash back to `queued` → `GET /me` (401 → `auth_expired`, nothing deleted; different account → `account_mismatch`, nothing sent) → send batches of ≤ 25 in outbox order (an operation needing the user, or waiting for its retry time, holds back only its own visit) → apply per-operation answers → pull the snapshot (refreshes confirmed records and cards; records with unsent changes are never overwritten) → record `lastSyncAt` only if the round trip completed.

Failure handling: network error, timeout, 5xx or 429 → every operation of that request becomes `failed`, `retryCount + 1`, `nextAttemptAt = now + backoff`. Backoff: `min(5 min, 2 s · 2^(retry-1)) × (0.5 … 1.0 jitter)`; a `Retry-After` is honoured. Automatic syncs skip operations that are not yet due; the manual button ignores the delay. Expired session: operations go back to `queued` unchanged and sync resumes after signing in again as the same account. A timeout after the server committed is safe because the retry gets `duplicate`.

## 6. Conflicts

Detected through `expected_updated_at`. The Sync Center shows both versions. **Keep mine**: the device version is re-sent on top of the server's current version (new `op_id`). **Use the server's version**: the device copy is replaced and the queued change removed. In both cases the conflict record keeps both versions as history; nothing is silently discarded. Server-side locks (for example feedback already approved) are reported as `rejected`, never overwritten.

## 7. Known protocol limits

- Field-level merging is not implemented: a conflict is per record, resolved wholesale.
- Deleting an observation that the server already has is queued as a `delete`; deletes performed on another device are removed locally at the next pull only when the local copy has no unsent changes.
- The snapshot is a bounded full snapshot (not incremental); it is meant for a mentor's own small dataset.
- Visits that the server accepted but that later change status on the server (for example completed by finalizing a report online) are refreshed by the pull; edits queued against a status the server no longer allows are `rejected` with a reason.
