# SAMVAAD security review (V3 pass)

Date: 2026-10-25. Reviewer: automated engineering pass by Claude Code in this repository (code reading + targeted tests + browser tests). Baseline snapshot taken before any V3 change: `backups/baseline-before-v3-20261025-215535.tar.gz` (git-ignored).

**Verdict: NO-GO for production / real user data.** One High finding is open by design (no real authentication, R1). The local demo with fictional data is runnable and the controls below are verified by the tests named in each row. This is *not* a claim that the system is secure; it is a record of what was checked, what was fixed and what was not.

## 1. Method and its limits

What was done: baseline inspection (git state, dependency audit, pattern-based secret scan, response-header check, grep for dangerous APIs); manual review of auth, authorisation, API router, services, ingestion and AI code; test-first fixes with regression tests; browser (Playwright/Chromium) tests against a production build; automated accessibility scan (axe-core); canary-secret build scan.

What was **not** done (no tool available, or out of scope): SAST product (Semgrep/CodeQL), secret-scanner product (gitleaks/trufflehog), DAST (ZAP), fuzzing beyond the hand-written cases, dependency licence/SBOM scan, load/DoS testing, external penetration test, live Anthropic API call, screen-reader testing. The secret scan was regex-based (provider key formats, private-key headers, `password=`/`secret=` assignments) and is weaker than a real scanner.

## 2. Findings

Severity uses likelihood × impact for *this* application in its intended pilot use. "Verified by" names a test that fails without the fix.

### Fixed in this pass

| ID | Sev | Finding | Fix | Verified by |
|---|---|---|---|---|
| F1 | **High** | Session tokens were stateless HMAC cookies signed with a **hard-coded default secret**; no server-side revocation, so logout did not invalidate a token and anyone knowing the default could mint a session for any user. | Replaced by random 32-byte server-side sessions (only SHA-256 stored), 12 h TTL, revocation on sign-out, length bounds; `SESSION_SECRET` removed from code, `.env.example`, README, e2e config. | `tests/security-sessions.test.ts` (incl. source grep for the old secret) |
| F2 | Medium | No security headers or CSP. | `src/proxy.ts`: per-request nonce CSP (`script-src 'self' 'nonce' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri/form-action 'self'`), `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS+`upgrade-insecure-requests` when `SAMVAAD_HTTPS=true`; API responses `no-store`. | `tests/security-headers.test.ts`; e2e loads every key page with CSP active and fails on any console/CSP error |
| F3 | Medium | No request-size or rate limits (AI endpoint abuse = cost + DoS). | 256 KB cap (413 by Content-Length and by streamed read), token buckets: general 600/min, mutation 180/min, AI 12/min/user, sign-in 20/min, export 20/min; 429 + `Retry-After`; AI provider not called after limit. | `tests/security-api.test.ts` |
| F4 | Low | `?limit=NaN` etc. produced a 500. | `.catch(100)` bounds + Zod coercion. | `security-api.test.ts` |
| F5 | Medium | **Broken access control found by the IDOR matrix**: a DIET curator (library-only role) could call `GET /visits` and list unmasked visit rows. | `listVisits` forbidden unless mentor/supervisor; `schoolExtras` returns no visits for curators. | `tests/security-authz.test.ts` (regression) |
| F6 | Low | Malformed percent-encoding in a path (`%E0%A4%A`) risked an unhandled exception. | Decode errors → 400. | `security-api.test.ts` |
| F7 | Low→Medium | **Lost updates and duplicate submissions.** Two tabs could silently overwrite each other; a double-click created two visits/observations. Writing the tests exposed a second bug: concurrent identical requests with the same `Idempotency-Key` both ran (check-then-insert race). | `expected_updated_at` optimistic concurrency → 409 `stale_edit` on observations, feedback, demonstrations, report summary (UI sends it); `Idempotency-Key` on visit/observation creation; in-flight map shares the first request's result. | `tests/reliability.test.ts` (5 concurrent posts → 1 visit; key not replayable across users) |
| F7b | Low | Functional bug found by the same tests: editing an observation that had empty optional fields returned 422 (stored NULL vs schema `optional`). | NULL→undefined mapping before merge. | `reliability.test.ts` |
| F8 | Low | SQLite lock/busy surfaced as generic 500. | Mapped to 503 + `Retry-After`; constraint errors to safe 409/422. | `security-api.test.ts` (strict 503) |
| F9 | Info | No request ids for correlating errors. | `x-request-id` on every API response and in error bodies. | `security-api.test.ts` |
| F10 | Medium | Public-data downloader followed redirects blindly with no host restriction or size cap (SSRF / runaway download / redirect to internal address). | `scripts/data/safe-fetch.ts`: https-only, registry-derived host allow-list, manual redirect handling (≤5, each hop re-validated), refusal of IP literals/localhost/`.local`/`.internal`/private/link-local/metadata (also after DNS resolution), credentials-in-URL refused, 60 MB streamed cap. Live run confirmed behaviour (a source that previously redirected to an unlisted host is now recorded as "Refused by download guard"). | `tests/safe-fetch.test.ts` |
| F11 | Low | Ingest accepted non-finite numbers, unbounded fields/rows, duplicate rows (double counting) and could throw mid-transaction. | Per-field caps, finite-number refinement, 20 MB / 100 k-row limits, NUL/U+FFFD rejection, duplicate-key rejection, transaction failure → rollback → recorded rejection with previous data intact. | `tests/ingest-hardening.test.ts` |
| F12 | Low | Per-client rate limits keyed on client-controlled `X-Forwarded-For`: rotating the header bypassed the sign-in limit. | Header ignored unless `SAMVAAD_TRUST_PROXY=true`; then the last (proxy-appended) entry is used. | `security-api.test.ts` |
| F13 | Low | A 200 response with a non-JSON body (captive portal/proxy) made the Anthropic provider throw a raw `SyntaxError` containing part of the body. | Mapped to a static `malformed_output` error. | `tests/ai-provider-security.test.ts` (local mock server) |
| F14 | Medium (a11y, WCAG 1.3.1) | axe: `definition-list` violations on `/dashboard` and `/public-data` (non-`dt/dd` children inside `<dl>`); login page had no `<main>` landmark. | Markup fixed. | `e2e/security.spec.ts` axe scan (9 pages, WCAG 2.0/2.1 A+AA tags) |

### Open (not fixed)

| ID | Sev | Finding | Why open | Mitigation today | What closes it |
|---|---|---|---|---|---|
| **R1** | **High** | **No real authentication.** Demo sign-in is a persona picker; with `DEMO_MODE=true` anyone who can reach the server can act as any role, including supervisor/curator. | Requires an identity provider decision (state SSO / OTP / password policy) that is out of scope for this repo. | `DEMO_MODE=false` disables sign-in entirely (nobody can log in) – fails closed. All data is fictional. Server-side role checks, sessions and audit are already in place for a real IdP to plug into. | Implement real auth (e.g. SSO/OIDC), map users→roles/assignments, remove persona picker, re-run IDOR matrix. **Blocks production.** |
| R2 | Medium | Rate limiting and in-flight idempotency are per-process memory; reset on restart; with no trusted proxy all clients share one bucket (one noisy client can lock out sign-in for a minute). | Single-process prototype. | Bounded memory; 429 responses tested. | Shared store (Redis/DB) and a trusted reverse proxy with `SAMVAAD_TRUST_PROXY=true`. |
| R3 | Medium | SQLite file is unencrypted; no backup/retention/erasure procedure; audit log is append-only by trigger but not hash-chained (a DB owner can drop the triggers). | Hosting model undecided. | File is git-ignored; host access control. | Disk/volume encryption, backups with retention, DPDP erasure workflow, optional audit hash chain. |
| R4 | Low | CSP permits inline style **attributes** (`style-src-attr 'unsafe-inline'`) because charts use inline widths. Scripts remain nonce-only. | Refactoring charts to classes is cosmetic. | Style injection cannot execute script. | Replace inline widths with CSS variables/classes. |
| R5 | Low | CSRF relies on SameSite=Lax + Sec-Fetch-Site/Origin checks, no per-session token; requests lacking those headers (non-browser) are allowed. | Acceptable for cookie-auth browser app; a non-browser client still needs a valid cookie. | Tested for cross-site rejection. | Add double-submit token if real auth uses cross-site flows. |
| R6 | Info | `node:sqlite` is experimental in Node 24 (prints a warning). | Chosen for zero native dependencies. | Wrapped in `db/client.ts`. | Swap to `better-sqlite3`/Postgres later. |
| R7 | Medium (conditional) | If `AI_PROVIDER=anthropic`, observation text goes to a third party; the live provider has **never been called** (only a local mock server was used). Prompt-injection defence is structural (validated citations, approved sources only, human approval), not model-level. | No key/credits; legal review pending. | Default is the offline simulated provider, labelled everywhere. | DPDP/legal review, data-processing terms, one supervised live test, red-team prompts. |
| R8 | Info | No SAST/DAST/secret-scanner product, no SBOM, no external pen test, no load test. | Tooling not installed on this machine. | Pattern scan, `npm audit` 0 vulns, `npm audit signatures` OK. | Add Semgrep/gitleaks/ZAP to CI. |
| R9 | Info | Work is in a git repo with a single "Initial commit" and many uncommitted changes. | User decision. | Baseline tarball; nothing destructive was done. | Commit after review. |

## 3. Positive checks that found nothing

- `grep` for `dangerouslySetInnerHTML|innerHTML|eval(|new Function|child_process|execSync` in `src`: 0 matches.
- Stored XSS payloads in 12 free-text fields rendered inert on 7 pages (no dialog, no injected `<img>`/`<script>`, no CSP violation).
- SQL-injection strings stored as data; `visits` table intact; fuzzed query/path params never produced a 500.
- Secrets: a build with a canary `ANTHROPIC_API_KEY` contains 0 occurrences of it in `.next/static` or `.next/server`; no API response in tests contains it; provider error text is static.
- Probes for `/.env`, `/data/*.db`, `/src/**`, `/package.json`, encoded traversal and `/backups/` all return 3xx/4xx with no sensitive content.
- IDOR matrix: every `:id` route × {owner, other mentor, supervisor, curator, anonymous} behaves as designed (after F5).
- Session cookie flags `HttpOnly; SameSite=Lax; Path=/` (+`Secure` in production builds).

## 4. How to re-verify

See `docs/QA_TEST_REPORT.md` for exact commands and recorded results.
