# SAMVAAD known limitations

Plain statement of what this build is and is not, as of 2026-10-25 (V3 pass). Longer design notes live in `docs/limitations-and-assumptions.md` and `docs/privacy-and-safety.md`; the security-specific open items are in `docs/SECURITY_REVIEW.md` (R1–R9). Nothing here has been measured in a school.

## Readiness

- **Not production-ready. Release status: NO-GO for real users or real data** (open High finding R1: no real authentication). It is a runnable prototype/demo with fictional records.
- Local demo and automated tests pass (see `docs/QA_TEST_REPORT.md`); that shows the software behaves as designed, not that it improves mentoring or learning.

## Demo data and simulated AI

- Every school, teacher alias, visit, observation, commitment and report in the seeded database is **fictional** and labelled "DEMO DATA".
- The default AI provider is a deterministic template engine labelled "Simulated AI output". It is not a language model and its wording quality says nothing about a real model.
- The 12 original practice cards are illustrative, not NCERT/SCERT/DIET publications. The 9 source-backed card drafts and 19 verbatim excerpts from *NIPUN Bharat Guidelines* are **all `pending_review`**: no curator or education expert has approved them. Hindi text has not been reviewed by a Hindi-speaking education expert.
- The tagging rubric is a small demo taxonomy needing domain validation. No accuracy figures (Cohen's κ, draft usability, time saved) exist; pilot targets in the deck are targets, never results.

## Security and privacy

- **Authentication is a demo persona picker** (no credentials). With `DEMO_MODE=true` anyone who can reach the server can act as any role. `DEMO_MODE=false` disables sign-in (fails closed) but there is no replacement login yet.
- Rate limits, in-flight idempotency and the sign-in throttle are in process memory: they reset on restart, are not shared between instances, and without a trusted proxy all clients share one bucket.
- SQLite file is not encrypted; no backup, retention or erasure procedure; audit log is append-only by trigger but not cryptographically chained.
- CSP allows inline style *attributes* (scripts are nonce-only). CSRF defence is SameSite=Lax plus fetch-metadata checks, no token.
- `node:sqlite` is an experimental Node API.
- No SAST, DAST, secret-scanner product, SBOM, load test or external penetration test has been run. The secret scan was pattern-based.
- The Anthropic provider has **never been called against the live API** (only a local mock server). Enabling it sends observation text to a third party and needs legal/DPDP review first. Prompt-injection protection is structural (server-validated citations, approved sources only, mandatory human approval), not a guarantee about model behaviour.
- Audio, consent/redaction and ASR do not exist.

## Public data

- Real: UDISE+ 2024-25 and 2025-26 booklets (state/UT level), ASER 2024 state/district/divisional estimates for Rajasthan, Gujarat, Haryana, Uttar Pradesh, Madhya Pradesh, Bihar, Punjab, Uttarakhand. 3,845 values, 41 validation checks.
- **No school-level or Rajasthan district-level UDISE+ data** was obtainable. ASER is a rural household sample survey with sampling error, not school-level and not a measure of teaching quality. District estimates carry no confidence intervals in this release; divisional ones do.
- Values were extracted from PDFs; correctness rests on the printed headers plus the 53 cross-checks, not on machine-readable source files or independent re-keying.
- Blocked or unreachable sources (data.gov.in CSV 403, UDISE+ report module 503, microdata registration, Shala Darpan CAPTCHA, NCERT hosts, etc.) were **not** bypassed; see `docs/data_access_requests.md`.
- Source licences/terms were recorded as published; several give no explicit open licence, so raw files stay local (git-ignored) and only derived statistics with attribution are shown. Re-check terms before redistribution.
- The downloader's host allow-list cannot close DNS rebinding between check and connect; it is a developer-run script, not exposed over HTTP.
- Public data is context only: it is not used in visit prioritisation or any score.

## Product scope

- Text-only visit flow; no audio, offline/PWA sync, vector search, trained prioritiser/tagger, background reminders (SMS/WhatsApp), multi-language beyond English/Hindi drafts, or state-system integration.
- Teachers are visit-level aliases; there is no teacher table or longitudinal teacher profile by design.
- SQLite is single-writer; no performance testing; one Node process assumed.

## Testing limits

- Browser tests ran on Chromium only. axe-core covers a subset of accessibility issues; screen-reader output, modal focus-trap behaviour and cross-browser rendering were not checked.
- Persistence was tested by reopening a file database, not by crash/power-loss or backup/restore drills.

## Needed before real use

Real authentication and role provisioning; legal/DPDP review and state data-sharing agreement; teacher and head-teacher consent design; encryption at rest, backups and retention; shared rate-limit store and trusted proxy; curator-approved, expert-reviewed practice content (including Hindi); validated rubric; one supervised live AI test and red-team prompts; SAST/DAST/secret scanning in CI; screen-reader and low-end-device testing; a small supervised pilot with measured outcomes.

## Added in V5 (see `docs/V5_RELEASE_STATUS.md`)

- **Hindi is an AI-drafted translation and has not been reviewed** by a native-speaker educator; only English and Hindi exist (no Rajasthani dialects or other languages). The Hindi UI shows a visible "review required" notice.
- Data stays in its original language (school names, aliases, commitments, many practice cards, source titles, public indicator labels, registry notes), so Hindi screens can contain English data.
- **No offline mode**: the app needs an internet connection; unsaved text is kept in memory only and is lost if the tab crashes. Offline capture and sync are planned (Gate C), not implemented.
- No usability sessions with real mentors, no real-device (Android) tests, no screen-reader tests, no throttled-network tests; WCAG 2.2 AA is a target, not a claim (axe reports 0 violations on the scanned pages, which is not proof of conformance).
- UDISE+ 2025-26 was acquired from the public booklet; its NEP-format booklet was not used. The PIB release date (7 July 2026) was taken from the specification and search summaries, not read from the PIB page text.
- Dashboard and the public-data infrastructure table show 2024-25 by default; there is no period selector yet for UDISE+.

## Added in V6 (offline / mobile)

See `docs/MOBILE_KNOWN_LIMITATIONS.md`. In short: field mode works offline and is tested, but records on the device are **not encrypted**, there is no app lock or backup, unsynced records are lost if browser data is cleared or the phone is lost, Android packaging is not built, and nothing was tested on a real device.
