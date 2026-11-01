# Contributing to SAMVAAD

SAMVAAD is a prototype of an AI coaching copilot for school mentors. Small, careful changes are welcome.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000, pick a demo persona (no passwords)
```

Before you open a change, these must pass:

```bash
npm run typecheck
npm run lint
npm test             # unit and integration tests (Vitest)
npm run test:e2e     # browser tests (run `npx playwright install chromium` once)
```

## Rules this project keeps (please keep them too)

1. **Never score, rank or label a teacher.** No such column, field or screen may be added. AI text that judges a teacher is discarded by code.
2. **The AI drafts, the mentor decides.** Nothing reaches a teacher without the mentor reading and approving it.
3. **Sources are verified by code, not trusted from the model.** Citations are rebuilt from the database.
4. **No children's names, no real school, teacher or child data.** Demo data stays fictional and labelled.
5. **Be honest about status.** Targets are "not yet measured"; simulated AI output stays labelled; if something was not tested, say so.
6. **Hindi is everyday Hinglish** (Devanagari with common English words), and every new interface string needs both English and Hindi (a missing Hindi key is a compile error).

## Practical notes

- Database changes go in a new migration in `src/lib/db/migrations.ts`; never edit an applied migration.
- New API routes go in `src/lib/api/handlers.ts` and call a service that checks the user's role and ownership.
- Add a test with the change (a unit test, and a browser test for new screens).
- Do not commit secrets. `.env.example` has placeholders only.
- Security and privacy details: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md), [`docs/privacy-and-safety.md`](docs/privacy-and-safety.md).
