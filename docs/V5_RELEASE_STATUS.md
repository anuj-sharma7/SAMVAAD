# V5 status, evidence and release gates

Date: 2026-10-25. Scope: the V5 pass (bilingual interface, guided workflow aids, accessibility checks, UDISE+ 2025-26, data dictionary) on top of the V3 security pass. Starting point: `docs/BASELINE_STATUS.md`. Security details: `docs/SECURITY_REVIEW.md`. Older numbers in `docs/QA_TEST_REPORT.md` (written for V3) are superseded by the table below.

## 1. Commands run and actual results

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npx eslint src scripts tests e2e` | PASS (exit 0) |
| Unit/integration | `npx vitest run` | PASS: 17 files, **222 tests** |
| Public data | `npm run data:validate` | PASS: **53/53** checks, 2 documented warnings |
| Build | `npm run build` | PASS |
| Browser | `node scripts/clean-e2e.mjs; npx playwright test` | PASS: **20/20** (Chromium) |
| Dependencies | `npm audit` | 0 vulnerabilities |
| Live AI provider | not run | NOT RUN (no key, no spending permission) |
| Screen reader, real-device, cross-browser, real-user usability tests | not run | NOT RUN |

New test files in V5: `tests/i18n.test.ts` (11), `tests/brief.test.ts` (4), `e2e/i18n.spec.ts` (8). Extended: `security-authz.test.ts` (brief/summary routes in the object-level matrix), `reliability.test.ts` (migration count 5).

## 2. What is now working

- **English and Hindi interface** across every route: 1,408 message keys in 17 namespaces (`src/lib/i18n/messages/{en,hi}`), typed so a missing Hindi key is a compile error, plus a key/placeholder/plural parity test. Interface language (cookie, remembered on the profile via migration `0005_ui_language`) is separate from the coaching language chosen per visit. Language switch is in the side menu, on the login page and in Settings. `<html lang>` follows the choice; dates and numbers use Indian formats per language; Devanagari uses Noto Sans Devanagari with Nirmala UI / Mangal fallbacks.
- **Plain-language aids:** first-run tour (4 steps, skippable by keyboard, remembered by a harmless flag, replayable from Help), `/help` page (five-step guide, FAQ, searchable glossary of 18 terms in both languages), pre-visit brief (`/visits/:id/brief`, built only from the mentor's own records and approved cards, says "not enough approved information" when nothing matches), teacher-facing one-page action summary (`/visits/:id/summary`, only after feedback approval and an agreed next step, printable, readable in monochrome).
- **Safer drafts:** the old browser-storage copy of unsaved observations was removed (V5: no sensitive text in unprotected browser storage). Unsaved text now stays in memory only and the browser asks before the page is closed; errors keep what was typed.
- **Real data:** UDISE+ **2025-26** booklet found through the dashboard's own public JavaScript bundle, downloaded (12,470,602 bytes, sha256 `f20bfc42…d9c4`), parsed (999 values, same tables as 2024-25), validated with 12 new cross-checks against the booklet's own printed totals. 2024-25 data is unchanged. Total 4,844 indicator values, 41 sources catalogued, 26 used. `docs/DATA_DICTIONARY.md` (generated parts via `npm run data:dictionary`) and `docs/DATA_SOURCE_REGISTRY.md` are current.
- **Accessibility fixes found by scans in this pass:** visit-step links had no accessible name (axe `link-name`, serious), fixed; plus the V3 fixes. axe (WCAG 2.0/2.1/2.2 A+AA tags) scans of 13 pages in Hindi and 9 in English, 7 visit pages in Hindi, and the summary page report 0 violations.

## 3. Language coverage and what is NOT reviewed

- All Hindi text is an **AI-drafted translation, not reviewed by a native-speaker educator**. The Hindi UI says so in the footer, on the login page and in Settings (the notice reads: हिंदी अनुवाद का मसौदा: फ़ील्ड में उपयोग से पहले समीक्षा ज़रूरी है). It must not be used in the field before review (Gate C).
- Data is not translated: school names, teacher aliases, mentor-authored commitments/observations, practice-card bodies without a Hindi version, source titles, public-indicator labels and registry notes published by sources stay in their original language (the Hindi e2e scan allow-lists exactly these classes; everything else must be translated). Practice cards with a Hindi version show it in the library list.
- Server/API error text stays English when a code has no Hindi message (translated for every known code).
- Rajasthani dialects and other Indian languages: **not supported** (no resources, review or tests).
- Voice, speech-to-text: **not implemented** (not required for any task).

## 4. Usability: what was and was not tested

Tested by automation: switching language, completing all pages in Hindi, phone-size (360 px) and 200%-zoom-equivalent (640 px) reflow with no horizontal scroll, keyboard-only tour, glossary search, brief and summary pages. **Not tested:** any session with real mentors or proxy users; Android device rendering; slow-network/throttled behaviour; screen readers. No usability validation is claimed.

## 5. Priorities (V5 §63)

- **P0 (judge-demo MVP):** met (see Gate A).
- **P1 (field-test preparation):** partial. Done: approved-resource retrieval with provenance, pre-visit brief, action summary, source freshness/quality reporting, safe repeatable imports, authorization/audit/export controls. Not done: reviewed additional language packs, live provider integration (needs spending permission), usability sessions.
- **P2:** not started and not faked: offline-first capture and sync, audio/ASR, Postgres/pgvector, government integrations, ML prioritisation.

## 6. Release gates

| Gate | Status | Evidence / blocker |
|---|---|---|
| **A: judge-demo MVP** | **PASS** | P0 journey persisted and repeatable (workflow tests, restart-persistence test, e2e); English + Hindi on all core pages; simulated AI labelled; invented/unapproved citations rejected; automated accessibility scans clean; README setup. Caveat: Hindi unreviewed; usability untested with users |
| **B: real data** | **PASS** | Files fetched, hashed, parsed, validated (53 checks), registered with period/geography/limitations and displayed separately; re-import is idempotent. UDISE+ 2025-26 booklet added; PIB release page registered as page-only (release date not independently confirmed from page text). Blocked sources recorded as blocked |
| **C: field pilot** | **NOT MET** | No real authentication; no offline capture/sync; Hindi and content unreviewed; no privacy/legal review; no backup/restore drill; no real-user field test |
| **D: production** | **NOT MET** | Open High finding R1 (no real authentication), no deployment security review, no monitoring/incident process, licences unconfirmed |

## 7. Single highest-priority next step

Add real authentication (and per-user role provisioning), then use it for a small supervised usability session with a few real mentors (reviewing the Hindi text at the same time). Everything else for Gate C depends on those two.
