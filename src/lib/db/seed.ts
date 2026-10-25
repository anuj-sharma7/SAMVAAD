import { all, get, run, transaction, type Db } from "./client";
import { addDays, isoDate, newId, nowIso } from "../util";
import { SEED_CARDS, SEED_RUBRIC, SOURCE } from "./seed-cards";
import { keywordRetriever } from "../engines/retrieval";
import { composeFeedback } from "../ai/demo-provider";
import { buildRetrievalQuery, insertFeedbackDraft, toCardContext, validateFeedbackOutput } from "../services/feedback";
import { getApprovedCards } from "../services/practice-cards";
import { buildSnapshot, draftSummary } from "../services/reports";
import type { FeedbackTaskInput } from "../ai/schemas";
import type { Lang, ObservationRow, VisitRow } from "../types";

/** Fictional personas for the demo. This is a role picker, NOT production authentication. */
export const DEMO_USERS = [
  { id: "demo-mentor-asha", name: "Asha (demo mentor)", role: "mentor", designation: "Cluster Resource Person", block: "Block North", lang: "en" },
  { id: "demo-mentor-rakesh", name: "Rakesh (demo mentor)", role: "mentor", designation: "Block Resource Person", block: "Block South", lang: "en" },
  { id: "demo-supervisor-meena", name: "Meena (demo supervisor)", role: "supervisor", designation: "Block Education Officer", block: "Block North", lang: "en" },
  { id: "demo-curator-ishaan", name: "Ishaan (demo DIET curator)", role: "diet_admin", designation: "DIET practice-library administrator", block: null, lang: "en" },
] as const;

const SCHOOLS = [
  ["DEMO-0001", "Kesar Vihar Primary School", "Block North", "Cluster A"],
  ["DEMO-0002", "Ganga Ghat Primary School", "Block North", "Cluster A"],
  ["DEMO-0003", "Neem Chowk Primary School", "Block North", "Cluster B"],
  ["DEMO-0004", "Palash Nagar Upper Primary School", "Block East", "Cluster C"],
  ["DEMO-0005", "Mango Grove Primary School", "Block East", "Cluster C"],
  ["DEMO-0006", "Lotus Pond Primary School", "Block East", "Cluster D"],
  ["DEMO-0007", "Banyan Tree Primary School", "Block South", "Cluster E"],
  ["DEMO-0008", "Saras Kunj Primary School", "Block South", "Cluster E"],
] as const;

export function seedIfEmpty(db: Db): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  if (process.env.SAMVAAD_AUTO_SEED === "false") return false;
  const n = get<{ n: number }>(db, "SELECT count(*) AS n FROM profiles")!.n;
  if (n > 0) return false;
  seedDemoData(db);
  return true;
}

type TagSeed = { code: string; confirmed: boolean; source?: "mentor" | "suggested" };
interface ObsSeed {
  practice_observed: string; evidence: string; worked_well?: string; improvement_area?: string; context_note?: string;
  tags: TagSeed[];
}

export function seedDemoData(db: Db, now: Date = new Date()) {
  const at = (days: number, hour = 10) => {
    const d = addDays(now, days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const ts = nowIso();

  transaction(db, () => {
    // ---- people, schools, assignments, rubric, cards ------------------------------------------
    for (const u of DEMO_USERS) {
      run(db, `INSERT INTO profiles (id, display_name, role, designation, block, preferred_language, is_demo, created_at, updated_at)
               VALUES (?,?,?,?,?,?,1,?,?)`, u.id, u.name, u.role, u.designation, u.block, u.lang, ts, ts);
    }
    const schoolIds: string[] = [];
    SCHOOLS.forEach(([code, name, block, cluster]) => {
      const id = newId();
      schoolIds.push(id);
      run(db, `INSERT INTO schools (id, code, name, state, district, block, cluster, is_demo, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,1,?,?)`, id, code, name, "Demo State", "Sample District", block, cluster, ts, ts);
    });
    schoolIds.forEach((sid, i) => {
      const mentor = i < 6 ? "demo-mentor-asha" : "demo-mentor-rakesh";
      run(db, "INSERT INTO school_assignments (id, profile_id, school_id, status, created_at) VALUES (?,?,?, 'active', ?)", newId(), mentor, sid, ts);
    });
    for (const t of SEED_RUBRIC) {
      run(db, "INSERT INTO rubric_tags (code, domain, label, description, keywords, version, is_demo) VALUES (?,?,?,?,?,1,1)",
        t.code, t.domain, t.label, t.description, JSON.stringify(t.keywords));
    }
    for (const c of SEED_CARDS) {
      const approved = c.status === "approved";
      run(
        db,
        `INSERT INTO practice_cards (id, version, title, domain, grade_min, grade_max, subject, teaching_language, description,
           steps, example_prompts, next_step, variation, example_dialogue, tlm, tags, localized, source_org, source_title,
           source_section, source_url, source_type, approval_status, last_reviewed_at, reviewed_by, review_notes, curator_id,
           is_demo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        c.id, c.id === "R-14" ? 2 : 1, c.title, c.domain, c.grade_min, c.grade_max, c.subject, c.teaching_language, c.description,
        JSON.stringify(c.steps), JSON.stringify(c.example_prompts), c.next_step, c.variation, JSON.stringify(c.example_dialogue),
        JSON.stringify(c.tlm), JSON.stringify(c.tags), JSON.stringify({ hi: c.hi }), SOURCE.source_org, SOURCE.source_title,
        `Card ${c.id}`, null, SOURCE.source_type, c.status,
        c.status === "draft" ? null : at(-40), c.status === "draft" ? null : "demo-curator-ishaan",
        c.review_notes ?? (approved ? "Demo approval by a fictional curator. Real use requires validation by education experts." : null),
        "demo-curator-ishaan", ts, ts,
      );
      run(db, "INSERT INTO practice_card_versions (card_id, version, snapshot, changed_by, changed_at) VALUES (?,?,?,?,?)",
        c.id, 1, JSON.stringify({ id: c.id, title: c.title }), "demo-curator-ishaan", at(-45));
    }
    // R-14 has been revised once (v2): demonstrates version tracking.
    run(db, "INSERT INTO practice_card_versions (card_id, version, snapshot, changed_by, changed_at) VALUES ('R-14', 2, ?, 'demo-curator-ishaan', ?)",
      JSON.stringify({ id: "R-14", title: "Read-aloud with meaning questions", note: "Clarified the three-question routine" }), at(-40));

    // ---- helpers over the open transaction ----------------------------------------------------
    const tagRows = new Map<string, string[]>();
    const mkVisit = (v: {
      key: string; school: number; mentor?: string; teacher: string; days: number; hour?: number; grade: number; subject: string;
      language: Lang; status: VisitRow["status"]; purpose: string; focus?: string; prev?: string; prep?: string;
    }) => {
      const id = newId();
      const when = at(v.days, v.hour ?? 10);
      run(
        db,
        `INSERT INTO visits (id, school_id, mentor_id, teacher_alias, scheduled_at, grade, subject, language, purpose, coaching_focus,
           prep_notes, previous_commitment_id, observation_method, audio_consent, status, is_demo, started_at, completed_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'text', 'not_requested', ?, 1, ?, ?, ?, ?)`,
        id, schoolIds[v.school], v.mentor ?? (v.school < 6 ? "demo-mentor-asha" : "demo-mentor-rakesh"), v.teacher, when, v.grade, v.subject,
        v.language, v.purpose, v.focus ?? null, v.prep ?? null, v.prev ?? null, v.status,
        ["in_progress", "pending_review", "completed"].includes(v.status) ? when : null,
        v.status === "completed" ? addDays(when, 0).toISOString() : null, ts, ts,
      );
      return id;
    };
    const mkObs = (visitId: string, mentor: string, o: ObsSeed, days: number) => {
      const id = newId();
      const when = at(days, 10);
      run(db, `INSERT INTO observations (id, visit_id, practice_observed, evidence, worked_well, improvement_area, context_note, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)`, id, visitId, o.practice_observed, o.evidence, o.worked_well ?? null, o.improvement_area ?? null,
        o.context_note ?? null, mentor, when, when);
      for (const t of o.tags) {
        run(db, `INSERT INTO observation_tags (observation_id, tag_code, source, confirmed, match_strength, matched_terms, decided_by, decided_at)
                 VALUES (?,?,?,?,?,?,?,?)`, id, t.code, t.confirmed ? (t.source ?? "suggested") : "suggested", t.confirmed ? 1 : 0,
          t.source === "mentor" ? null : 0.67, "[]", t.confirmed ? mentor : null, t.confirmed ? when : null);
      }
      tagRows.set(visitId, [...(tagRows.get(visitId) ?? []), id]);
      return id;
    };

    /** Build feedback exactly like the live pipeline: retrieve -> compose (demo) -> validate -> insert. */
    const mkFeedback = (visitId: string, status: "draft" | "approved", approvedDays?: number) => {
      const visit = get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId)!;
      const observations = all<ObservationRow>(db, "SELECT * FROM observations WHERE visit_id = ? ORDER BY created_at", visitId);
      const cards = getApprovedCards(db);
      const byId = new Map(cards.map((c) => [c.id, c]));
      const { candidates, trace } = keywordRetriever(cards, buildRetrievalQuery(db, visit, observations));
      if (!candidates.length) throw new Error(`seed: no approved card matched visit ${visitId}`);
      const task: FeedbackTaskInput = {
        language: visit.language,
        visit: { grade: visit.grade, subject: visit.subject, purpose: visit.purpose, coaching_focus: visit.coaching_focus },
        observations: observations.map((o) => ({ id: o.id, practice_observed: o.practice_observed, evidence: o.evidence, worked_well: o.worked_well, improvement_area: o.improvement_area })),
        cards: candidates.map((c) => toCardContext(byId.get(c.card_id)!, c.score)),
      };
      const v = validateFeedbackOutput(composeFeedback(task), candidates, byId, new Set(observations.map((o) => o.id)));
      const approvedAt = approvedDays === undefined ? undefined : at(approvedDays, 11);
      const fid = insertFeedbackDraft(db, {
        visitId, actorId: visit.mentor_id, status, language: visit.language, output: v.output, citations: v.citations,
        provider: "demo", model: null, simulated: true, trace, approvedBy: status === "approved" ? visit.mentor_id : undefined,
        approvedAt, createdAt: approvedAt,
      });
      return { fid, output: v.output };
    };
    const mkCommitment = (visitId: string, fid: string, nextStep: string, targetDays: number, visitDays: number,
      status: "open" | "completed" | "reviewed", extra: Partial<{ reviewVisit: string; outcome: string; evidence: string; barriers: string }> = {}) => {
      const visit = get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId)!;
      const id = newId();
      run(
        db,
        `INSERT INTO commitments (id, visit_id, feedback_id, action_text, owner_role, owner_alias, target_date, expected_evidence, status,
           completed_at, review_visit_id, review_outcome, review_evidence, review_barriers, reviewed_by, reviewed_at, created_by, created_at, updated_at)
         VALUES (?,?,?,?, 'teacher', ?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, visitId, fid, nextStep, visit.teacher_alias, isoDate(at(targetDays)), `At the next visit, the mentor looks for: ${nextStep}`, status,
        status === "completed" ? at(targetDays - 2) : null, extra.reviewVisit ?? null, extra.outcome ?? null, extra.evidence ?? null,
        extra.barriers ?? null, status === "reviewed" ? visit.mentor_id : null, status === "reviewed" ? at(targetDays + 1) : null,
        visit.mentor_id, at(visitDays, 12), at(visitDays, 12),
      );
      return id;
    };
    const mkReport = (visitId: string, finalized: boolean, days: number) => {
      const visit = get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId)!;
      const snap = buildSnapshot(db, visit);
      run(
        db,
        `INSERT INTO visit_reports (id, visit_id, status, snapshot, mentor_summary, summary_origin, generated_at, reviewed_by, finalized_at, created_at, updated_at)
         VALUES (?,?,?,?,?, 'system_draft', ?,?,?,?,?)`,
        newId(), visitId, finalized ? "finalized" : "draft", JSON.stringify(snap), draftSummary(snap), at(days, 13),
        finalized ? visit.mentor_id : null, finalized ? at(days, 13) : null, at(days, 13), at(days, 13),
      );
    };

    const ASHA = "demo-mentor-asha";
    const RAKESH = "demo-mentor-rakesh";

    // ---- S1 Kesar Vihar: the flagship Grade 2 Hindi read-aloud scenario ---------------------------
    const v1 = mkVisit({ key: "v1", school: 0, teacher: "T-101", days: -21, grade: 2, subject: "Hindi", language: "hi", status: "completed", purpose: "Routine academic support visit", focus: "Comprehension after read-aloud" });
    mkObs(v1, ASHA, {
      practice_observed: "Learners read a short story aloud in pairs, taking turns page by page.",
      evidence: "Pairs read from the story book in turns while the teacher walked around. After reading, the teacher asked “Did you like the story?” and moved to the next activity; no question checked whether learners understood the story.",
      worked_well: "Learners read the story aloud in pairs and stayed engaged throughout.",
      improvement_area: "Few questions were asked about the meaning of the story after reading.",
      context_note: "Hindi reader, unit 3 (fictional lesson)",
      tags: [{ code: "RC-01", confirmed: true }, { code: "DC-02", confirmed: true, source: "mentor" }],
    }, -21);
    const f1 = mkFeedback(v1, "approved", -21);
    const c1 = mkCommitment(v1, f1.fid, f1.output.next_step, -7, -21, "open");
    mkReport(v1, true, -21);
    // the next, already-planned follow-up visit that will review C1
    mkVisit({ key: "v2", school: 0, teacher: "T-101", days: 2, grade: 2, subject: "Hindi", language: "hi", status: "planned", purpose: "Follow-up on a previous coaching commitment", prev: c1, prep: "Check whether the three questions after read-aloud were tried." });

    // ---- S2 Ganga Ghat: a commitment reviewed at a later visit, then a new one -----------------------
    const v3 = mkVisit({ key: "v3", school: 1, teacher: "T-102", days: -35, grade: 3, subject: "Mathematics", language: "en", status: "completed", purpose: "FLN practice observation" });
    mkObs(v3, ASHA, {
      practice_observed: "The teacher demonstrated two-digit addition on the board and learners copied the steps.",
      evidence: "Three worked examples were solved on the board and learners copied them. When answers were asked, only the final answer was collected; nobody was asked how they found it.",
      worked_well: "The teacher used a clear worked example and checked learners' notebooks.",
      improvement_area: "Learners were not asked to explain how they got their answers.",
      tags: [{ code: "NM-02", confirmed: true }],
    }, -35);
    const f3 = mkFeedback(v3, "approved", -35);
    const c2 = mkCommitment(v3, f3.fid, f3.output.next_step, -21, -35, "open"); // updated to reviewed below
    mkReport(v3, true, -35);
    const v4 = mkVisit({ key: "v4", school: 1, teacher: "T-102", days: -10, grade: 3, subject: "Mathematics", language: "en", status: "pending_review", purpose: "Follow-up on a previous coaching commitment", prev: c2 });
    mkObs(v4, ASHA, {
      practice_observed: "The teacher asked questions and called on the first learner who raised a hand.",
      evidence: "Most questions were answered by the same three learners who raised a hand; the teacher moved on quickly after the first correct answer, without a pause.",
      worked_well: "The teacher asked “how did you get that?” on two questions, which was the action agreed at the last visit.",
      improvement_area: "The teacher did not pause before taking answers, so only a few learners took part.",
      tags: [{ code: "CI-01", confirmed: true }, { code: "NM-02", confirmed: true }],
    }, -10);
    run(db, `UPDATE commitments SET status='reviewed', review_visit_id=?, review_outcome='tried_working',
               review_evidence='Asked “how did you get that?” on two questions during the visit; two learners explained different methods.',
               reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`, v4, ASHA, at(-10, 11), at(-10, 11), c2);
    const f4 = mkFeedback(v4, "approved", -10);
    mkCommitment(v4, f4.fid, f4.output.next_step, 4, -10, "open");
    mkReport(v4, false, -10);

    // ---- S3 Neem Chowk: a draft awaiting mentor approval; plus an older visit -------------------------
    const v5 = mkVisit({ key: "v5", school: 2, teacher: "T-103", days: -3, grade: 1, subject: "Hindi", language: "en", status: "pending_review", purpose: "FLN practice observation" });
    mkObs(v5, ASHA, {
      practice_observed: "The teacher wrote letters on the board and learners repeated the letter names together.",
      evidence: "Chorus repetition of letter names. No activity linked letters to their sounds or to words; learners only repeated the names.",
      worked_well: "The whole class took part enthusiastically in the chorus.",
      improvement_area: "Letter sounds and matras were not practised; learners only repeated letter names.",
      tags: [{ code: "DC-01", confirmed: true }],
    }, -3);
    mkObs(v5, ASHA, {
      practice_observed: "After the chorus, the teacher read one line from the story chart and asked learners to point to the picture.",
      evidence: "Learners pointed to the picture. No question was asked about what the story was about or why the character did something.",
      improvement_area: "No questions on the meaning of the story.",
      tags: [{ code: "RC-01", confirmed: true }],
    }, -3);
    mkFeedback(v5, "draft");
    const v12 = mkVisit({ key: "v12", school: 2, teacher: "T-109", days: -60, grade: 2, subject: "Hindi", language: "en", status: "completed", purpose: "Routine academic support visit" });
    mkObs(v12, ASHA, {
      practice_observed: "Learners read a passage aloud and then copied it into notebooks.",
      evidence: "After the read-aloud the class moved straight to copying; the teacher did not ask whether learners understood the passage.",
      worked_well: "Learners read the passage aloud with good participation.",
      improvement_area: "No questions about whether learners understood the passage.",
      tags: [{ code: "RC-01", confirmed: true }],
    }, -60);
    const f12 = mkFeedback(v12, "approved", -60);
    mkCommitment(v12, f12.fid, f12.output.next_step, -46, -60, "completed");
    mkReport(v12, true, -60);

    // ---- S4 Palash Nagar: today, in progress, no feedback yet ------------------------------------------
    const v6 = mkVisit({ key: "v6", school: 3, teacher: "T-104", days: 0, hour: 9, grade: 3, subject: "Mathematics", language: "en", status: "in_progress", purpose: "FLN practice observation" });
    mkObs(v6, ASHA, {
      practice_observed: "The teacher introduced place value using the number 47 written on the board.",
      evidence: "The teacher said “4 is in the tens place” and learners copied it. No objects or drawings were used to show what tens and ones mean.",
      worked_well: "The teacher spoke clearly and checked that learners had copied the number correctly.",
      improvement_area: "Place value was explained with digits only, not with objects.",
      tags: [{ code: "NM-03", confirmed: false }],
    }, 0);

    // ---- S5 Mango Grove: an overdue commitment and a planned follow-up --------------------------------
    const v7 = mkVisit({ key: "v7", school: 4, teacher: "T-105", days: -50, grade: 2, subject: "Mathematics", language: "en", status: "completed", purpose: "Routine academic support visit" });
    mkObs(v7, ASHA, {
      practice_observed: "Learners counted from 1 to 50 by reading a wall chart.",
      evidence: "Learners chanted the counting from the chart. No objects were used to count or compare quantities.",
      worked_well: "Learners confidently chanted the number names in order.",
      improvement_area: "No concrete objects were used for counting.",
      tags: [{ code: "NM-01", confirmed: true }],
    }, -50);
    const f7 = mkFeedback(v7, "approved", -50);
    const c4 = mkCommitment(v7, f7.fid, f7.output.next_step, -36, -50, "open");
    mkReport(v7, true, -50);
    mkVisit({ key: "v8", school: 4, teacher: "T-105", days: 9, grade: 2, subject: "Mathematics", language: "en", status: "planned", purpose: "Follow-up on a previous coaching commitment", prev: c4 });

    // ---- S6 Lotus Pond: long since the last visit ------------------------------------------------------------
    const v9 = mkVisit({ key: "v9", school: 5, teacher: "T-106", days: -75, grade: 1, subject: "Hindi", language: "en", status: "completed", purpose: "New teacher support" });
    mkObs(v9, ASHA, {
      practice_observed: "The teacher read the story aloud and then asked learners to open their books.",
      evidence: "The story was read aloud straight away. Learners were not asked to look at the pictures or guess what the story might be about beforehand.",
      worked_well: "The teacher read with expression and learners listened attentively.",
      improvement_area: "No picture talk or prediction before reading.",
      tags: [{ code: "RC-02", confirmed: true }],
    }, -75);
    const f9 = mkFeedback(v9, "approved", -75);
    mkCommitment(v9, f9.fid, f9.output.next_step, -61, -75, "open");
    mkReport(v9, true, -75);

    // ---- Block South (second mentor): proves one mentor cannot see another's records ------------------------
    const v10 = mkVisit({ key: "v10", school: 6, teacher: "T-107", mentor: RAKESH, days: -14, grade: 3, subject: "Hindi", language: "en", status: "completed", purpose: "Routine academic support visit" });
    mkObs(v10, RAKESH, {
      practice_observed: "Learners read passages aloud one by one while the others listened.",
      evidence: "Each learner read one paragraph; the other learners looked on without a role and the reading took the whole period.",
      worked_well: "Every learner got a turn to read aloud.",
      improvement_area: "Listeners had no task while one learner read.",
      tags: [{ code: "DC-02", confirmed: true }],
    }, -14);
    const f10 = mkFeedback(v10, "approved", -14);
    mkCommitment(v10, f10.fid, f10.output.next_step, 5, -14, "open");
    mkReport(v10, true, -14);
    const v11 = mkVisit({ key: "v11", school: 7, teacher: "T-108", mentor: RAKESH, days: 0, hour: 11, grade: 2, subject: "Hindi", language: "hi", status: "in_progress", purpose: "FLN practice observation" });
    mkObs(v11, RAKESH, {
      practice_observed: "The teacher read a story aloud to the class and then moved on to writing.",
      evidence: "The story was read aloud with expression, then learners copied a sentence. No questions checked whether learners understood the story.",
      worked_well: "The teacher read the story with expression and learners listened closely.",
      improvement_area: "No questions about the meaning of the story.",
      tags: [{ code: "RC-01", confirmed: true }],
    }, 0);

    void tagRows;
  });
}
