# Offline storage and recovery

What is stored on the device, how, what protects it, what does not, and how to recover. Written from the implementation (`src/lib/offline/*`); claims are limited to what tests show (`docs/MOBILE_QA_REPORT.md`).

## 1. The honest summary

- Records created in field mode are written to the browser's **IndexedDB** before the screen says "Saved on this device".
- This is **not** a backup and **not** encrypted by SAMVAAD. The browser, the user (clearing site data), storage pressure, private browsing, or loss/damage of the phone can destroy records that the server has not yet confirmed. Sync as soon as you have signal.
- Only a server acknowledgement turns "Saved on this device — pending sync" into "Synced to server".

## 2. States shown to the mentor

| State (English) | Meaning |
|---|---|
| Saved on this device — pending sync | local save committed; the server has not confirmed it |
| Synced to server | the server acknowledged the latest change |
| Sync failed | the last attempt did not finish (will retry) or the server refused it (needs attention) |
| Conflict — needs review | the record also changed elsewhere; both versions are kept until the user chooses |
| Not saved | the device could not store it (for example no space); what was typed stays on screen |

Hindi equivalents exist for all five (AI-drafted, unreviewed).

## 3. What is stored where

| Data | Location | Notes |
|---|---|---|
| Visits, observations, next steps (commitments) the mentor created or the server sent | IndexedDB `samvaad-offline--<accountId>` (stores `visits`, `observations`, `commitments`) | one database per account |
| Queued changes | same database, store `outbox` | `opId`, record id, small payload, status, retry data |
| Assigned schools, approved practice cards | same database (`schools`, `cards`) | refreshed from the server snapshot |
| Conflict copies (both versions) | same database, store `conflicts` | kept after resolution as history |
| Sync history | same database, store `syncLog` (last 200) | status/time/type/code only, **no record text** |
| Which accounts have data on this device and how many changes wait | IndexedDB `samvaad-registry` | id, display name, role, a count, a time; used for the sign-out warning and for opening the last account offline |
| Interface language preference | `localStorage` key `samvaad.ui-lang` | the only `localStorage` use (low-risk preference) |
| Session | HttpOnly cookie, never readable by script; **no token, key or password is stored by SAMVAAD scripts** | |
| Cached app files | Cache Storage: the public `/field` shell, hashed static assets, icons, `offline.html` | **no API responses, no private pages, no records** |

Not stored on the device: student names (no such field exists), audio, AI provider keys, raw datasets, other mentors' records.

## 4. Write semantics

- A record and its outbox entry are written in **one IndexedDB transaction**; the promise resolves, and the UI may say "Saved", only after the transaction committed. If the transaction fails (quota, storage disabled, any error) both writes roll back, the UI shows "Not saved" with the reason, and the typed text is kept in memory on the screen. Tested with a simulated quota error (no orphan record or queued change remains).
- Unsaved text in forms is held in memory only; the browser warns before the tab is closed. Nothing is auto-copied to `localStorage`.
- Quota/availability: `navigator.storage.persist()` is requested at start (best effort; the Sync Center shows whether it was granted) and `estimate()` usage is shown with a warning above 80%.

## 5. Schema versions and upgrades

The local schema is versioned (`DB_VERSION`, currently 2) with append-only migrations that run inside IndexedDB's upgrade transaction. Tested: (a) a database created by the previous version with pending records upgrades with every record and queued change intact; (b) a migration that throws rolls back, the database stays at the old version with its records, the app reports a recoverable error ("your records were not changed"), and the real upgrade works afterwards. Updating the service worker never touches IndexedDB; a new worker waits until the user chooses "Update".

## 6. Accounts, sign-out and shared phones

- Each account has its **own** database. Another account signing in on the same phone sees nothing of the first account's records, and the sync engine refuses to push a queue under a different session (`account_mismatch`); the server also rejects a mismatched `account_id`.
- Signing out **does not delete** local records. If the account has waiting changes, the sign-out button first shows how many and offers "Open Sync Center" or "Sign out anyway". The records stay on the device and are sent the next time that account signs in.
- Removing local data is an explicit action in the Sync Center: with nothing waiting it needs one confirmation; with waiting records it needs a separate "I understand that records not yet sent will be lost" confirmation.
- **Gap:** while offline, opening `/field` shows the last account that used the device without a password (there is nothing to verify against offline). Anyone holding an unlocked phone can open it. Mitigation today: phone screen lock. Planned: an app lock (see §8).

## 7. Recovery paths

| Situation | What happens | What the user does |
|---|---|---|
| App closed or phone restarted before sync | records and queue are read back from IndexedDB; operations left in flight are queued again; the server de-duplicates | open the app; sync when online |
| Server unreachable, 5xx, 429 | operations stay, retried with bounded backoff | press Sync now when online |
| Session expired | "Sign in again to send your changes"; nothing is deleted | sign in as the **same** account |
| Different account signed in | records of the first account stay hidden and unsent | sign in as the first account |
| Server refused a change | stays visible with a plain reason; text kept | fix and retry, or discard (with confirmation) |
| Conflict | both versions shown | choose which to keep; the other stays in history |
| Local upgrade fails | database untouched, error explained | reload/update; contact support with the code |
| Storage full | "Not saved", typed text kept | free space, then save again |
| Browser data cleared, phone lost or damaged **before** sync | **unsynced records are unrecoverable** | none: this is the main residual risk |

## 8. Not implemented (and why it matters)

- **Encrypted backup export/import:** not built. A correct implementation needs a reviewed format, a passphrase-derived key, integrity checks and import preview; shipping a partial or fake "encrypted" export would be worse than none. There is therefore no on-device backup besides the server.
- **Encryption at rest of IndexedDB records and an app lock:** not implemented. A key stored in the same browser profile would not stop someone with the profile or with script execution in the origin; a passphrase-derived key (PBKDF2/Argon2 + AES-GCM) plus an app lock would help against casual access and is the next PWA-level step. For long-lived sensitive data on shared or managed phones the recommendation is **native encrypted SQLite with an Android Keystore-protected key** (Phase C in `docs/MOBILE_ARCHITECTURE_DECISION.md`).
- **Background Sync / push:** not used; sync runs when the app is open.
- **Cross-device recovery of unsynced records:** impossible by design until they reach the server.
