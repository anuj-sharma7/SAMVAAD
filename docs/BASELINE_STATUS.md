# Baseline status before the V5 pass

Taken 2026-10-25 at the start of V5, from the verified end state of the V3 pass (commands and results in `docs/QA_TEST_REPORT.md`). Project root: `C:\dev\samvaad` (the OneDrive Desktop folder only holds the Claude session). Git: one "Initial commit"; all SAMVAAD work is uncommitted. Nothing was deleted or overwritten for V5; new changes are additive (new migration, new files, in-place edits).

## What already works (verified at baseline)

| Area | State | Evidence |
|---|---|---|
| Core flow: school → visit → observation → source-backed feedback → approval → demonstration → commitment → follow-up → report | Working, persisted in SQLite | `tests/workflow.test.ts`, `e2e/flow.spec.ts` |
| Roles (mentor/supervisor/DIET curator), audit log, citation validation, k≥5 masking | Working | `safety.test.ts`, `security-authz.test.ts` |
| Real public data (UDISE+ 2024-25, ASER 2024 for 8 states) + NIPUN Bharat excerpts | 25 sources validated, 3,845 values | `npm run data:validate` 41/41 |
| Security hardening (V3) | Done; open: no real authentication | `docs/SECURITY_REVIEW.md` |
| Automated checks | 207 unit tests, 12 browser tests, axe on 9 pages | `docs/QA_TEST_REPORT.md` |

## V5 gaps found at baseline (what this pass addresses)

| V5 requirement | Baseline state |
|---|---|
| English + Hindi **UI** (P0 #2) | **Missing.** UI text is hard-coded English in ~50 components. Only AI-drafted coaching output could be Hindi. `<html lang>` fixed to `en`. No dictionaries, no language switcher, no key-parity tests. |
| Visible five-step progress indicator, plain-language labels | Partial: visit shell has steps but copy is English-only and uses some technical wording |
| Skippable first-run walkthrough, help and glossary | Missing |
| Pre-visit brief, teacher-facing action summary | Missing |
| Unsaved-changes warning and draft recovery | Partial (errors keep input; no leave-page warning, no restore) |
| Hindi font / layout verification | Font loaded (Noto Sans Devanagari) but never tested |
| `docs/DATA_DICTIONARY.md` | Missing |
| UDISE+ 2025-26 report (announced 7 July 2026) | Not checked (booklet used is 2024-25) |
| Offline / sync | Planned, not implemented (P2; blocks field-pilot gate C, not judge-demo gate A) |

## Release gates at baseline

Gate A (judge-demo MVP): **not met** (Hindi UI missing). Gate B (real data): met for the sources acquired. Gate C (field pilot) and D (production): not met.
