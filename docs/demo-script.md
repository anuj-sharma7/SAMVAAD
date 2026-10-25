# Three-minute judge demo

Open http://localhost:3000. Say once, up front: **"This is a working prototype on fictional data; the AI here is a labelled simulation unless a key is configured."**

| Time | Do | Say |
|---|---|---|
| 0:00 | Choose **Asha (demo mentor)**. Point at the amber banner, the follow-up queue and the school priorities. | "Mentors count visits today; SAMVAAD tracks whether the teacher acted. Each priority shows its reasons, and the pilot targets say *not yet measured*." |
| 0:20 | **Schools → Kesar Vihar Primary → New visit here.** Type alias `T-101`. | "The overdue action from the last visit appears automatically." |
| 0:35 | Grade 2, Hindi, coaching language English → **Plan visit → Start visit**. | |
| 0:45 | On the visit page, **Record what happened** → *Tried, needs more support* with a short note. | "Follow-up is recorded at the next visit and never becomes a teacher score." |
| 1:00 | **Observe.** Enter: practice "Learners read the story aloud in pairs"; evidence "Few questions checked whether learners understood the story"; area to grow "Few questions about the meaning of the story". Save. **Confirm** the suggested tag. | "Tags are suggestions; the mentor confirms." |
| 1:20 | **Coach → Generate draft.** Open *Why this source?* and **Inspect the practice card (R-14)**. | "One strength, one practice, one next step, with Ask–Describe–Ask. The citation is checked against the approved library; if nothing matched, it would say *insufficient evidence*." |
| 1:50 | Edit the next step to: *Ask three why or what-next questions after each read-aloud this week.* **Save → Approve.** | "The mentor edits and approves; nothing is final otherwise." |
| 2:10 | **Demonstrate → Generate → Approve script.** | "A five-minute script from the same approved card." |
| 2:25 | **Follow up & report → Save commitment**, then **Prepare report → Finalize**. | "The commitment will be shown at the next visit. The report is filled from saved records; AI-drafted and mentor-written parts are labelled." |
| 2:50 | **Follow-ups** and **Dashboard** show the new commitment and updated counts. Optional: switch to **Meena** (aggregates, hidden small groups). | "SAMVAAD assists mentors; it does not score teachers or replace their judgement." |

Backup if something looks wrong: `npm run db:reset` restores the seeded data. Hindi: regenerate the card with language **हिन्दी**.

## Optional 45-second add-on: real public data and the knowledge base

1. Click **Public context** in the sidebar. Say: "These figures are real and published (UDISE+ 2024-25 and ASER 2024), each with its source and reference year. They are context, never a score, and they are not our fictional visits."
2. Pick **Rajasthan** and "Std III–V children who can read a Std II level text". Point at the division chart with confidence intervals and open **View as table**. Say: "ASER is a rural household sample survey, so these are estimates, not school-level truth."
3. Open **source catalogue**. Say: "Here is what we could not get, and why: a CAPTCHA, a registration, a 403. We did not bypass any of them."
4. Sign in as **Ishaan (DIET curator)**, open card **K-R01** (Official source). Show the verbatim excerpts with page numbers. Say: "These start as pending review. Nothing from the official document can support coaching until a curator approves every excerpt." Approve the excerpts and the card, then generate feedback as Asha to see the quoted excerpt in the citation.
