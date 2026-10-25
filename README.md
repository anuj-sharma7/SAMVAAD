# SAMVAAD (संवाद)

**An AI-assisted mentoring copilot that turns every school visit into one evidence-backed, followed-up coaching cycle.**

Plan → Observe → Coach → Demonstrate → Follow up, for CRPs, BRPs, ARPs and NIPUN mentors.

> **This is a working prototype with fictional demo data.** No real school, teacher or child data. No pilot has been run and no results are claimed. Pilot figures from the deck appear only as *"Pilot target — not yet measured"*.

The product source of truth is the SAMVAAD deck, kept in [`docs/source/`](docs/source) together with the build specification.

## What works today

| Area | Status |
|---|---|
| Demo sign-in as mentor, supervisor or DIET curator (persona picker) | Working. **Not production authentication.** |
| Dashboard, schools, visits, visit planning with auto-linked previous commitment | Working |
| Visit lifecycle `Draft → Planned → In progress → Pending review → Completed`, enforced | Working |
| Observation capture; rubric-tag **suggestions** the mentor must confirm | Working (rule-based baseline, no measured accuracy) |
| Practice library with approval workflow, versions and source metadata | Working (illustrative cards, see limitations) |
| Retrieval of approved cards → feedback card (strength / priority practice / next step / Ask–Describe–Ask) with server-verified citations | Working |
| AI provider: deterministic **simulated** provider by default; real Anthropic provider when configured | Simulated: working. Anthropic: implemented and unit-tested with failure cases, **not exercised against the live API** |
| Mentor edit, regenerate, reject, explicit approval | Working |
| Five-minute demonstration script tied to the approved card | Working |
| Commitments, follow-up review at a later visit, due-soon / overdue | Working |
| Report filled from stored records, mentor review, finalize, print/PDF, CSV export | Working |
| **Public Education Context**: real UDISE+ 2024-25 state tables and ASER 2024 state, district and divisional estimates (4,844 values; 36 states/UTs from UDISE+ and 8 states in detail from ASER), each with source, reference period and geography level | Working (see "Real public data" below) |
| **Reproducible data pipeline** with source registry, checksums, validation (53 checks) and audited import | Working: `npm run data:refresh` |
| **Teaching-practice knowledge base**: 19 verbatim excerpts from the Ministry's NIPUN Bharat Guidelines and 9 source-backed card drafts, **pending human review** | Working; nothing is usable for coaching until a curator approves it |
| Server-enforced roles, append-only audit log, aggregate-only supervisor view (min. group 5) | Working |
| Audio capture, transcription, offline sync, PWA | **Not built** (audio is off) |
| DIKSHA / Samiksha / UDISE+ / state MIS **integration** (live APIs) | **Not built.** Published reports are downloaded and imported as files; there is no live connection (CSV export only) |
| Rajasthan school directory (Shala Darpan), UDISE+ microdata, data.gov.in CSVs, NAS report PDFs | **Not acquired** (CAPTCHA / registration / HTTP 403 / host unreachable; see `docs/data_access_requests.md`) |
| Hindi interface | Only key coaching outputs and some labels; the rest is English |

Full list: [`docs/limitations-and-assumptions.md`](docs/limitations-and-assumptions.md).

## Run it locally (Windows PowerShell)

**Prerequisites:** Node.js 24 LTS (the database uses Node's built-in `node:sqlite`, available from Node 22.5; Next.js 16 needs 20.9+) and npm. No Python, no database server and no AI key are needed.

```powershell
cd C:\dev\samvaad
npm install
Copy-Item .env.example .env.local     # optional: defaults already run in demo mode
npm run dev
```

Open **http://localhost:3000** and choose a persona. The database (`./data/samvaad.db`) is created and seeded with fictional data on first start. To start over: `npm run db:reset`.

Production build:

```powershell
npm run build
npm run start
```

macOS/Linux are identical except `cp .env.example .env.local`.

> Node prints `ExperimentalWarning: SQLite is an experimental feature`. This is expected; see [`docs/architecture.md`](docs/architecture.md).

### Personas

| Persona | Role | Sees |
|---|---|---|
| Asha (demo mentor) | CRP, Block North | Her 6 schools, visits, feedback, follow-ups, reports |
| Rakesh (demo mentor) | BRP, Block South | His 2 schools. Cannot see Asha's records |
| Meena (demo supervisor) | BEO | Operational summaries and aggregates only |
| Ishaan (demo DIET curator) | Library admin | Practice-card library and its audit trail |

## Real public data and the knowledge base

SAMVAAD separates four kinds of content, and the interface never blends them:

| Layer | Example | Marking |
|---|---|---|
| Real public statistics | UDISE+ 2024-25, ASER 2024 | **Public data · real source** badge, a source citation beside every figure, reference period, geography level |
| Fictional operational records | schools, visits, observations, commitments | amber **Demo · fictional** tag and the persistent demo banner |
| Simulated AI output | demo-provider feedback | amber **Simulated AI output** badge |
| Teaching knowledge | official-source excerpts and practice cards | **Official source** badge with the verbatim excerpt and page, or **Illustrative · no external source** |

Open **Public context** in the sidebar (or use the toggle on the dashboard). Details, file list and the refresh command are in [`data/README.md`](data/README.md). The per-source outcome is in [`data/reports/ingestion_report.md`](data/reports/ingestion_report.md) and [`data/source_registry.csv`](data/source_registry.csv). Sources that need manual access or approval are listed in [`docs/data_access_requests.md`](docs/data_access_requests.md); none has been submitted.

**What is real:** the numbers on the Public Education Context pages and the quoted excerpts, each traceable to a downloaded file with a SHA-256 checksum. **What is not:** any visit, teacher, observation, school in the demo, or AI output. Public data describes systems and rural-household surveys; it is never used to score or rank teachers and it does not influence visit prioritisation.

```powershell
npm run data:refresh    # re-download (or re-verify), parse, validate, build the registry, import
npm run data:validate   # re-check processed files: structure, arithmetic, cross-file consistency
```

## Environment variables

Copy `.env.example` to `.env.local`. All are optional for the demo.

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_MODE` | `true` | Seeds fictional data and enables the persona picker. `false` disables demo sign-in (real auth is not implemented). |
| `SAMVAAD_TRUST_PROXY` | unset | Set `true` only behind a reverse proxy you operate that overwrites `X-Forwarded-For`; otherwise the header is ignored and rate limits use one shared bucket. |
| `SAMVAAD_HTTPS` | unset | Set `true` behind HTTPS: adds HSTS and `upgrade-insecure-requests`. (The session cookie is `Secure` in any production build.) Sessions are random server-side tokens, hash stored in SQLite; no signing secret exists. |
| `SAMVAAD_DB_PATH` | `./data/samvaad.db` | SQLite file location. |
| `AI_PROVIDER` | `demo` | `demo` (simulated, offline) or `anthropic`. |
| `ANTHROPIC_API_KEY` | none | Server-side only. Needed when `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | none | Model id to call. Needed when `AI_PROVIDER=anthropic`. |

If `AI_PROVIDER=anthropic` is set without a key, or the account has no credits, the app shows a controlled error, saves nothing and offers an explicit **"Use a simulated draft instead"** button. It never silently substitutes simulated output.

## Checks

```powershell
npm run typecheck     # TypeScript (strict)
npm run lint          # ESLint
npm test              # unit + integration + API tests (Vitest, in-memory SQLite)
npm run data:validate # 53 data-integrity checks on the processed public data
npm run build         # production build
npm run test:e2e      # browser tests (Playwright) against a production build
```

One-time for e2e: `npx playwright install chromium`. Recorded results: [`TASKS.md`](TASKS.md).

## Project layout

```
src/app/            App Router pages and the /api/v1 catch-all route
src/components/     ui.tsx, forms.tsx, sidebar, toast, confirm dialog, report document…
src/lib/db/         migrations, SQLite client, seed data
src/lib/data-sources/ public-data and knowledge-base importers (checksum + validation gated)
scripts/data/       downloader, parsers, validator, registry builder, excerpt extractor
data/               source registry, processed datasets, knowledge-base excerpts, reports
src/lib/services/   visits, observations, feedback, demonstrations, commitments, reports, audit…
src/lib/engines/    E1 prioritiser, E2 tagger, retrieval
src/lib/ai/         provider interface, demo + Anthropic providers, prompts, output schemas
src/lib/api/        router and endpoint table
tests/  e2e/  docs/
```

## Documentation

[V5 status and gates](docs/V5_RELEASE_STATUS.md) · [Baseline](docs/BASELINE_STATUS.md) · [Data dictionary](docs/DATA_DICTIONARY.md) · [Architecture](docs/architecture.md) · [Data model](docs/data-model.md) · [API contract](docs/api-contract.md) · [Data directory](data/README.md) · [Data access requests](docs/data_access_requests.md) · [Privacy and safety](docs/privacy-and-safety.md) · [Limitations and assumptions](docs/limitations-and-assumptions.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md) · [QA test report](docs/QA_TEST_REPORT.md) · [Security review](docs/SECURITY_REVIEW.md) · [Threat model](docs/SECURITY_THREAT_MODEL.md) · [Data source registry](docs/DATA_SOURCE_REGISTRY.md) · [Release checklist](docs/RELEASE_CHECKLIST.md) · [Three-minute judge demo](docs/demo-script.md)

## Release status

**Demo / prototype only. NO-GO for production or real user data**: sign-in is a demo persona picker (no real authentication). Automated checks pass (207 unit/integration tests, 12 browser tests, 41 data checks, 0 npm vulnerabilities), but no independent security tooling, penetration test or live AI call has been run. See [Release checklist](docs/RELEASE_CHECKLIST.md), [Security review](docs/SECURITY_REVIEW.md) and [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Safeguards (enforced in code and covered by tests)

- No teacher scores or rankings. Output with evaluative language about a teacher is rejected.
- AI drafts only. Approval is explicit and impossible without an approved source card.
- Citations are rebuilt from the database and must belong to the cards retrieved for that visit; invented ids are discarded.
- No approved card matches → *"Insufficient approved evidence"*, never an invented source.
- Retrieved text is untrusted data, never instructions.
- Audio is off. No child names, no student table. Supervisors see aggregates only; groups under 5 are hidden.
- The audit log is append-only (database triggers) and never stores secrets or the mentor's free text.
- No claim of legal compliance (e.g. DPDP Act 2023); legal review is required before real use.
