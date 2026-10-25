# Limitations and assumptions

## 1. From the deck (source of truth)

The problem framing, the five-step cycle, the five engines, the non-negotiables (no teacher scores, human approval, opt-in audio, aggregates with minimum group of 5) and the pilot targets come from `docs/source/SAMVAADDeck.pdf`. The deck tags its own claims (FACT / DERIVED / ASSUMPTION / HYPOTHESIS / TARGET / DESIGN); the prototype does not re-assert any of them as results.

## 2. Design choices made for this prototype (not in the deck)

- Next.js-only stack with SQLite instead of FastAPI + Postgres (no Python on the build machine; one-command demo).
- Rule-based retrieval and tagging; rule-based visit prioritiser with editable weights.
- Visit lifecycle `Draft → Planned → In progress → Pending review → Completed`, where completion happens only by finalizing the report.
- Commitment states `open → completed → reviewed` (+ `cancelled`); due-soon (5 days) and overdue derived from the target date.
- Teachers are visit-level aliases, not a teacher table.
- Roles: mentor, supervisor, DIET library administrator.

## 3. Mock / simulated content

- **Practice cards are illustrative**, written for the demo. They are not NCERT/SCERT/DIET publications and carry no URL. The "approved" state is by a fictional curator persona. The Hindi text has not been reviewed by a Hindi-speaking education expert.
- The rubric taxonomy is a small demo set that needs domain validation.
- The default AI provider is a deterministic template engine, labelled "Simulated AI output" wherever it appears. It is not a language model.
- All schools, teachers, visits, observations and commitments are fictional.

## 3b. Real public data (added in v2)

- **UDISE+ 2025-26 (added):** the 2025-26 booklet (existing structure; data cut-off 31 March 2026, per its p.7) was downloaded from the public dashboard and Tables 2.2 and 2.5 parsed under separate source `udise_2025_26_booklet` and period `UDISE+ 2025-26` (999 values). It is checked by 12 further arithmetic checks, including a match to the booklet's own printed national totals (p.11) and national facility percentages (p.29). The 2025-26 booklet prints "&" state spellings; these are mapped to canonical names. The PIB press release is recorded as a page only; none of its figures are used. The two years are never merged; UI code must pick a `reference_period`.
- **Real and verified:** UDISE+ 2024-25 booklet Tables 2.2 and 2.5 (state/UT level; data cut-off 31 March 2025 per the booklet) and ASER 2024 state pages, district estimates and divisional estimates for Rajasthan, Gujarat, Haryana, Uttar Pradesh, Madhya Pradesh, Bihar, Punjab and Uttarakhand (district files exist for all of these except Punjab; Madhya Pradesh's divisional file has no state-total row). Parsed from PDF text and validated by 41 automated checks including arithmetic and cross-file consistency.
- **ASER is a rural household sample survey**: estimates with sampling error, rural areas only, not school-level, not a measure of teaching quality. District estimates in this release carry no confidence intervals; divisional estimates do (shown as published). Districts with an insufficient sample are shown as "not published", never as zero. Uttar Pradesh: 70 of 71 districts published; Uttarakhand: 12 of 13.
- **UDISE+ here is state-level only.** No Rajasthan district or school-level directory could be obtained (see below). The Rajasthan view therefore combines state-level school-census figures with ASER district and division survey estimates; these are different sources with different reference periods and are never merged into one number.
- **Public data is not used in prioritisation or in any score.**
- **Not acquired:** data.gov.in CSVs (HTTP 403 to scripted download), UDISE+ report module (HTTP 503) and microdata (registration), Shala Darpan reports and search (CAPTCHA), NCERT/NAS PDFs (host unreachable), DIKSHA usage datasets (not needed). Details and checklists: `docs/data_access_requests.md`.
- **Licences:** none of the retrieved pages states an open licence for the files. SAMVAAD keeps raw files local (git-ignored), republishes only derived statistics and short excerpts with attribution, and records the licence status per source in the registry. A public URL is not treated as permission to redistribute.
- **Parsing risk:** tables come from PDFs, not machine-readable files. Column meanings were taken from the printed headers and confirmed by checks (for example the national internet share computes to 63.5%, matching the figure cited in the deck). A new edition of a PDF may change layout; the validator would then fail instead of importing wrong numbers.
- **Name matching:** ASER district spellings are kept exactly as printed. Without official district codes, ASER districts are not joined to any other dataset.

## 3c. Teaching-practice knowledge base (added in v2)

- **Source:** one official document, *NIPUN Bharat: Guidelines for Implementation* (English; DIKSHA-hosted copy). 19 short verbatim excerpts with page numbers were extracted by anchor text from the downloaded PDF and are verified word-for-word by a test. The excerpt selection was proposed by SAMVAAD's developer assistant, **not by an education expert**.
- **Status:** every excerpt is `pending_review` and every source-backed card is `draft`. They become usable for coaching only after a curator approves each excerpt and then the card. No one has approved them.
- **Card wording** (steps and next step) is a close paraphrase drafted by SAMVAAD and must be checked against the excerpts. There is no Hindi text for these cards; Hindi drafts fall back to English for them and say so.
- The guidelines are a policy and implementation document, not a classroom coaching manual. They support general practices (read-aloud and discussion, retelling, shared reading, counting with real objects, exploring strategies, asking questions). They contain no mentor coaching scripts, and SAMVAAD does not claim they validate any specific feedback.
- The 12 earlier cards remain illustrative and are labelled as having no external source. Official-source cards rank slightly higher at equal relevance (+2.5, shown in the retrieval trace).

## 4. Not implemented

Audio capture, consent/redaction workflow, ASR (IndicConformer or other), automatic audio deletion, offline/PWA and sync queue, vector search, a trained prioritiser or tagger, production authentication, background reminders or messaging, voice notes to teachers, OCR, state-MIS / DIKSHA / Samiksha / UDISE+ integration (only a CSV export), teacher-facing view, a full Hindi interface, Postgres/RLS.

## 5. Not verified

- The Anthropic provider has not been called against the live API in this build (no key or credits were used). Its error mapping is covered by unit tests with injected failures.
- No accuracy figures exist for any engine: no Cohen's κ, draft-usability rate, ASR error rate or time-saving. These must come from the Phase 0/1 pilot.
- No learning or teaching-practice improvement is claimed. The deck itself notes coaching effects dilute at scale and come mostly from US studies.
- Accessibility was checked by contrast calculations, semantic markup and keyboard-friendly components, not by a screen-reader audit.
- No performance or load testing; SQLite is single-writer.

## 6. Needed before real use

Legal/DPDP review and a state data-sharing agreement; real authentication; curated, officially sourced practice cards with expert-reviewed Hindi; a validated rubric; teacher and head-teacher consent design; evaluation of any model by language and dialect; hosting on approved infrastructure; deletion and retention automation if audio is introduced.
