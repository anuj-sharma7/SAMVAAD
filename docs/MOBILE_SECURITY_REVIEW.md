# Mobile and offline security review (V6 pass)

Date 2026-10-26. Method: code reading, targeted tests (`docs/MOBILE_QA_REPORT.md`), browser tests against the production build, canary-secret scan, `npm audit`. Self-review by the engineering assistant; **not independent, not a penetration test, no SAST/DAST tool, no Android review.** Companion to `docs/SECURITY_REVIEW.md` (web) and `docs/MOBILE_THREAT_MODEL.md`.

**Verdict: the offline feature is fit for a fictional-data demo and a supervised trial on personal phones. NO-GO for field deployment with real teacher/visit data** until (a) real authentication exists (open High finding R1 from the web review) and (b) on-device protection is addressed (M1 below: no encryption at rest, no app lock).

## Findings fixed in this pass

| ID | Sev | Finding | Fix / evidence |
|---|---|---|---|
| MS1 | Medium | Server refused Hindi teacher aliases containing Devanagari vowel signs (`\p{M}` missing) | rule fixed on server and device; `offline-validation` parity test |
| MS2 | Low | A record that merely could not reach the server was shown as "Sync failed", which would alarm a mentor and hide the real state | only server errors/refusals count as failed; tests in `offline-sync` |
| MS3 | Low | A "Sync now" press during a background sync was dropped silently | queued to run afterwards; Playwright acceptance test |
| MS4 | Low | Global skip link would navigate field mode away from its screen | hash router handles in-page anchors |
| MS5 | Preventive | `?next=` after sign-in could become an open redirect | `safeNext` (same-site absolute paths only), 19 tests |
| MS6 | Preventive | Offline create lets clients choose record ids: takeover or collision risk | UUID-only ids, ownership checks, PK collision rejected, `op_id` bound to the actor; `sync-server` tests |
| MS7 | Preventive | Unsent records could be lost on sign-out or by another account | warning with count, no deletion on sign-out, per-account databases, push refused for a different session; Playwright + `offline-sync` |
| MS8 | Preventive | Service worker could cache private pages or API data | worker only handles `/field`, hashed static files, icons, offline page; Playwright asserts every Cache Storage URL |

## Open findings

| ID | Sev | Finding | Why open | What closes it |
|---|---|---|---|---|
| **M1** | **High for real data** | Local records are in IndexedDB **without encryption by SAMVAAD**; `/field` shows the last account's records offline without any password, so a person holding an unlocked phone/browser can read them | Needs an app lock plus encrypted storage design; a key kept in the same profile gives no real protection | Passphrase-derived key + app lock (PWA step) and, for long-lived sensitive data, native SQLCipher with an Android Keystore key (Phase C) |
| M2 | Medium | Unsynced records are lost if browser data is cleared, the phone is lost or storage is evicted; there is no backup/export | Encrypted export needs a reviewed design | Native storage + background sync; or an encrypted, tested backup flow |
| M3 | Medium | Account separation is by IndexedDB name inside one browser profile (not an OS boundary); script running in the origin could open another account's database | inherent to browser storage | native app per-user storage; CSP/XSS hygiene (in place) |
| M4 | Low | `sync_operations` (idempotency records) is never pruned | prototype scale | retention job after a safe window |
| M5 | Low | Conflict resolution is per record, not per field | design choice for simplicity and safety | field-level merge UI |
| M6 | Low | `PUT /locale` and sync endpoints share the generic mutation rate limits; sync pushes of 25 operations count as one request | adequate for current scale | tune limits with real usage |
| M7 | Info | The cached `/field` HTML is public by design; a future change that put user data into it would be cached by the worker | guarded by comments and the cache-content e2e test | keep the test; never render user data on the server for `/field` |
| M8 | Info | No Android build, no native storage, no push or background sync; none of those controls exist or were tested | no JDK/SDK here | Phase B/C |
| M9 | Info | No external pen test; no mobile security scanner | tooling | add Semgrep/ZAP/MobSF in CI |

## Controls checked (with the test that checks them)

- Server authorization on both sync endpoints (401 anonymous, 403 supervisor/curator, `account_id` must match the session): `sync-server`.
- Idempotency and no duplicates under retries, crashes and lost responses: `sync-server`, `offline-sync`.
- No operation of one account applied under another session: `offline-sync`, `sync-server`.
- Sync history and audit contain counts and codes only, never record text: `sync-server` (audit assertion), store code.
- No secrets in client bundles or the service worker (canary build scan); no API keys, tokens or passwords stored by script (session cookie is HttpOnly).
- Service worker cache separation (Playwright), updates wait for the user (code).
- CSP is unchanged for the field page and nonce-based; no inline script was added; field screens render text only.
- `npm audit`: 0 vulnerabilities (one dev-only dependency added).

## Dependency note

Added `fake-indexeddb` (dev dependency, tests only, not in the production bundle). No runtime dependency was added; IndexedDB, Web Locks, Cache Storage and the service worker use browser APIs directly.
