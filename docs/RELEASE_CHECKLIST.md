# SAMVAAD release checklist

Status date: 2026-10-25. Legend: ✅ done and verified in this repo · ⛔ open (blocks the stated release) · ⚪ not applicable / not run.

## Decision

| Release target | Decision | Reason |
|---|---|---|
| Local demo with fictional data (`npm run dev`, `npm run build; npm run start`) | **GO** | All automated checks pass; data and AI output are labelled demo/simulated |
| Shared internal demo on a trusted network | **GO with care** | Only with `DEMO_MODE=true`, fictional data, behind network access control (anyone reaching it can pick any persona) |
| Pilot with real teachers/visit data, or any internet-facing deployment | **NO-GO** | Open **High** finding R1 (no real authentication) plus R3/R7 (no encryption at rest/retention policy; third-party AI processing unreviewed) |

A critical or high open issue means NO-GO for production. R1 is the one.

## 1. Build and verification gates (all must be green before any release)

- ✅ `npx tsc --noEmit` exit 0
- ✅ `npx eslint src scripts tests e2e` exit 0
- ✅ `npx vitest run` 17 files / 222 tests pass (V5)
- ✅ `npm run data:validate` 53/53 (V5)
- ✅ `npm run build` succeeds
- ✅ `node scripts/clean-e2e.mjs; npx playwright test` 20/20 pass in V5 (includes Hindi, XSS, SQLi, prompt-injection, secret-exposure, axe)
- ✅ `npm audit` 0 vulnerabilities; `npm audit signatures` OK
- ✅ Canary-key bundle scan: 0 hits (`docs/QA_TEST_REPORT.md` §6)
- ⚪ Live Anthropic call — NOT RUN
- ⚪ SAST/DAST/secret-scanner products, load test, cross-browser, screen-reader — NOT RUN

## 2. Security gates

- ✅ Server-side hashed, revocable sessions; no signing secret in code or docs
- ✅ Role + ownership checks on every route (IDOR matrix); 404 for other users' records
- ✅ CSP (nonce), security headers, no `dangerouslySetInnerHTML`
- ✅ Body-size cap, rate limits, validation (Zod), safe errors with request ids
- ✅ Append-only audit log; human approval before any AI draft becomes final; citations validated server-side
- ✅ Downloader and ingest hardened and tested
- ⛔ **Real authentication** (R1) — blocks production
- ⛔ Encryption at rest, backup, retention/erasure (R3)
- ⛔ Shared rate-limit store + trusted reverse proxy configuration (R2)
- ⛔ Legal/DPDP review before enabling a third-party AI provider (R7)
- ⛔ Independent penetration test / SAST / DAST (R8)

## 3. Data gates

- ✅ Every dataset has a registry entry with source, period, geography, hash, size, retrieval time, rights note (`docs/DATA_SOURCE_REGISTRY.md`)
- ✅ Blocked sources recorded as blocked, never bypassed (`docs/data_access_requests.md`)
- ✅ Import only after validation report + checksum match
- ⛔ Curator review of the 19 knowledge-base excerpts and 9 card drafts (all `pending_review`)
- ⛔ Expert review of Hindi text and the rubric taxonomy
- ⛔ Re-check licences/terms before redistributing any data

## 4. Configuration for a deployment (when R1 is closed)

| Variable | Value |
|---|---|
| `DEMO_MODE` | `false` once real auth exists (disables persona sign-in) |
| `NODE_ENV` | `production` (`next start`) – cookie gets `Secure` |
| `SAMVAAD_HTTPS` | `true` behind HTTPS (HSTS, upgrade-insecure-requests) |
| `SAMVAAD_TRUST_PROXY` | `true` only behind a proxy that overwrites `X-Forwarded-For` |
| `SAMVAAD_DB_PATH` | path on an encrypted volume with backups |
| `AI_PROVIDER` | keep `demo` until R7 is closed; then `anthropic` with `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` set in the server environment only |

## 5. Sign-off record

| Item | Owner | Date | Evidence |
|---|---|---|---|
| Automated gates §1 | engineering | 2026-10-25 | `docs/QA_TEST_REPORT.md` |
| Security review | engineering (self-review, not independent) | 2026-10-25 | `docs/SECURITY_REVIEW.md` |
| Legal/DPDP | — | — | not started |
| Content review (curator + Hindi) | — | — | not started |
| Pilot go/no-go | — | — | not started |

## V5 gate summary (details in `docs/V5_RELEASE_STATUS.md`)

Gate A judge-demo MVP: PASS. Gate B real data: PASS. Gate C field pilot: NOT MET (real authentication, offline/sync, reviewed Hindi and content, privacy/legal review, backup/restore drill, field usability test). Gate D production: NOT MET.

## V6 mobile/offline gate summary (details in `docs/MOBILE_QA_REPORT.md`, `docs/MOBILE_SECURITY_REVIEW.md`)

| Gate C item (V5 §69) | Status |
|---|---|
| Offline capture | **Done and tested** for visits, observations and one next step (PWA field mode, real browser offline + restart test) |
| Queued sync, retry/recovery, idempotency | **Done and tested** (unit + browser) |
| Conflict handling | **Done and tested** (per record; both versions kept) |
| Logout / account-switch behaviour | **Done and tested** (warning, no deletion, per-account databases) |
| Safe local storage | **NOT met**: IndexedDB is not encrypted, no app lock, no backup; native encrypted storage recommended and not built |
| Android packaging and device tests | **Not built / not tested** (no JDK/SDK here) |
| Real authentication, reviewed Hindi/content, privacy/legal review, backup/restore drill, field usability test | still open |

Field-pilot readiness (Gate C): **NOT MET**. Production (Gate D): NOT MET.
