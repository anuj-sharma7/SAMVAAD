# Privacy and safety

Privacy-by-design controls built into the prototype. **This document is not legal advice and the product does not claim compliance with the DPDP Act 2023 or any government standard.** Legal and administrative review is required before any real deployment.

## What is and is not collected

- No child names, no student table, no child-level AI output. Observation forms tell the mentor not to name children.
- Teachers appear only as short aliases (e.g. `T-101`); alias entry rejects unusual characters.
- **Audio is off.** No recording, upload or transcription exists. `visits.audio_consent` is always `not_requested`.
- No video analysis, no face recognition.
- Demo data is fictional and labelled everywhere (`DEMO DATA — FICTIONAL RECORDS`, per-record "Demo · fictional" tags).

## Retention

No audio or other recordings are stored, so there is nothing to auto-delete. The deck proposes audio deletion within at most 30 days. **Automatic deletion is not implemented** because the feature it protects does not exist. Before audio is added: consent from teacher and head teacher, on-device redaction of children's names (never claimed perfect), restricted storage, a configurable retention period (≤ 30 days), user-visible deletion, and tested failure handling.

## Access control (server-side)

| Role | Can | Cannot |
|---|---|---|
| Mentor | Own visits at actively assigned schools; approve own feedback; manage commitments and reports | Another mentor's records (HTTP 404); the library; schools admin |
| Supervisor | Operational metadata; aggregates with min. group 5; priority rules; audit trail | Observation/feedback/commitment text; teacher aliases (masked as "—") |
| DIET curator | Practice-card library and its audit trail | Any visit content |

Checks live in service functions (`src/lib/auth/policy.ts`, `services/access.ts`), not in the UI. Tests cover cross-mentor access, supervisor masking, curator limits, forged cookies, cross-origin posts and non-JSON bodies.

## AI safeguards

- AI drafts; the mentor edits and explicitly approves. A failed generation never approves anything.
- Every citation is rebuilt from the database and must be among the approved cards retrieved for that visit. Unapproved, unretrieved or invented ids are discarded.
- No approved evidence → "Insufficient approved evidence"; the mentor can write a card manually but cannot approve it without an approved source.
- Retrieved text and mentor notes are wrapped as untrusted data in prompts; the server's checks do not depend on the model obeying instructions (tested with an injection-laden card).
- Output with evaluative language about a teacher (ratings, "poor teacher", "7/10") is rejected. No scoring or ranking feature exists.
- No training or fine-tuning on teacher data.
- The API key lives only in the server environment; it is never returned to the client or written to logs or the audit trail.

## Audit trail

Append-only (database triggers block UPDATE and DELETE). Records AI generation, edits (field names only), approvals, rejections, tag decisions, commitments, reports, library changes and rule changes. Metadata is limited to ids, statuses and counts; keys containing `key`, `secret`, `token`, `password`, `audio` or `transcript` are dropped.

## Aggregate reporting

Supervisor views count **distinct teachers** per teaching domain and hide any group smaller than 5 (no count, no names). Coaching data is for support, never for appraisal, transfer or discipline.

## Exports

The CSV export contains structured visit fields only (no observation text, evidence or free-text notes). Cells are neutralised against spreadsheet formula injection.

## Public data and the knowledge base (v2)

- Only aggregate public statistics are stored (state, division, district). No school contact, headmaster, student or staff field is collected. The Shala Darpan pages that expose such fields were not scraped (and are CAPTCHA-protected).
- Real public data and fictional operational data live in separate tables with no foreign keys between them (tested). Public context is never used for teacher-level output or visit prioritisation.
- Importing is gated: validation failures or a changed processed file cause rejection, which is audited (`dataset.rejected`). Imports, updates and activations are audited (`dataset.imported`, `dataset.updated`, `dataset.activated`).
- Knowledge-base excerpts are untrusted text: stored verbatim, rendered as plain text (never as HTML), passed to models inside delimiters, and usable only after human approval. A rejected excerpt immediately withdraws every approved card that relied on it.
- Written CSV files neutralise spreadsheet formulas; the parser handles BOMs, quotes and embedded newlines and rejects ragged rows.

## Known gaps

Demo authentication (no passwords), no encryption-at-rest beyond what the host provides, no rate limiting, no data-subject request tooling, no automatic retention jobs. See `limitations-and-assumptions.md`.
