# API contract (`/api/v1`)

All endpoints are served by `src/lib/api/handlers.ts`. Authentication is the signed demo session cookie `samvaad_session` (set by `POST /session`). This is **demo authentication**, not production identity.

**Envelope.** Success: `{ "data": … }`. Failure: `{ "error": { "code", "message", "details?" } }`.
**Status codes.** 200/201 success · 400 bad JSON · 401 not signed in · 403 role not permitted (or cross-origin) · 404 not found *or belongs to another mentor* · 405 · 409 state conflict (e.g. `invalid_transition`, `feedback_locked`, `citation_required`) · 415 non-JSON body · 422 validation (`details` maps field → message) · 429/502/503 AI provider failures (`ai_*` codes) · 500 generic (no internals).
**Mutations** must be JSON, same-origin. Generation endpoints accept an `Idempotency-Key` header: repeating the key returns the first result instead of creating a duplicate.

| Method · path | Role | Notes |
|---|---|---|
| GET `/health`, `/ready` | public | Health includes the AI provider status. |
| GET `/session/personas` · POST `/session` · DELETE `/session` | public | Demo persona sign-in/out. |
| GET `/me` · PATCH `/me` | any | Profile, AI status; `{preferred_language}`. |
| GET `/dashboard` | any | Shape depends on role. |
| GET `/priorities` | mentor | Rule-based school priorities with reasons. |
| GET `/analytics/practice-gaps` | supervisor | Distinct-teacher counts per domain; groups < 5 suppressed. |
| GET/PUT `/settings/priority-rules` | any / supervisor | Inspectable, validated rules. |
| GET `/audit` | any | Mentor: own events · supervisor: all · curator: library only. |
| GET/POST `/schools` · GET `/schools/:id` · POST `/schools/:id/assignments` | read: any · write: supervisor | Mentors only see assigned schools. |
| GET/POST `/visits` · GET/PATCH `/visits/:id` · POST `/visits/:id/transition` | mentor (list also supervisor, masked) | `transition` cannot reach `completed`. |
| GET/POST `/visits/:id/observations` · PATCH/DELETE `/observations/:id` · POST `/observations/:id/tags` | mentor | Tags: `{confirm[], dismiss[], add[]}`. |
| GET/POST `/visits/:id/feedback` · PATCH `/feedback/:id` · POST `/feedback/:id/approve` · POST `/feedback/:id/reject` | mentor | See below. |
| GET/POST `/visits/:id/demonstration` · PATCH `/demonstrations/:id` · POST `/demonstrations/:id/approve` | mentor | Requires approved feedback. |
| GET `/visits/:id/commitment-suggestion` · GET/POST `/commitments` · GET/PATCH `/commitments/:id` · POST `/commitments/:id/review` | mentor | |
| GET `/reports` · GET `/reports/export` (CSV) · GET/POST/PATCH `/visits/:id/report` · POST `/visits/:id/report/finalize` | mentor | Finalize needs approved feedback + a commitment. |
| GET `/practice-cards` · GET `/practice-cards/:id` | any (non-curators see approved only) | |
| POST `/practice-cards` · PATCH `/practice-cards/:id` · POST `/practice-cards/:id/review` | diet_admin | PATCH creates a new version and returns the card to draft. |

| GET `/public/sources` · `/public/sources/:id` · `/public/indicators` · `/public/values?indicator=&level=&state=&period=` · `/public/snapshot?state=` · `/public/freshness` | any | Real public statistics with provenance. Read-only. |
| GET `/knowledge/chunks/:id` · POST `/knowledge/chunks/:id/review` | diet_admin | Verbatim source excerpts. Approve/reject; rejecting returns cards that rely on it to draft. |

## Examples

`POST /visits/:id/feedback` body `{ "language": "hi" }` → 201

```json
{ "data": {
  "id": "…", "status": "draft", "language": "hi", "is_simulated": true, "provider": "demo",
  "strength": "…", "priority_practice": "…", "next_step": "…",
  "ask_question": "…", "describe_statement": "…", "ask_again_question": "…",
  "evidence": [{ "observation_id": "…", "quote_or_summary": "…" }],
  "citations": [{ "practice_card_id": "R-14", "card_version": 2, "source_title": "Illustrative practice card: …",
                  "source_section": "Card R-14", "source_url": null, "relevance_reason": "…", "retrieved_rank": 1, "is_primary": true }],
  "retrieval_trace": { "candidates": [{ "card_id": "R-14", "score": 31.5, "matched_terms": ["…"], "reasons": ["…"] }] }
} }
```

No approved card matches → 201 with `"status": "insufficient_evidence"`, no text, no citations.
Provider failure → `502 { "error": { "code": "ai_insufficient_credits", "message": "The AI account has insufficient credits." } }`, nothing saved.
Approve with no source → `409 citation_required`. Cite an unapproved card → `422 validation_failed`.

`POST /commitments/:id/review` body `{ "review_visit_id", "outcome": "tried_needs_support", "evidence", "barriers", "notes" }`. Evidence is required unless `not_tried`; barriers are required unless `tried_working`.

## Offline sync (V6)

Full protocol: `docs/OFFLINE_SYNC_PROTOCOL.md`. Mentors only; session cookie required.

`POST /sync/push` body `{ "account_id": "<signed-in account>", "ops": [ { "op_id": "uuid", "entity_type": "visit|observation|commitment", "entity_id": "uuid", "op": "create|update|delete|transition", "payload": {…}, "expected_updated_at": "optional", "created_at": "ISO", "schema_version": 1 } ] }` (1 to 25 operations) → 200 `{ "data": { "results": [ { "op_id", "status": "applied|duplicate|conflict|rejected|skipped|error", "server_version?", "server_record?", "code?", "message?" } ], "server_time" } }`. `account_id` different from the session → 403. A repeated `op_id` returns the stored result (`duplicate`).

`GET /sync/snapshot` → the mentor's assigned schools, recent visits with observations and commitments, and approved practice cards, plus `server_time` and the account.

`PUT /locale` (no session needed) body `{ "locale": "en|hi" }` sets the interface-language cookie (and remembers it on the profile when signed in).

`GET /visits/:id/brief` and `GET /visits/:id/action-summary` (V5) return the pre-visit brief and the teacher-facing summary.
