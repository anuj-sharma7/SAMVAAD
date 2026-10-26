# Mobile and offline QA report (V6 pass)

Run on this machine on 2026-10-26 (Windows 11, Node v24.14.0, Next.js 16.4.3, Vitest 5.0.5, Playwright with Chromium). Everything below was observed in this session; anything not run says **NOT RUN / NOT TESTED**. All data is fictional; the AI provider is the offline simulator.

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npx eslint src scripts tests e2e` | PASS (exit 0) |
| Unit / integration | `npx vitest run` | PASS: **24 files, 316 tests** (222 at the start of V6; +94 new) |
| Public data | `npm run data:validate` | PASS 53/53 (2 documented warnings) |
| Production build | `npm run build` | PASS (`/field`, `/manifest.webmanifest` built) |
| Browser end to end | `node scripts/clean-e2e.mjs; npx playwright test` | PASS: **27/27** (20 earlier + 7 new offline tests) |
| Dependencies | `npm audit`; `npm audit signatures` | 0 vulnerabilities; audited 402 packages. One dev dependency added: `fake-indexeddb` (tests only) |
| Canary secret scan | build with a fake `ANTHROPIC_API_KEY`, grep `.next/static`, `.next/server`, `public/` | 0 hits; no `node:sqlite` in client chunks |
| Android debug build / device tests | — | **NOT BUILT / NOT TESTED**: no JDK, Android SDK, emulator or device on this machine |
| Real-device PWA install, screen reader, throttled network, real 2-device conflict | — | **NOT RUN** (manual checklist in `docs/MOBILE_TEST_PLAN.md`) |

## 2. New automated tests (V6)

| File | Tests | Covers |
|---|---|---|
| `tests/sync-server.test.ts` | 10 | push applies visit/observation/commitment under client ids; idempotent re-send (×3) and duplicate op in one batch; rejected change remembered and dependents skipped (partial sync); conflict returns server copy and changes nothing; account mismatch and replay of another account's op id; takeover/collision/unassigned school refused; envelope limits and roles; snapshot scoping; HTTP routes |
| `tests/offline-store.test.ts` | 11 | local save + outbox in one transaction, restart persistence, coalescing and delete-before-send, local rules, quota rollback, unavailable storage, per-account databases, owner check, wipe guard, migration upgrade with pending records, failing migration rolls back, conflict locks edits |
| `tests/offline-sync.test.ts` | 16 | **acceptance scenario** (offline → restart → reconnect → sync once), "synced" only after acknowledgement, cached records readable offline, timeout after commit, crash in flight, partial sync after a dropped connection (25 + 5 operations), 503 backoff and no hammering, backoff bounds, 429 `Retry-After`, rejected visit (hold-back, discard, retry with new id), expired session, account mismatch, two-device conflict (keep mine / use server, history kept), server lock on approved feedback |
| `tests/offline-validation.test.ts` | 26 | device and server validation agree on visit, observation and commitment inputs |
| `tests/offline-report.test.ts` | 5 | local draft report builder (no scores, marks unsent records) |
| `tests/offline-sync-center-helpers.test.ts` | 7 | error-code → explanation mapping, grouping helpers |
| `tests/safe-next.test.ts` | 19 | `?next=` accepts only same-site paths |
| `e2e/offline.spec.ts` | 7 | below |

## 3. Browser tests (real service worker, IndexedDB and network switching)

| # | Test | Result |
|---|---|---|
| 1 | **MAIN ACCEPTANCE**: sign in, open `/field`, wait for cache, go offline, reload (shell served from the service worker), create a visit, start it, add an observation and an agreed next step, see "Saved on this device — pending sync" on each, verify nothing reached the server, **close the whole browser and reopen the same profile still offline**, see all three records still pending, a sync attempt offline loses nothing, reconnect, Sync now, see "Synced to server", server holds exactly one visit/observation/commitment, repeated syncs create no duplicates, the normal online page opens the visit | PASS |
| 2 | Service worker cache contains only `/field`, `/offline.html`, `/_next/static/*`, `/icons/*`, after visiting private pages and calling the API; no `/api/*`, no dashboard/visits/reports | PASS |
| 3 | Offline: a private page shows the offline page with a link into field mode; manifest has `standalone`, `start_url` under `/field`, scope `/`, 192 px and maskable 512 px icons that load; `sw.js` served as JavaScript | PASS |
| 4 | Hindi switched while offline: forms, the pending badge ("इस डिवाइस पर सेव है — भेजना बाकी") and synced badge ("सर्वर पर पहुँच गया") in Hindi, no raw keys, no English status text, no horizontal overflow at 360 px, sync after reconnect | PASS |
| 5 | Sign-out with unsent records shows a warning with the count and "Open Sync Center"; signing out keeps the records; another account on the same browser sees none of them; the first account signs back in, still sees and syncs them | PASS |
| 6 | Session expired: session banner shown, record still "pending" (not lost, not "failed"), syncs after signing in again | PASS |
| 7 | axe (WCAG 2.0/2.1/2.2 A+AA tags) on field Home, New visit, Visit, Local report, Cards and Sync Center in English **and** Hindi at 360 px width: 0 violations, no horizontal overflow; Sync Center shows the "not encrypted" statement and diagnostics | PASS |

Screenshots: `e2e-screenshots/30-33-*.png` (git-ignored).

## 4. What genuinely works offline (verified)

After the app has been opened once online and signed in: opening the field-mode shell (also after the browser is closed and reopened); viewing cached schools, visits, observations, next steps and approved practice cards; creating a visit; starting it and sending it for review; adding, editing and deleting observations; agreeing and editing one next step; a local, clearly labelled draft report; seeing per-record states and the queue; switching English/Hindi; recovering all of it after a restart; syncing without duplicates when the connection returns.

## 5. What needs a connection (by design)

AI feedback and demonstration scripts, approval, official reports and the online workspace pages; first sign-in on a device; refreshing schools/cards (done by sync); sending anything to the server.

## 6. Bugs found and fixed by these tests

| Found by | Defect | Fix |
|---|---|---|
| `offline-validation` parity test | The server rejected Hindi teacher aliases that contain vowel signs (for example "शिक्षक-1"): the allowed-character rule lacked `\p{M}`. Also affected the online form in Hindi | rule fixed on server and device |
| Playwright acceptance run | After going offline briefly the record showed red "Sync failed" instead of "Saved on this device — pending sync" | "no connection" no longer counts as a failure of the record; only server errors and refusals do |
| Playwright acceptance run | Pressing Sync now while a background sync was running was silently ignored | the press is remembered and runs when the background sync ends |
| Code review of the Sync Center agent's note | The global "Skip to content" link (`#main`) would have switched field mode to Home | hash router treats non-route hashes as in-page anchors |
| e2e suite | the shared per-minute sign-in limit (20) made a later test fail with 429 | e2e server trusts `X-Forwarded-For` and tests use distinct client addresses (the limit itself is unchanged and still tested) |

## 7. Not covered / residual

Everything under "NOT BUILT / NOT TESTED" above; second-service-worker-version update path; unsupported-browser path; real quota exhaustion (simulated by injected errors); real 3G throttling; field pages at 200% zoom; screen-reader output; encrypted storage (not implemented). See `docs/MOBILE_KNOWN_LIMITATIONS.md`.

## 8. Reproduce

```powershell
cd C:\dev\samvaad
npm install
npx tsc --noEmit; npx eslint src scripts tests e2e
npx vitest run
npm run data:validate
npm run build
node scripts/clean-e2e.mjs; npx playwright test      # starts its own server on port 3200
npm audit
```
