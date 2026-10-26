# SAMVAAD build checklist and recorded results

Canonical project root: `C:\dev\samvaad`. Source documents preserved untouched in `docs/source/`.

## Milestones

- [x] **0 Inspect and plan.** Node 24, no Python → Next.js-only architecture (`docs/architecture.md`).
- [x] **1 Shell and design system.** Tokens, contrast-tested colours, responsive sidebar, banners, states.
- [x] **2 Data layer.** Migrations with CHECK constraints, append-only audit; fictional seed (8 schools, 12 visits, 12 illustrative cards).
- [x] **3 Text-only visit flow.**
- [x] **4 Grounded feedback.** Retrieval, provider interface, server-verified citations, approval.
- [x] **5 Demonstration, follow-up, report.**
- [x] **6 Roles, audit, tests.**
- [x] **0B (v2) Real-data discovery and source registry.** 38 sources attempted; `data/source_registry.csv`, `data/reports/ingestion_report.md`.
- [x] **3 (v2) Public-data ingestion and context UI.** Public Education Context, source catalogue, freshness, audit.
- [x] **4 (v2) Knowledge base.** 19 verbatim excerpts + 9 card drafts, review gating, excerpts shown in citations.
- [ ] **Audio and offline.** Not started by design.
- [ ] **Regional need indicator in prioritisation.** Deliberately not built: public data is context only.

## What was downloaded (v2)

25 sources `downloaded_and_validated` (24 parsed to indicators + 1 teaching source), 1 `report_downloaded`, 4 `public_page_only`, 1 `manual_download_needed`, 1 `registration_or_request_required`, 1 `captcha_or_interaction_blocked`, 5 `unavailable`.

| Source | File(s) in `data/raw/` (git-ignored) | Reference | Geography | Processed |
|---|---|---|---|---|
| UDISE+ 2024-25 Booklet (MoE) | `udise_2024_25_booklet.pdf` (11.8 MB) | UDISE+ 2024-25, cut-off 31 Mar 2025 | 36 states/UTs + India | 999 values (Tables 2.2, 2.5) |
| ASER 2024 state pages | 8 PDFs (Rajasthan, Gujarat, Haryana, UP, MP, Bihar, Punjab, Uttarakhand) | ASER 2024 | state (rural) | 80 values |
| ASER 2024 district estimates | 7 PDFs (all above except Punjab: none published) | ASER 2024 | 250 districts | 1,542 values (12 marked not published) |
| ASER 2024 divisional estimates | 8 PDFs | ASER 2018 / 2022 / 2024 | 61 divisions, with 95% CI | 1,224 values |
| ASER 2024 national findings | `aser_2024_national_findings.pdf` | ASER 2024 | national | not parsed |
| NIPUN Bharat Guidelines (DIKSHA copy) | `kb_nipun_bharat_guidelines.pdf` (24 MB) | 2021 | national | 19 excerpts (teaching KB, not statistics) |

Total processed: **3,845 indicator values** in `data/processed/indicators_long.csv`.

## Blocked or unavailable (nothing bypassed)

data.gov.in UDISE+ 2023-24 CSV (HTTP 403 to scripted download) · UDISE+ report module (HTTP 503) · UDISE+ microdata (registration/request) · Rajasthan Shala Darpan reports and school search (CAPTCHA) · NCERT Vidya Pravesh, NAS 2021 reports, NIPUN roles PDF (host unreachable / 404) · `scert.parakh.ncert.gov.in` (certificate verification failed; not disabled) · dsel statistics page and data.gov.in catalogue (client-rendered, no files in served HTML) · DIKSHA datasets page (usage data, not needed). See `docs/data_access_requests.md`.

## Recorded results (run on this machine, 2026-10-25)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass, 0 errors |
| `npx eslint src scripts tests e2e` | pass, 0 problems |
| `npm test` (Vitest) | **85 / 85 passed**, 7 files: schema/seed (4), workflow (2), safety/authorization/citations (28), REST API (8), WCAG contrast (16), public data (15), knowledge base (12) |
| `npm run data:validate` | **41 / 41 checks passed**, 2 warnings (MP divisional file has no state row; Punjab has no district file) |
| `npm run data:refresh` | runs end to end (download/verify → normalize → validate → excerpt extraction → registry → import); re-runs are idempotent |
| `npm run build` | pass, 26 routes |
| `npm run test:e2e` (Playwright, Chromium, production build) | **5 / 5 passed**: full coaching cycle; unauthorised access and roles; mobile layout (10 pages, no horizontal overflow); public context (labels, provenance, separation); curator approves official excerpts and mentor feedback cites the verbatim excerpt |

Bugs found by tests and fixed during v2: `node:sqlite` null-prototype rows crashed Client Components (fixed at the DB helper); Uttarakhand "Data insufficient" districts were dropped (now kept as suppressed); Punjab's divisional file was mislabelled as district; a weak test regex was hiding a no-op (rewritten and asserted); misleading single-state source citation on a multi-state chart (each row now cites its own file).

## Not verified / outstanding

- The 19 excerpts and 9 official-source card drafts have **not been reviewed by any education expert or curator**; all are pending review. Excerpt selection was proposed by the developer assistant.
- No Hindi text exists for official-source cards; Hindi drafts fall back to English and show a notice.
- Anthropic provider never called against the live API.
- ASER/UDISE+ values were parsed from PDFs and cross-checked internally (arithmetic, cross-file consistency, one external figure from the deck); they have not been compared against an independent machine-readable copy because data.gov.in refused scripted download.
- No Rajasthan school- or block-level directory, no NAS results, no live government integration.
- No screen-reader audit; no load testing.

## V3 security, QA and real-data pass (2026-10-25)

Baseline snapshot: `backups/baseline-before-v3-20261025-215535.tar.gz` (git-ignored). Full evidence: `docs/QA_TEST_REPORT.md`, `docs/SECURITY_REVIEW.md`, `docs/SECURITY_THREAT_MODEL.md`, `docs/DATA_SOURCE_REGISTRY.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/RELEASE_CHECKLIST.md`.

- [x] Server-side hashed revocable sessions (replaced stateless cookie + default secret)
- [x] Nonce CSP + security headers; body/rate limits; safe errors with request ids
- [x] IDOR/role matrix (found and fixed a curator listing flaw)
- [x] Stale-edit (409) and idempotent create protection (found and fixed a concurrency race)
- [x] Downloader SSRF/redirect/size guard; ingest bounds, duplicate rejection, rollback
- [x] XSS, SQLi, prompt-injection, secret-exposure, axe accessibility tests (fixed `<dl>` markup and login `<main>`)
- [x] AI provider error mapping tested against a local mock server (fixed non-JSON 200 handling)

| Check | Result (2026-10-25) |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx eslint src scripts tests e2e` | pass |
| `npx vitest run` | **207 / 207 passed**, 15 files |
| `npm run data:validate` | 41 / 41, 2 warnings |
| `npm run build` | pass |
| `npx playwright test` | **12 / 12 passed** |
| `npm audit` / `npm audit signatures` | 0 vulnerabilities / 401 signatures verified |

Release decision: **NO-GO for production** (no real authentication). Local fictional-data demo: GO.

## V5 pass (2026-10-25)

Baseline: `docs/BASELINE_STATUS.md`. Results and gates: `docs/V5_RELEASE_STATUS.md`.

- [x] English + Hindi interface (1,408 keys, parity-tested), language switcher, locale-aware dates/numbers
- [x] First-run tour, Help and glossary, pre-visit brief, teacher action summary
- [x] Browser-storage draft removed; in-memory unsaved-changes warning
- [x] UDISE+ 2025-26 booklet acquired, parsed, validated (53 checks); data dictionary
- [x] axe fix (visit step links), Hindi/mobile/zoom/keyboard e2e tests

| Check | Result |
|---|---|
| tsc / eslint | pass / pass |
| `npx vitest run` | 222 / 222 (17 files) |
| `npm run data:validate` | 53 / 53, 2 warnings |
| `npx playwright test` | 20 / 20 |

Gate A PASS, Gate B PASS, Gate C NOT MET, Gate D NOT MET. Hindi text is unreviewed.

## V6 pass: mobile, offline-first, secure sync (2026-10-26)

Baseline: `docs/MOBILE_OFFLINE_BASELINE.md`. Decision: `docs/MOBILE_ARCHITECTURE_DECISION.md` (PWA now; Capacitor and native encrypted storage evaluated, not built). Results: `docs/MOBILE_QA_REPORT.md`.

- [x] Server sync API (`/sync/push`, `/sync/snapshot`), idempotent via `sync_operations` (migration 0006), client-generated UUIDs
- [x] On-device store (IndexedDB per account), transactional outbox, migrations, conflicts, wipe guard
- [x] Sync engine: backoff with jitter, partial sync, expired session, account binding, conflict capture
- [x] Field mode UI (English/Hindi): visits, observations, next step, local draft report, practice cards, Sync Center, status bar
- [x] PWA: manifest, icons, service worker (public shell + static assets only), offline page, sign-out warning
- [x] Bug found by tests: Hindi teacher aliases with vowel signs were rejected by the server (fixed)

| Check | Result |
|---|---|
| tsc / eslint | pass / pass |
| `npx vitest run` | 316 / 316 (24 files) |
| `npm run data:validate` | 53 / 53 |
| `npx playwright test` | 27 / 27 (incl. 7 offline tests with browser restart) |
| `npm audit` | 0 vulnerabilities |
| Android debug build, real-device tests | not built / not tested |

Not done: encryption at rest, app lock, backup/export, Capacitor/Android, background sync. Field-pilot gate NOT met.
