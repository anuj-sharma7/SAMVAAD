# Mobile architecture decision record

Date: 2026-10-26. Status: **accepted for Phase A (PWA, implemented)**; Phase B (Android packaging) and Phase C (native encrypted storage) are **evaluated and recommended, not built** (no JDK/Android SDK in this environment; see `docs/MOBILE_OFFLINE_BASELINE.md` §4).

## Context (from the real repository)

- Authenticated pages are server-rendered Next.js 16 pages that read an HttpOnly session cookie; the API is Route Handlers over `node:sqlite`. The server is the single authority for authorization, validation, AI calls and audit.
- A mentor's core job (record a visit, observations and an agreed next step) must work without internet, survive restarts, and sync later without duplicates. AI generation, new datasets, new-device sign-in and final report submission legitimately need connectivity.

## Options

| | PWA only (**chosen first**) | PWA + Capacitor (Android) | Dedicated native / React Native client |
|---|---|---|---|
| Reuse of existing code | Highest: same repo, same React components, same Zod rules, same API contracts | High if the web app is loaded from the deployed HTTPS origin (`server.url`); **low** if bundled statically, because pages are server-rendered and need cookies and Route Handlers | Low: new UI, reuse only API contracts |
| Works offline | Yes, through a cached public shell + IndexedDB (implemented and tested) | Same as PWA when loading the remote origin; a bundled static client would need absolute API URLs, token auth (cookies do not cross `capacitor://localhost`) and CORS: real extra backend work | Yes (native storage) |
| Local data protection | Browser IndexedDB, **not encrypted by the app**, can be cleared by browser/user; no hardware-backed keys | Same unless a native SQLite plugin (for example SQLCipher based) with Android Keystore is added | Best: SQLCipher + Keystore, background sync, app lock |
| Plugin / platform risk | None | Plugin maintenance and Android WebView differences; needs JDK, SDK, signing | Highest effort and maintenance |
| Distribution | URL + "Add to Home screen" | APK/AAB, Play listing or sideloading | Same as Capacitor |
| Release effort | Low | Medium | High |

## Decision

1. **Phase A (done): PWA.** Add a public, cache-safe **field-mode shell** at `/field` (one page, hash routing, no user data in the HTML), a service worker that caches only that shell, hashed static assets and an offline page, a manifest with icons, and an IndexedDB database per account with an outbox. The server gets a small sync API that reuses the existing service layer.
2. **Phase B (recommended, not built): Capacitor loading the deployed HTTPS origin.** Because the app depends on server rendering, Route Handlers and cookies, a bundled static client would need a second authentication scheme and CORS. A thin shell that points `server.url` at the production origin (never a dev live-reload URL in release builds) keeps one backend and reuses the PWA unchanged. This must be validated on a device before it is claimed to work.
3. **Phase C (required before field deployment with real data): native encrypted storage.** If sensitive records are kept on shared or managed phones for long periods, move the local database to native SQLite with SQLCipher-style encryption and a key held in Android Keystore (through a maintained Capacitor plugin), plus an app lock. PWA storage cannot offer that, and encrypting IndexedDB with a key stored beside it would only be obfuscation.

## What is implemented vs not (evidence in `docs/MOBILE_QA_REPORT.md`)

Implemented and tested: IndexedDB store with transactional writes and outbox, per-account databases, migrations, idempotent sync API, client sync engine with backoff, conflict capture and resolution, field-mode UI in English and Hindi, manifest and icons, service worker with restricted caching, sign-out warning.
Not implemented: Capacitor project, APK/AAB, native SQLite, encryption of local data, app lock, background sync, push, audio.
