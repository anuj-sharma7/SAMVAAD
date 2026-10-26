# Mobile and offline: baseline before the V6 pass

Taken 2026-10-26 at the start of the V6 pass, from the repository itself. No secret values appear here (environment variables are listed by name only).

## 1. Repository

| Item | Finding |
|---|---|
| Project root | `C:\dev\samvaad` (the only SAMVAAD implementation; the OneDrive Desktop folder only holds the Claude session) |
| Git | branch `main`, remote `origin` = `https://github.com/anuj-sharma7/SAMVAAD.git`, last commit `eefa872` ("SAMVAAD: working prototype …"), working tree clean at baseline; nothing was reset, cleaned or force-pushed in V6 |
| Runtime | Node v24.14.0, npm 11.9.0, Windows 11 |
| Framework | Next.js 16.4.3 (App Router, `proxy.ts` instead of middleware), React 19, strict TypeScript, Tailwind v4 |
| Database | SQLite through Node's built-in `node:sqlite`, 5 migrations at baseline (`0001`…`0005`), seeded with fictional demo data |
| Auth | demo persona picker; real server-side sessions (random token, SHA-256 stored, 12 h TTL, HttpOnly cookie) |
| Tests at baseline | 222 unit/integration tests (17 files), 20 Playwright tests, 53 data checks |
| Environment variable names | `DEMO_MODE`, `SAMVAAD_DB_PATH`, `SAMVAAD_HTTPS`, `SAMVAAD_TRUST_PROXY`, `SAMVAAD_AUTO_PUBLIC_INGEST`, `SAMVAAD_AUTO_SEED`, `SAMVAAD_DATA_DIR`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, `NODE_ENV` |

## 2. What existed for mobile and offline

| V6 requirement | Baseline state |
|---|---|
| Responsive layout on phones | Yes (drawer navigation, no horizontal overflow at 360 px; tested in Playwright) |
| Web app manifest, icons, installability | **None** |
| Service worker, offline fallback | **None** |
| Local persistence of visits/observations/commitments | **None.** All pages are server-rendered and need a session cookie plus a live server. (V5 even removed a browser-storage copy of unsaved observation text.) |
| Outbox, sync protocol, conflict handling | **None.** The server only had per-record `expected_updated_at` checks (409 `stale_edit`) and `Idempotency-Key` for online double submits |
| Sync/save status UI | Online "saved" toasts only; no "pending on this device" concept |
| Account separation for local data | Not applicable (no local data) |
| Storage persistence/quota handling | None |
| Android packaging | None |

## 3. Architecture facts that decide the mobile approach

- Every authenticated screen is a **server-rendered Next.js page** (`requireActor()` reads the session cookie on the server) backed by Route Handlers (`/api/v1/*`) and `node:sqlite`. A static bundle (what Capacitor normally packages) cannot run those, so "wrap the whole site in an app" would not work offline.
- Pages carry a per-request CSP nonce (`src/proxy.ts`) and dynamic locale cookies, so authenticated HTML must not be cached.
- The server already enforces ownership, roles, validation, audit and idempotency in service functions (`src/lib/services/*`); an offline sync API should reuse them instead of re-implementing rules.
- Commitments on the server required an approved, AI-drafted feedback card. Offline work cannot have one (AI needs the server), so a mentor-agreed commitment without AI feedback needed an explicit, audited server path.

## 4. Tooling for native work

| Tool | Found |
|---|---|
| Java / JDK | **not installed** (`java` not found) |
| Android SDK / `ANDROID_HOME` | **not present** |
| Android Studio, emulator, device | not available in this environment |

So an Android build cannot be produced or tested here. It is reported as **not built / not tested**, never as working.

## 5. Major gaps (the V6 work list)

1. A local, durable, per-account store with an outbox (IndexedDB), written transactionally.
2. An idempotent, retryable sync protocol with conflict reporting, server and client.
3. A field-mode UI that works with no network and states honestly what is saved where.
4. Installability: manifest, icons, a safe service worker that caches no private data.
5. Sign-out / account-switch behaviour that never silently drops unsynced work.
6. Tests that exercise failure modes (offline, timeout after commit, partial sync, expired session, conflicts, quota, migration).
7. Documentation of storage limits, threat model, and what native encrypted storage would add.
