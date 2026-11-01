# Changelog

What changed in SAMVAAD, newest first. This is a prototype on fictional data; nothing here is a result from real users. Details and test results are in [`TASKS.md`](TASKS.md).

## 2026-11-02

- **Several subjects per visit**: when planning, tick several subjects or choose **All subjects (survey all)**. The first one is the main subject (used to find practice cards); the others are stored beside it (migration 0010) and shown on the visit page, the visits list and the pre-visit brief.
- **Fix**: updating a visit no longer resets its language and observation method to the defaults.
- **Welcome tour** on the sign-in page for first-time visitors (4 steps, skippable, replayable, in English and Hindi).
- **First-run tour in the app** now has 7 steps for mentors (4 for other roles), rings the menu item it is talking about on wide screens, shows progress, and works with the arrow keys.
- **Mentor Help**: a question set can be **copied as plain text** (for WhatsApp) or **printed / saved as PDF**.
- **Help**: two outdated FAQ answers corrected (offline and voice now exist) and three new entries.
- Tests: 415 unit and 53 browser tests passing.

## 2026-11-01

- **Download page** (`/download`): the latest Android version (0.5.0), build date, size, SHA-256 checksum and install steps, in English and Hindi. The login page shows the real version and links to it. A test checks that the advertised size and checksum match the actual APK.
- **Mentor Help**: academic problems with status and an instant AI suggestion; class 1–8 × six subjects question sets with tap-to-answer and AI review; mid-day meal and school-ground question sets.
- **Photos on problems**: up to 3 per problem, shrunk in the browser (location data removed), file type checked on the server, owner-only access.
- **Coaching guide** on the feedback page: live wording check and conversation advice. It never changes the card.
- **Observe page**: an "AI helpers for this visit" card opens Mentor Help with the visit's class, subject and school filled in.
- **Subjects**: Science, Social Science and Sanskrit added to visit planning.
- **AI Hindi** rewritten as everyday Hinglish.
- **Login page**: new logo (school and children) and an app-download button.
- **README** rewritten with diagrams, charts from real data, screenshots and an honest limitations section. Presentations added in `docs/presentation/`.
- Tests: 395 unit and 42 browser tests passing.

## 2026-10-31 to 2026-11-01

- **School check**: tap-to-answer problem list in seven areas, in the report, offline and on Android.
- **Guided questions and voice typing** across the visit forms; Hindi is now the default interface language.
- Rajasthan-first simplification of the login page and dashboard.

## 2026-10-26

- **Offline-first field mode** (PWA) with an idempotent sync API, and the first native Android build.

## 2026-10-25

- Bilingual (English and Hindi) interface, security hardening, and real public data (UDISE+ and ASER) with a validated import pipeline.
- Core coaching workflow: plan, observe, grounded feedback with verified citations, demonstration, follow-up and report.
