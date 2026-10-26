# Mobile and offline: known limitations

State at 2026-10-26 (V6 pass). Read with `docs/KNOWN_LIMITATIONS.md` (product), `docs/OFFLINE_STORAGE_AND_RECOVERY.md`, `docs/MOBILE_SECURITY_REVIEW.md`. **Release status: prototype. NO-GO for field deployment with real data.**

## Data safety

- Local records are stored in browser IndexedDB. **They are not encrypted by SAMVAAD** and there is **no app lock**: anyone who can use the unlocked phone and browser can read them. Use a phone screen lock.
- Browser storage is not a backup. Clearing site data, storage eviction, private browsing, or loss/damage of the phone before sync **destroys unsynced records**. There is no backup/export feature and no cross-device recovery.
- The Sync Center says all of this to the user. A "storage persistence" request is made, but a browser may still refuse or later clear data.
- Local data of a signed-out or different account stays on the device (hidden from other accounts) until the owner removes it; nothing deletes it automatically.

## What works without internet, and what does not

Works (tested): the field-mode shell, viewing cached schools/visits/observations/next steps/practice cards, creating and editing visits, observations and one next step per visit, a local draft report, English/Hindi, recovery after a browser restart, sync when back online.
Needs internet: AI feedback and demonstration scripts, approval, official reports, the rest of the online app, first sign-in on a device, refreshing cached data. There is **no offline AI template**; the AI sections are shown as unavailable offline.
Requires an earlier online visit: the app must have been opened online once (to cache the shell and load schools and cards). Offline cold start on a device that never loaded `/field` is impossible.

## Sync

- Conflicts are resolved per record (keep mine or use the server's), not per field.
- Observation tags are not available offline (the tagger and its suggestions are online features); offline observations sync without tags.
- Only the mentor role can use field mode; one next step per visit; commitments created offline are mentor-agreed (no approved AI feedback card) and are marked so in the audit log.
- The snapshot is a bounded full snapshot (200 most recent visits), not incremental.
- Background Sync and push are not used: sync happens while the app is open (start, network back, app visible, every 30 s while something waits, and the button).
- `sync_operations` grows without pruning.

## Platform

- **Android/Capacitor packaging is evaluated and recommended but not built or tested** (no JDK/Android SDK here). No native SQLite, no Keystore, no secure token storage were implemented. The PWA is the only tested mobile build.
- Installation was verified only as a valid manifest and icons; the actual "Install" prompt and standalone launch on a real device were **not tested**. iPhone Safari has stricter storage eviction and was not tested.
- The service worker update path (a second worker version replacing the first) is implemented but not covered by an automated test; unsupported browsers are handled in code but were not tested.

## Quality and language

- Hindi is an AI-drafted translation, unreviewed by a native-speaker educator (same as V5).
- Field pages were scanned with axe in English and Hindi at 360 px and checked for overflow; **no screen-reader test, no 200% zoom check on the field pages, no usability test with real mentors.**
- Quota exhaustion and storage-denied cases were tested with injected errors, not by exhausting a real device.
- Two-device conflict was tested with two separate local databases, not two physical devices.

## Before real field use

Real authentication; app lock and encrypted storage (native SQLCipher + Keystore recommended); an encrypted, tested backup or immediate-sync policy; Android device testing; screen-reader and low-end-device tests; reviewed Hindi; privacy/legal review; monitoring of failed syncs; a plan for lost phones (server sessions expire after 12 hours and are revoked on sign-out, but nothing can erase a lost phone remotely).
