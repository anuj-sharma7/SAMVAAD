# SAMVAAD QA test report (V3 pass)

Run on this machine on 2026-10-25 (Windows 11, Node v24.14.0, npm 11.9.0, Next.js 16.4.3, Vitest 5.0.5, Playwright + Chromium). Everything below is a result actually observed in this session; where something was not run it says **NOT RUN**. Demo data is fictional and the default AI provider is a deterministic simulator; neither is evidence about real-world effectiveness.

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Type check (strict) | `npx tsc --noEmit` | **PASS** (exit 0) |
| Lint | `npx eslint src scripts tests e2e` | **PASS** (exit 0) |
| Unit / integration / security tests | `npx vitest run` | **PASS** 15 files, **207 tests**, 0 failed |
| Public-data validation | `npm run data:validate` | **PASS** 41/41 checks, 2 documented warnings |
| Production build | `npm run build` | **PASS** (compiled successfully) |
| Browser end-to-end + security + a11y | `node scripts/clean-e2e.mjs; npx playwright test` | **PASS** 12/12 (Chromium, ~57 s) |
| Dependency vulnerabilities | `npm audit` | **PASS** 0 vulnerabilities |
| Registry signatures | `npm audit signatures` | **PASS** 401 verified signatures, 116 attestations |
| Canary-secret bundle scan | build with fake `ANTHROPIC_API_KEY`, grep `.next` | **PASS** 0 hits (see §6) |
| Live Anthropic API call | — | **NOT RUN** (no key/credits; only a local mock server was used) |
| Screen-reader / manual assistive-tech audit | — | **NOT RUN** |
| Load / performance test | — | **NOT RUN** |
| SAST / DAST / secret-scanner products | — | **NOT RUN** (not installed) |
| External penetration test | — | **NOT RUN** |

## 2. Unit and integration tests (Vitest)

| File | Tests | What it covers |
|---|---|---|
| `api.test.ts` | 8 | API envelope, validation, workflow endpoints |
| `contrast.test.ts` | 16 | WCAG contrast ratios of every design-token pair |
| `db-seed.test.ts` | 4 | Migrations, constraints, append-only audit triggers, seed integrity |
| `workflow.test.ts` | 2 | Full cycle: visit → observation → feedback → approval → demonstration → commitment → follow-up → report |
| `safety.test.ts` | 28 | Citation validation, evaluative-language rejection, approval gating, role rules, k≥5 masking, CSV neutralisation, report snapshot |
| `knowledge-base.test.ts` | 12 | Excerpt review gating, retrieval, chunk snapshots, citation of verbatim text |
| `public-data.test.ts` | 15 | Ingest safety, values equal numbers printed in sources, suppressed ≠ zero, separation from operational tables |
| `security-sessions.test.ts` | 8 | Session create/resolve/revoke/expiry/length bounds; no hard-coded secret |
| `security-headers.test.ts` | 5 | CSP/headers on real `proxy` responses |
| `security-api.test.ts` | 24 | Body limit, rate limits (AI, sign-in, spoofed XFF), content-type, cross-site, fuzzed ids/params, DB-lock 503, request ids |
| `security-authz.test.ts` | 11 | IDOR/role matrix over every `:id` route × owner/other mentor/supervisor/curator/anonymous |
| `reliability.test.ts` | 8 | Stale-edit 409, idempotent creates (5 concurrent → 1 record), cross-user key isolation, persistence across DB reopen, FK/CHECK + rollback |
| `safe-fetch.test.ts` | 36 | Downloader SSRF/redirect/size guards, registry URLs all pass the allow-list |
| `ingest-hardening.test.ts` | 17 | 13 hostile/malformed file cases, size cap, row cap, mid-import rollback, idempotent re-import |
| `ai-provider-security.test.ts` | 13 | Real provider code against a **local mock** server: header-only key, error mapping, no key in errors/responses |
| **Total** | **207** | |

Failures observed and fixed during the pass (so the suite is known to detect them): 2 tests in `reliability.test.ts` failed on first run and exposed real bugs (concurrent idempotent requests both executed; editing an observation with empty optional fields returned 422); 1 test in `ai-provider-security.test.ts` exposed a raw `SyntaxError` escaping the provider on a non-JSON 200. All fixed and re-run green.

## 3. Browser tests (Playwright, production build)

| # | Test | Result |
|---|---|---|
| 1 | Mentor completes the whole cycle through the UI (dashboard → school → plan visit with overdue follow-up → observe → grounded feedback → approve → demonstrate → commitment → follow-up review → report), failing on any console/CSP/network error | PASS |
| 2 | Unauthorised access: anonymous redirect/401, other mentor 404 page, supervisor aggregate-only, curator approves a card | PASS |
| 3 | Mobile layout: drawer works, no horizontal overflow | PASS |
| 4 | Public education context is labelled, sourced and separate from demo records | PASS |
| 5 | Knowledge base: curator approves excerpts → mentor feedback cites verbatim excerpt | PASS |
| 6 | Security headers on real responses; CSP does not break pages | PASS |
| 7 | Stored XSS payloads in 12 free-text fields × 7 pages: no execution, no injected elements, no CSP violations; CSV export `text/csv` + `nosniff` | PASS |
| 8 | SQL-injection strings stored as data; schema intact; fuzzed query strings never 500 | PASS |
| 9 | Prompt injection inside an observation: draft not approved, no unapproved citation, no secret text | PASS |
| 10 | `.env`, `*.db`, `/src`, `package.json`, traversal encodings, `/backups/` not served | PASS |
| 11 | axe-core WCAG 2.0/2.1 A+AA scan of 9 pages (`/login`, `/dashboard`, `/schools`, `/visits`, `/visits/new`, `/commitments`, `/practice-library`, `/reports`, `/public-data`): 0 violations | PASS (after fixing F14) |
| 12 | Keyboard basics: first Tab lands on a control, `<main>` landmark, document language, persona button operable by Enter | PASS |

Screenshots of key screens are written to `e2e-screenshots/` (git-ignored). The e2e run uses its own database (`data/e2e.db`, removed by `scripts/clean-e2e.mjs`).

**Scope notes:** one browser (Chromium desktop profile; test 3 uses a mobile viewport). Not run on Firefox/Safari. axe finds only a subset of accessibility problems; modal focus-trap behaviour and screen-reader output were **not** verified.

## 4. End-to-end workflow verification (school visit → report)

Verified by test 1 (UI) and `workflow.test.ts` (service level), with the data-integrity assertions below:

1. Mentor plans a visit; an overdue prior commitment is surfaced automatically.
2. Observations are saved with evidence; rule-based tag *suggestions* stay unconfirmed until the mentor confirms.
3. Feedback draft is generated (simulated AI, labelled), citations are rebuilt server-side from retrieved **approved** cards only; invalid citation → whole draft discarded (`safety.test.ts`).
4. Mentor edits and **approves**; evidence becomes read-only after approval; stale concurrent edits get 409.
5. Demonstration script is generated from the approved card only; approved by the mentor.
6. Commitment created (one per approved feedback), follow-up review records outcome with evidence.
7. Report is generated from stored records, mentor summary edited, finalized (visit becomes completed, read-only); CSV export excludes observation text and neutralises formulas.
8. Audit log contains an append-only event for each step (UPDATE/DELETE blocked by triggers).

## 5. Real-data ingestion

- `npm run data:validate`: 41/41 checks (e.g. UDISE+ national internet share computes to 63.5% as printed; ASER state values equal district-table state values; divisional worked example 37.7% ± 4.54 reproduced). Warnings (not failures): *ASER Madhya Pradesh divisional file has no state-total row, cross-check skipped*; *ASER Punjab has no district-estimates file, cross-check skipped*.
- Ingestion tests: gate on validation report + manifest checksum, orphan/unvalidated source rejection, 13 hostile file cases, size/row caps, rollback on mid-import failure, idempotent re-run (no double counting), public tables have no foreign keys to operational tables.
- 3,845 indicator values from 24 parsed sources; 25 sources active in total (24 statistical + 1 teaching document); 38 sources catalogued. Full list with hashes and sizes: `docs/DATA_SOURCE_REGISTRY.md`.
- **Not covered:** correctness of PDF table extraction beyond the 41 cross-checks and the spot values in `public-data.test.ts`; no independent human re-keying of the tables.
- A live `npm run data:download` was run after the downloader hardening: existing files re-verified by signature + checksum, blocked sources re-recorded as blocked, one redirect to an unlisted host refused by the guard.

## 6. Secret exposure check (manual, reproducible)

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-CANARY-9f3a71c2d4e8b6"
npm run build
Select-String -Path .next\static\* -Pattern "CANARY-9f3a71c2d4e8b6" -Recurse   # expect no output
Select-String -Path .next\server\* -Pattern "CANARY-9f3a71c2d4e8b6" -Recurse   # expect no output
Remove-Item Env:ANTHROPIC_API_KEY; npm run build
```

Observed: 0 files contain the canary in `.next/static` and `.next/server`; 0 client chunks contain `node:sqlite`/`DatabaseSync`. Runtime responses with the key configured (`/me`, `/health`, `/ready`, `/dashboard`, `/schools`, `/visits`, `/audit`, malformed-path error) contain no key (`ai-provider-security.test.ts`). The pattern-based repository secret scan found no keys/tokens/private keys in tracked files (`.env*` is git-ignored except `.env.example`, which holds placeholders only).

## 7. Dependency and supply chain

`npm audit` → found 0 vulnerabilities. `npm audit signatures` → 401 packages with verified registry signatures, 116 with verified attestations. `npm ls` shows one *extraneous* package (`@tybys/wasm-util`, a transitive optional of the toolchain). Dependencies added in this pass: `@axe-core/playwright` (dev only). No SBOM or licence scan was produced.

## 8. Persistence and recovery

- File-database reopen test: visit, observation and audit rows survive close/reopen; migration runner re-run applies nothing twice (4 migrations recorded).
- FK violation and CHECK violation inside a transaction leave no partial writes.
- DB lock → 503 with `Retry-After`; `/ready` reports DB state.
- Not tested: power-loss/corruption recovery, backup/restore procedure (none exists yet), multi-process access.

## 9. Known gaps in this QA

See `docs/KNOWN_LIMITATIONS.md` and the "Open" table in `docs/SECURITY_REVIEW.md`. Most important: no real authentication (blocker), live AI provider never called, no screen-reader or cross-browser testing, no load testing, no independent security tooling or pen test.

## 10. Reproduce everything

```powershell
cd C:\dev\samvaad
npm install
npx tsc --noEmit
npx eslint src scripts tests e2e
npx vitest run
npm run data:validate
npm run build
node scripts/clean-e2e.mjs
npx playwright test          # starts its own server on port 3200 (stop anything using 3200 first)
npm audit
npm audit signatures
npm run data:registry-doc    # regenerates docs/DATA_SOURCE_REGISTRY.md
```
