# Mobile and offline threat model

Scope: field mode (`/field`), the service worker, the on-device IndexedDB, and the sync API. Builds on `docs/SECURITY_THREAT_MODEL.md` (the web app). This is a design-level analysis checked against code and tests; it is not a penetration test and not a security guarantee.

## 1. Assets and data flows

| Asset | Where | Sensitivity |
|---|---|---|
| Visit, observation and next-step text (teacher aliases, classroom observations) | device IndexedDB; server SQLite | Medium-high: describes identifiable teachers by alias at named schools |
| Session cookie | browser (HttpOnly) | High: acts as the mentor |
| Queued changes | device IndexedDB `outbox` | same as the records |
| Approved practice cards, assigned schools | device cache | Low |
| Sync history, registry counts | device | Low (no text) |

Flows: device ⇄ server over HTTPS (production; plain HTTP only on `localhost`) using the session cookie; no keys or tokens in script; service worker never sees or stores API traffic.

## 2. Trust boundaries

1. Browser profile / device (someone with the phone). 2. Script execution in the origin (XSS). 3. Network. 4. The sync API (server authority). 5. Other accounts on the same device.

## 3. Threats, controls, evidence, residual risk

| # | Threat | Control | Evidence | Residual |
|---|---|---|---|---|
| M1 | **Lost/stolen or shared phone: reading local records** | Phone screen lock (user); minimal data on device; no student names/audio | — | **Records are not encrypted by SAMVAAD and `/field` opens the last account offline without a password.** Needs app lock + native encrypted storage before field use with real data |
| M2 | Another account on the same device reads or syncs this account's records | One IndexedDB per account; client refuses mismatched session; server rejects `account_id` ≠ session | `offline-store` (isolation, owner check), `offline-sync` (account_mismatch), `sync-server` (403) | Separation is by database name inside one browser profile, not by OS user; script in the origin could open any account's database name |
| M3 | Sync API abuse: forged ids, replay, taking over another user's record | UUID-only ids, ownership checks via existing services, PK collisions rejected, `op_id` bound to actor, 25-op cap, body cap, rate limits | `sync-server` (takeover, collision, replay, envelope tests) | none known |
| M4 | Duplicate records from retries | `op_id` idempotency stored server-side; client-generated record ids | `sync-server`, `offline-sync` (timeout after commit, crash in flight) | idempotency table grows (no pruning yet) |
| M5 | Silent overwrite / data loss from conflicts | `expected_updated_at`, conflicts surfaced with both versions, server locks reported as rejections | `offline-sync` (conflict tests, approved-feedback lock) | per-record, not per-field, resolution |
| M6 | **Service worker caches private data** | Worker handles only `/field`, `/_next/static/*`, `/icons/*`, `/offline.html`; never `/api/*`, RSC requests, non-GET, other origins or authenticated pages | e2e inspection of Cache Storage (see QA report) | the cached `/field` HTML is public by design; if a future change put user data in it, it would be cached |
| M7 | Stale or poisoned cached shell | network-first with timeout for the shell; hashed assets are immutable; versioned caches deleted on activate; updates wait for the user | `public/sw.js`; e2e update/cache checks | a compromised origin could ship a malicious worker (same as any web app) |
| M8 | XSS reading IndexedDB | CSP with nonces (no inline script), React escaping, no `dangerouslySetInnerHTML`; local data never rendered as HTML | V3 XSS tests; field screens render text only | XSS in the origin can read any local data; encryption with a co-located key would not help |
| M9 | Open redirect through `?next=` after sign-in | `safeNext` allows only same-site absolute paths | `safe-next.test.ts` (19 cases) | none known |
| M10 | Expired session leaves data readable offline | Local data stays readable by design (offline work must continue); sync needs a valid session; sign-in required to send | e2e/offline tests | readable without re-authentication (see M1) |
| M11 | Sensitive text in logs/telemetry | Sync history and diagnostics hold codes only; audit stores counts; no analytics | `sync-server` audit assertion; code review | browser devtools show IndexedDB to the device owner |
| M12 | Unsynced work lost by sign-out or reset | sign-out warning with count, no deletion on sign-out, guarded "remove local data" | e2e (warning), `offline-store` (wipe refusal) | clearing browser data or losing the phone still loses records |
| M13 | Migration or storage failure destroys queue | transactional writes; failing upgrade rolls back; quota errors roll back both writes | `offline-store` | none known |
| M14 | Time skew | server timestamps are the only version tokens | protocol design | device times are shown to users but not trusted |
| M15 | Secrets in the client bundle | no provider keys, no signing keys in client code; API keys stay server-side | canary-key build scan (QA report), V3 checks | — |

## 4. Why no client-side encryption was added

Encrypting IndexedDB records with a key kept in the same profile gives no real protection against an attacker with the profile or with script execution, and would add false confidence. A passphrase-derived key with an app lock would protect against casual access to an unlocked-browser-but-locked-app scenario; it is listed as the next step, but it changes every read/write path and the sync engine, so it was not rushed into this pass. **Encryption is not enabled.** For real field deployment the native encrypted-storage phase is the recommended control.

## 5. Open items

R-M1 (no encryption at rest, no app lock) blocks field use with real data. R-M2 (isolation is by database name). No device-loss remote wipe exists. No penetration test, no mobile scanner tooling. Android/native controls are **not tested** (no tooling).
