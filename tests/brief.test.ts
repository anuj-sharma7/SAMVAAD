import { describe, expect, it } from "vitest";
import { freshDb, asha, rakesh } from "./helpers";
import { listVisits, transitionVisit } from "@/lib/services/visits";
import { addObservation } from "@/lib/services/observations";
import { approveFeedback, generateFeedback } from "@/lib/services/feedback";
import { approveDemonstration, generateDemonstration } from "@/lib/services/demonstrations";
import { createCommitment } from "@/lib/services/commitments";
import { getActionSummary, getPreVisitBrief } from "@/lib/services/brief";
import { get, run } from "@/lib/db/client";
import type { AppError } from "@/lib/errors";

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as AppError).code; } return "no-error"; };

describe("pre-visit brief", () => {
  it("shows the last agreed step and one APPROVED practice card, with the reason and what to look for", () => {
    const db = freshDb();
    const me = asha(db);
    const withPrev = listVisits(db, me, {}).items.find((v) => v.status === "planned");
    expect(withPrev).toBeDefined();
    const b = getPreVisitBrief(db, me, withPrev!.id);
    expect(b.visit.id).toBe(withPrev!.id);
    expect(b.visit.school_name).toBeTruthy();
    if (b.card) {
      const row = get<{ approval_status: string }>(db, "SELECT approval_status FROM practice_cards WHERE id = ?", b.card.id)!;
      expect(row.approval_status).toBe("approved"); // never a draft or rejected card
      expect(b.card.look_for.length).toBeGreaterThan(0);
      expect(b.insufficient_evidence).toBe(false);
    } else {
      expect(b.insufficient_evidence).toBe(true);
    }
    // no scores, rankings or public statistics leak into a brief
    expect(JSON.stringify(b)).not.toMatch(/score|rank|rating|aser|udise/i);
  });

  it("says 'insufficient evidence' instead of inventing a card when nothing approved matches", () => {
    const db = freshDb();
    const me = asha(db);
    const v = listVisits(db, me, {}).items.find((x) => x.status === "planned")!;
    run(db, "UPDATE practice_cards SET approval_status = 'draft'"); // nothing approved
    const b = getPreVisitBrief(db, me, v.id);
    expect(b.card).toBeNull();
    expect(b.insufficient_evidence).toBe(true);
  });

  it("another mentor cannot read it (404, no existence leak)", () => {
    const db = freshDb();
    const v = listVisits(db, asha(db), {}).items[0];
    expect(code(() => getPreVisitBrief(db, rakesh(db), v.id))).toBe("not_found");
  });
});

describe("teacher-facing action summary", () => {
  it("is refused until feedback is approved and a next step is agreed, then restates exactly what was agreed", async () => {
    const db = freshDb();
    const me = asha(db);
    const v = listVisits(db, me, { status: "planned" }).items.find((x) => x.subject === "Hindi")!;
    transitionVisit(db, me, v.id, "in_progress");
    expect(code(() => getActionSummary(db, me, v.id))).toBe("feedback_not_approved");

    addObservation(db, me, v.id, {
      practice_observed: "Learners read the story aloud in pairs.", evidence: "Few questions checked whether learners understood the story.",
      improvement_area: "Few questions on the meaning of the story.",
    });
    const fb = await generateFeedback(db, me, v.id, { language: "en" });
    approveFeedback(db, me, fb.id);
    expect(code(() => getActionSummary(db, me, v.id))).toBe("commitment_missing");

    const target = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    createCommitment(db, me, { visit_id: v.id, action_text: "Ask three questions after each read-aloud", target_date: target, expected_evidence: "Three questions asked after reading" });
    const demo = await generateDemonstration(db, me, v.id, {});
    approveDemonstration(db, me, demo.id);

    const s = getActionSummary(db, me, v.id);
    expect(s.next_step).toBe("Ask three questions after each read-aloud");
    expect(s.review_on).toBe(target);
    expect(s.look_for_next_time).toBe("Three questions asked after reading");
    expect(s.how_to_try.length).toBeGreaterThan(0);
    expect(s.approved_by_mentor.name).toMatch(/Asha/);
    expect(s.simulated_draft).toBe(true); // the demo provider drafted it, and the summary says so
    expect(JSON.stringify(s)).not.toMatch(/score|rank|rating|weak|poor/i);
    expect(code(() => getActionSummary(db, rakesh(db), v.id))).toBe("not_found");
  });
});
