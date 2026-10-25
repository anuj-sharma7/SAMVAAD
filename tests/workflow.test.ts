import { describe, expect, it } from "vitest";
import { all, get } from "@/lib/db/client";
import { asha, freshDb } from "./helpers";
import { addObservation, decideTags } from "@/lib/services/observations";
import { transitionVisit, getVisitDetail, visitProgress, listVisits, createVisit } from "@/lib/services/visits";
import { approveFeedback, editFeedback, generateFeedback } from "@/lib/services/feedback";
import { approveDemonstration, generateDemonstration } from "@/lib/services/demonstrations";
import { createCommitment, reviewCommitment, suggestCommitment, listCommitments } from "@/lib/services/commitments";
import { editReport, finalizeReport, generateReport } from "@/lib/services/reports";
import { getMentorDashboard } from "@/lib/services/dashboard";
import { listAudit } from "@/lib/services/audit";

describe("complete mentor workflow (create visit → report), demo provider", () => {
  it("runs end to end and carries the previous commitment into the follow-up visit", async () => {
    const db = freshDb();
    const me = asha(db);
    const before = getMentorDashboard(db, me);

    // The planned follow-up visit at Kesar Vihar already links the earlier, overdue commitment.
    const planned = listVisits(db, me, { status: "planned" }).items.find((v) => v.teacher_alias === "T-101")!;
    const detail = getVisitDetail(db, me, planned.id);
    expect(detail.previousCommitment?.status).toBe("open");
    expect(detail.previousCommitment?.action_text).toMatch(/.+/);

    transitionVisit(db, me, planned.id, "in_progress");

    // follow up: record what happened to the earlier commitment
    const earlier = listCommitments(db, me, { bucket: "overdue" }).find((c) => c.id === detail.previousCommitment!.id)!;
    expect(earlier.display_status).toBe("overdue");
    const reviewed = reviewCommitment(db, me, earlier.id, {
      review_visit_id: planned.id, outcome: "tried_needs_support",
      evidence: "Asked two why-questions after one story.", barriers: "Unsure what to ask for longer texts.",
    });
    expect(reviewed.status).toBe("reviewed");

    // observe
    const obs = addObservation(db, me, planned.id, {
      practice_observed: "Learners read the story aloud in pairs.",
      evidence: "Pairs took turns reading; few questions checked whether learners understood the story.",
      worked_well: "Learners read the story aloud in pairs and stayed engaged.",
      improvement_area: "Few questions were asked about the meaning of the story.",
    });
    expect(obs.tags.some((t) => t.code === "RC-01" && !t.confirmed)).toBe(true); // suggested, not confirmed
    const tags = decideTags(db, me, obs.id, { confirm: ["RC-01"] });
    expect(tags.find((t) => t.code === "RC-01")?.confirmed).toBe(true);

    // coach: grounded feedback with the real card
    const draft = await generateFeedback(db, me, planned.id, {});
    expect(draft.status).toBe("draft");
    expect(draft.is_simulated).toBe(true);
    expect(draft.provider).toBe("demo");
    expect(draft.citations[0].practice_card_id).toBe("R-14");
    expect(draft.citations[0].source_title).toMatch(/Illustrative/);
    expect(draft.retrieval_trace.candidates?.[0].card_id).toBe("R-14");

    // mentor must act: edit, then approve
    const edited = editFeedback(db, me, draft.id, { next_step: "Ask three why or what-next questions after each read-aloud this week." });
    expect(edited.status).toBe("edited");
    expect(edited.mentor_edited).toBe(true);
    const approved = approveFeedback(db, me, draft.id);
    expect(approved.status).toBe("approved");
    expect(approved.approved_by).toBe(me.id);

    // demonstrate
    const demo = await generateDemonstration(db, me, planned.id, {});
    expect(demo.practice_card_id).toBe("R-14");
    expect(demo.is_simulated).toBe(true);
    expect(demo.steps.length).toBeGreaterThanOrEqual(2);
    expect(approveDemonstration(db, me, demo.id).status).toBe("approved");

    // follow up: commitment suggested from approved feedback, then agreed
    const s = suggestCommitment(db, me, planned.id);
    expect(s.action_text).toBe(approved.next_step);
    const c = createCommitment(db, me, { visit_id: planned.id, action_text: s.action_text, target_date: s.target_date, expected_evidence: s.expected_evidence });
    expect(c.display_status).not.toBe("completed");

    // report: generated from stored records, reviewed, finalized
    const rep = generateReport(db, me, planned.id);
    expect(rep.snapshot.feedback?.provenance).toBe("ai_drafted_mentor_edited_approved");
    expect(rep.snapshot.previous_commitment_review?.outcome).toBe("tried_needs_support");
    expect(rep.snapshot.commitment?.action_text).toBe(approved.next_step);
    editReport(db, me, planned.id, { mentor_summary: "Good read-aloud routine; agreed to add three meaning questions." });
    const final = finalizeReport(db, me, planned.id);
    expect(final.status).toBe("finalized");
    expect(get<{ status: string }>(db, "SELECT status FROM visits WHERE id=?", planned.id)?.status).toBe("completed");
    expect(visitProgress(db, get(db, "SELECT * FROM visits WHERE id=?", planned.id)!).done).toMatchObject({
      observe: true, coach: true, demonstrate: true, follow_up: true,
    });

    // dashboard reflects the work
    const after = getMentorDashboard(db, me);
    expect(after.counts.visits_completed).toBe(before.counts.visits_completed + 1);

    // audit trail captured the important events, without the mentor's free text
    const actions = listAudit(db, me, { limit: 200 }).map((a) => a.action);
    for (const a of ["feedback.generated", "feedback.edited", "feedback.approved", "demonstration.approved", "commitment.reviewed", "commitment.created", "report.finalized"]) {
      expect(actions).toContain(a);
    }
    const dump = JSON.stringify(all(db, "SELECT metadata FROM audit_logs"));
    expect(dump).not.toContain("three why or what-next");
  });

  it("creating a visit then reopening it preserves the data", () => {
    const db = freshDb();
    const me = asha(db);
    const school = get<{ school_id: string }>(db, "SELECT school_id FROM school_assignments WHERE profile_id = ? LIMIT 1", me.id)!;
    const v = createVisit(db, me, {
      school_id: school.school_id, teacher_alias: "T-777", scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit", save_as: "planned",
    });
    const again = getVisitDetail(db, me, v.id);
    expect(again.visit.teacher_alias).toBe("T-777");
    expect(again.visit.status).toBe("planned");
    expect(again.visit.audio_consent).toBe("not_requested");
  });
});
