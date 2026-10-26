# Mobile and offline test plan

How each V6 requirement is (or is not) tested. Results are in `docs/MOBILE_QA_REPORT.md`. Test data is fictional.

## Layers

| Layer | Tooling | What it proves |
|---|---|---|
| Device store, outbox, migrations | Vitest + `fake-indexeddb` (a spec-compliant IndexedDB in Node) | transactional writes, rollback on quota error, per-account databases, upgrades with pending records, conflict state, wipe guard |
| Sync engine + sync API + real services | Vitest; the **real browser transport** (`http-transport.ts`) wired to the **real API router and an in-memory SQLite database**, with switches for offline, 503, 429, response lost after commit | idempotency, retries and backoff, partial sync, expired session, account mismatch, conflicts, server refusals; no mocks of server logic |
| Validation parity | Vitest | what the device accepts the server accepts |
| Real browser | Playwright (Chromium) against the production build: real service worker, real IndexedDB, `context.setOffline`, persistent browser profile closed and reopened | the acceptance scenario end to end, offline shell, cache contents, manifest, Hindi, sign-out warning, account separation, expired session, axe, overflow |
| Static checks | `tsc --noEmit`, ESLint, `npm audit`, canary-secret bundle scan | build integrity, supply chain, no secrets in bundles |

## Test matrix (V6 §16)

| V6 requirement | Test | Status |
|---|---|---|
| A. Web/build regressions: type-check, lint, unit/integration, production build, existing workflows | commands in the QA report; all 20 earlier Playwright tests re-run | executed |
| B. Create visit online, reopen offline | `offline-sync` "records created online … stay readable offline after a restart" | executed |
| B. Create visit offline; survives refresh and app restart | `offline-store` (reopen), Playwright MAIN ACCEPTANCE (browser closed and reopened on the same profile) | executed |
| B. Several observations/commitments offline | `offline-store`, `offline-sync` (30 observations), Playwright | executed |
| B. Local transaction failure shows no false "saved" | `offline-store` quota test (record and outbox entry both rolled back) | executed |
| B. Quota exceeded / storage denied | quota test; unavailable-database test (`StorageError`) | executed (simulated with injected errors, not by filling a real disk) |
| B. Migration with pending records; failing migration | `offline-store` migration tests | executed |
| B. App/browser update while records pending | service worker waits for the user (`sw-register.ts`); migration tests cover the data side | **partly executed**: no automated test installs a second worker version |
| B. Account switch and sign-out | `offline-store` isolation, `offline-sync` mismatch, Playwright sign-out warning + other account sees nothing | executed |
| C. Outbox kept until acknowledgement; sync after reconnect | `offline-sync` main scenario, Playwright | executed |
| C. Timeout after commit → no duplicate | `offline-sync`, `sync-server` | executed |
| C. Server validation failure → recoverable item | `offline-sync` rejected visit (held-back dependents, discard, retry with new id) | executed |
| C. Expired authentication | `offline-sync`, Playwright | executed |
| C. Partial sync | `offline-sync` (connection drops after first batch) | executed |
| C. Two devices edit the same record; both versions kept | `offline-sync` (keep mine / use server, history retained) | executed |
| C. "Synced" never before acknowledgement | `offline-sync` ("pending while in flight"), Playwright badge text checks | executed |
| D. Installable manifest | Playwright manifest test (fields, icon files, maskable icon) | executed; **actual "Install" on a device not tested** |
| D. App shell loads offline after first online init | Playwright (reload while offline) | executed |
| D. No protected API response/private page in cache | Playwright inspects every Cache Storage entry | executed |
| D. Cache version updates / stale shell | worker deletes old `samvaad-*` caches on activate (code); not exercised by a test | **not tested** |
| D. Unsupported browser degrades | `registerServiceWorker` returns `supported:false`; not run in an unsupported browser | **not tested** |
| D. Storage persistence/quota reporting | shown in Sync Center (Playwright asserts the panel renders); Chromium granted/denied behaviour not asserted | partly |
| E. Android / native (debug build, Keystore, encryption, back button) | no JDK / Android SDK / device in this environment | **NOT TESTED / NOT BUILT** |
| F. Full product workflow offline portions then reconnect | Playwright MAIN ACCEPTANCE (visit → observation → next step → restart → sync → open online) | executed; AI feedback / approval / report stay online-only by design |
| G. Server authz on sync, cross-account isolation, no secrets in bundles | `sync-server`, canary scan, existing V3 suites | executed |
| G. Backup import validation | no backup feature exists | **not applicable / not implemented** |
| H. English/Hindi core workflow, keyboard, screen-reader labels, contrast, text scaling, overflow | Playwright (Hindi offline create + sync, axe on 6 field routes × 2 languages at 360 px, no overflow) | executed; **no screen-reader run, no 200% zoom run on field pages** |

## Manual checks still needed (cannot be automated here)

1. Install the PWA on a real Android phone (Chrome) and iPhone (Safari); confirm icon, standalone window and offline start; record a visit in airplane mode; force-stop the browser; reopen; sync.
2. TalkBack/VoiceOver pass over the Sync Center and visit screen in English and Hindi.
3. Throttled network (Chrome DevTools "Slow 3G") sync of a 25-operation batch.
4. Android debug build once JDK and the Android SDK exist (Phase B in the architecture record): cold start, back button, force-stop persistence, network transitions.
5. Two real devices editing one observation (the automated test simulates the second device with a second database).

## How to run

```powershell
cd C:\dev\samvaad
npx tsc --noEmit; npx eslint src scripts tests e2e
npx vitest run                         # includes tests/offline-*.test.ts, tests/sync-server.test.ts
npm run build
node scripts/clean-e2e.mjs; npx playwright test    # includes e2e/offline.spec.ts (stop anything on port 3200 first)
```
