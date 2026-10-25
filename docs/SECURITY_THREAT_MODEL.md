# SAMVAAD threat model

Scope: the Next.js application in this repository, its SQLite database, the public-data ingestion scripts and the optional Anthropic AI provider. Written 2026-10-25 for the V3 security pass. It is a design-level analysis checked against the code and tests listed in `docs/SECURITY_REVIEW.md`; it is **not** a penetration test and does not claim the system is secure in an absolute sense.

## 1. What is being protected

| Asset | Why it matters | Where it lives |
|---|---|---|
| Observation text, feedback, demonstrations, commitments, reports | Coaching content about identifiable teachers (by alias) in identifiable schools; could be misused as informal teacher evaluation | SQLite tables `observations`, `feedback_drafts`, `demonstration_scripts`, `commitments`, `visit_reports` |
| Teacher aliases and school assignments | Link a person-level record to a school and a mentor | `visits`, `school_assignments` |
| Session tokens | Whoever holds one acts as that user for up to 12 h | Browser cookie `samvaad_session` (HttpOnly); only a SHA-256 hash is stored server-side (`sessions`) |
| Audit log | Evidence of who approved what | `audit_logs` (append-only via DB triggers) |
| Approved practice cards / knowledge excerpts | Integrity of what the AI may cite | `practice_cards`, `knowledge_chunks` |
| Public datasets and their provenance | Integrity of every number shown as "real" | `public_*` tables, `data/` files, `data/source_registry.csv` |
| `ANTHROPIC_API_KEY` | Billing and abuse | Server environment only |
| Availability of the demo/pilot | A mentor must be able to record a visit | Single Node process + SQLite file |

**Current data classification:** every school, teacher and visit in the shipped database is fictional demo data. The public datasets are published statistics (state/district level), not personal data.

## 2. Actors and trust boundaries

| Actor | Trust | Notes |
|---|---|---|
| Mentor (CRP/BRP/ARP) | Authenticated, trusted for **their own** visits only | Sees own visits and assigned schools |
| Supervisor (BEO etc.) | Authenticated, aggregate-only | No observation text; groups under 5 hidden |
| DIET curator | Authenticated, library only | Approves cards/excerpts; no visit content |
| Anonymous network user | Untrusted | Can reach `/login`, `/api/v1/health`, `/ready`, personas list (demo mode) |
| Malicious authenticated user | Untrusted within role | Tries IDOR, role escalation, injection, abuse of AI endpoint |
| Browser of a legitimate user | Partially trusted | May be attacked by a malicious site (CSRF) or by stored content (XSS) |
| Anthropic API | Third party, untrusted output | Output is validated; input may include visit text (see §5, AI) |
| Public data publishers / downloaded files | Untrusted input | Parsed by our code; gated by validation |
| Operator / host machine | Trusted | Anyone with filesystem access can read the SQLite file (no encryption at rest) |

Trust boundaries: (1) browser ⇄ server, (2) server ⇄ SQLite file, (3) server ⇄ Anthropic, (4) developer machine ⇄ public Internet (downloader), (5) files in `data/` ⇄ database (ingest).

## 3. Entry points

- Pages (server-rendered, behind `src/proxy.ts` CSP; auth checked in layouts via `getActor`).
- `/api/v1/[...path]` catch-all router (`src/lib/api/router.ts`): every route is declared with `route()` (auth required) or `publicRoute()` (explicit).
- CLI scripts (`npm run data:*`, `kb:*`) run by a developer, not exposed over HTTP.
- Environment variables (operator-controlled): `DEMO_MODE`, `AI_PROVIDER`, `ANTHROPIC_*`, `SAMVAAD_*`.

## 4. Threats, controls and evidence

STRIDE-style table. "Evidence" names the automated test that exercises the control; "Residual" is what is still open.

| # | Threat | Control | Evidence | Residual |
|---|---|---|---|---|
| T1 | **Spoofing**: forged or guessed session | Random 32-byte token, only hash stored, 12 h TTL, revocable, length bounds, HttpOnly + SameSite=Lax + Secure (production builds) | `tests/security-sessions.test.ts` | **Demo sign-in is a persona picker with no credential (see R1)** |
| T2 | Session fixation / replay after logout | New token per sign-in; `DELETE /session` revokes server-side; expired/revoked rejected | `security-sessions.test.ts` | Stolen token valid until expiry/revocation |
| T3 | **Elevation**: mentor reads another mentor's visit (IDOR) | Ownership + active-assignment check in `getAuthorizedVisit`; other mentor gets 404 (no existence leak) | `tests/security-authz.test.ts` (matrix over every `:id` route × 4 personas) | None known; matrix covers current routes only |
| T4 | Role escalation (supervisor/curator reading coaching content, mentor approving cards) | `requireRole(actor, permission)` in every service; permission map in `auth/policy.ts` | `security-authz.test.ts`, `safety.test.ts`, e2e "unsafe or unauthorised requests" | — |
| T5 | Curator or supervisor listing unmasked visits | `listVisits` forbidden for non mentor/supervisor; supervisor views aggregated with k≥5 | regression test in `security-authz.test.ts` (found a real flaw, fixed) | — |
| T6 | **Tampering**: CSRF from another site | SameSite=Lax cookie; `Sec-Fetch-Site`/`Origin` same-origin check on state-changing requests; JSON content-type required | `security-api.test.ts` | No CSRF token; relies on browser-supplied headers |
| T7 | Tampering: SQL injection | Parameterised statements only (`run/get/all` helpers); no string-built SQL with user data; Zod validation first | `e2e/security.spec.ts` SQLi test, fuzz of path/query params in `security-api.test.ts` | Dynamic ORDER/WHERE fragments are built from fixed allow-lists (reviewed by grep, not by tool) |
| T8 | Stored/reflected XSS | React escaping; **zero** `dangerouslySetInnerHTML`/`innerHTML`/`eval` in `src`; nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`); `nosniff` | `e2e/security.spec.ts` (payloads in 12 free-text fields rendered on 7 pages; no execution, no CSP violation, no injected elements) | `style-src-attr 'unsafe-inline'` (chart bars use inline style attributes) |
| T9 | Prompt injection through observation text | Model output is never trusted: citations rebuilt from DB, only retrieved + approved cards/excerpts may be cited, evaluative language rejected, schema validated, human approval required before anything is final | `safety.test.ts`, `e2e/security.spec.ts` prompt-injection test, `ai-provider-security.test.ts` | A real LLM could still produce poor *wording*; content is a draft until a mentor approves |
| T10 | Hallucinated or unsourced citation | `validateFeedbackOutput` drops/rejects citations not among retrieved approved cards; chunk snapshots stored | `safety.test.ts`, `knowledge-base.test.ts` | Quality of the cards themselves depends on curators |
| T11 | Lost update / double submit | `expected_updated_at` optimistic concurrency (409 `stale_edit`); `Idempotency-Key` on creates incl. in-flight de-duplication; unique constraints | `tests/reliability.test.ts` (found a real race, fixed) | Idempotency store is per database; in-flight map is per process |
| T12 | **Repudiation**: "I never approved that" | Append-only `audit_logs` (UPDATE/DELETE blocked by triggers), actor/action/resource/time; no free text or secrets in details | `workflow.test.ts`, `db-seed.test.ts` | Not cryptographically tamper-evident; a DB owner can drop triggers |
| T13 | **Information disclosure**: secrets in responses/bundles | Key read server-side only; static messages for provider errors; no stack traces; canary-key build scan of `.next/static` and `.next/server` found 0 hits | `ai-provider-security.test.ts`, `e2e/security.spec.ts` "secrets… not served", manual canary build (QA report §6) | Source maps not published; Next.js dev mode exposes more |
| T14 | Disclosure of DB/source files over HTTP | Only `public/` and Next assets are served; probes for `.env`, `*.db`, `/src`, path traversal encodings return 404/400 | `e2e/security.spec.ts` | — |
| T15 | Disclosure via CSV export (formula injection) | Cells beginning `= + - @` are neutralised on export | `safety.test.ts` | — |
| T16 | **DoS**: oversized bodies, floods, expensive AI calls | 256 KB body cap (413), per-IP + per-user + per-endpoint token buckets (429 + Retry-After), AI endpoints 12/min/user, list `limit` bounded, request timeout for AI | `security-api.test.ts` | In-memory, per process, resets on restart; without a trusted proxy all clients share one IP bucket (see R2) |
| T17 | DoS via DB lock / failure | Busy → 503 with Retry-After, no stack; `/ready` checks DB | `security-api.test.ts` | SQLite is single-writer; no load test |
| T18 | Malformed input crashes | Zod on every body; param decode errors → 400; unknown errors → generic 500 with request id | `security-api.test.ts` (fuzzed ids/limits) | — |
| T19 | **SSRF / unsafe download** by the data downloader | https only, host allow-list derived from the registry, manual redirects re-validated each hop (max 5), IP-literal/localhost/private/link-local/metadata addresses refused incl. after DNS resolution, 60 MB streamed cap, signature check, no auto-follow | `tests/safe-fetch.test.ts` (36 cases) + live run of `npm run data:download` | DNS rebinding between check and connect (TOCTOU) not closed; script is developer-run, not exposed over HTTP |
| T20 | Poisoned/corrupt dataset ingested | Import only if validation report shows all checks passed **and** the processed file's SHA-256 matches the manifest; per-row schema, finite numeric values, field-length caps, 20 MB / 100 k-row caps, NUL/invalid-UTF-8 rejection, duplicate-row rejection, one-transaction replace with rollback | `tests/ingest-hardening.test.ts` (17 cases), `public-data.test.ts` | The checksum protects against accidental change, not against an attacker who can rewrite both file and manifest (needs host access) |
| T21 | Fabricated "real" data | Every value carries source id, period, locator; blocked sources recorded as blocked and never active; fictional data labelled; no value is generated by AI | `public-data.test.ts` (values match numbers printed in the sources), registry doc | PDF table parsing risk (documented) |
| T22 | Archive attacks (zip slip, zip bomb) | **Not applicable**: no archive extraction exists in the code; only PDF and CSV inputs. | grep of `src`/`scripts` (no `unzip`, `tar`, `adm-zip`) | If archive ingestion is ever added it needs its own review |
| T23 | Supply chain | `npm audit`: 0 vulnerabilities; `npm audit signatures`: 401 packages with verified registry signatures; lockfile committed; exact minimal dependency set | QA report §7 | No SBOM/licence scan; transitive trust in npm packages |
| T24 | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `security-headers.test.ts`, e2e | — |
| T25 | Privacy: person-level data leaves the system | No audio, no teacher names (aliases only), AI input built from visit text; `AI_PROVIDER=demo` is default and sends nothing anywhere | `privacy-and-safety.md`, `ai-provider-security.test.ts` | **If `AI_PROVIDER=anthropic` is enabled, observation text is sent to a third party**; needs legal/DPDP review first (R7) |

## 5. Abuse cases worth calling out

1. **Informal teacher scoring.** The product forbids teacher scores/ranks; supervisor views are aggregate with a minimum group of 5, and indicator definitions are tested for "score/rank/rating" wording. A determined user can still read their own mentees' text. This is a policy risk, not a technical one.
2. **Malicious mentor feeding the AI.** Covered by T9/T10: the worst outcome is a bad *draft* the same mentor must approve.
3. **Insider with DB access.** Out of scope for application controls; see R3.

## 6. Accepted / open risks (summary; details in SECURITY_REVIEW.md)

- R1 **No real authentication** (demo persona picker). Blocks production.
- R2 Rate limits and in-flight idempotency are per-process memory.
- R3 No encryption at rest, no backup/retention policy, audit log not cryptographically chained.
- R4 CSP allows inline style *attributes*.
- R5 CSRF defence relies on SameSite + fetch-metadata headers (no token).
- R6 `node:sqlite` is an experimental Node API.
- R7 Third-party AI processing of visit text is unreviewed legally and the live provider is untested.
- R8 No SAST/DAST/secret-scanner binary was available or run; no external penetration test.

## 7. Re-review triggers

Re-run this model when: real authentication is added; a second server instance or Postgres is introduced; audio/ASR is added; any new import source or archive format is added; the Anthropic provider is enabled with real data; any new API route is added (extend the IDOR matrix in `security-authz.test.ts`).
