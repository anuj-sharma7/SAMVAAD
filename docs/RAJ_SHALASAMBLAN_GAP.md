# Raj ShalaSamblan vs SAMVAAD: gap list

Written 2026-10-31. **Evidence level matters here:** the Play Store page, AppBrain and apkcombo could not be fetched, no video could be watched, and the app was never installed. Everything below comes from one Play Store screenshot supplied by the user, an NIC (Informatics) news item and a few search snippets. Items marked **unverified** must be checked against the real app before anyone builds on them.

## What Raj ShalaSamblan is (verified or reasonably sourced)

| Fact | Source |
|---|---|
| Department of Secondary Education, Rajasthan. 4.1★, 167 reviews, 50k+ downloads. | User screenshot of the Play Store page |
| Used by registered officers and staff of the Shala Darpan portal for **school visits**. Same credentials as Shala Darpan. | Download-site listing (FileHippo) |
| ShalaSamblan 2.0 (launched 2023) collects and analyses data on academic processes, learning outcomes, ICT, vocational education and mid-day meal (MDM). | NIC Informatics, Oct 2023 |
| Officials can pick schools **voluntarily**, in addition to assigned schools. | NIC Informatics, Oct 2023 |
| Login screen: mobile number plus a captcha-style code. An assessment is split into "6 parts". Student lists exist. | User screenshot (text very small, so partly **unverified**) |
| Some functions work offline. | One download site; **unverified** |

## What users complain about (weak evidence: a few old store-listing comments)

OTP login fails or is asked for every time; a registered number shown as unauthorised; very slow start-up; no print option; no space for short comments. These come from older listings and may not describe the current version.

## Gap list

| # | Raj ShalaSamblan (as far as known) | SAMVAAD today | Gap? |
|---|---|---|---|
| 1 | Pick schools beyond the assigned ones | A mentor sees only schools they are actively assigned to (`school_assignments`). This is an authorisation rule, not an accident. | **Yes, needs a decision** (see below) |
| 2 | School-level data: ICT, vocational education, MDM, learning outcomes | None. SAMVAAD records classroom coaching evidence only. | **Yes, and it conflicts with SAMVAAD's stance** (see below) |
| 3 | Login with mobile number and OTP, tied to Shala Darpan accounts | Demo persona picker only. No real authentication. | **Yes, large.** Needs an SMS provider and government integration that is not available here. |
| 4 | Offline use | Offline field mode (IndexedDB outbox, sync). | No gap on paper; never run on a real device. |
| 5 | Print | Print on the pre-visit brief, report and teacher summary. | No gap (SAMVAAD ahead of the reviews' complaint) |
| 6 | Short comments | Context note and free-text fields on every observation, now with tap-to-answer and voice. | No gap |
| 7 | Fast start-up | Not measured. | **Unknown.** Worth measuring. |
| 8 | Hindi interface | Hindi is the default, simple wording, English toggle. | No gap, but wording unreviewed by a local teacher |
| 9 | Student lists | None, deliberately: SAMVAAD never records children's names. | Not a gap, a design choice |

## The decisions only the product owner can make

1. **Inspection data (row 2).** ShalaSamblan is a monitoring tool. SAMVAAD is a coaching tool and states that its data is "for support, never for appraisal, transfer or discipline", and it never scores or ranks teachers. Adding school inspection checklists (ICT, MDM...) is possible, but it changes what the product is and how teachers will trust it. Do this only if it is wanted, and keep it at **school level, never per teacher**.
2. **Voluntary school choice (row 1).** Safe to build as "add a school to my list" with an audit entry, keeping assigned schools as the default. It loosens the current rule that a mentor sees only assigned schools.
3. **Real login (row 3).** Cannot be finished or tested without an SMS gateway and real accounts. A realistic first step is a proper password or one-time-code login for a small pilot, with the demo picker switched off.
