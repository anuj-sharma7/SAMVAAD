import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { createSession } from "@/lib/auth/session";
import { all, get, openDatabase } from "@/lib/db/client";
import { seedDemoData } from "@/lib/db/seed";
import { freshDb, asha } from "./helpers";
import { listVisits, createVisit, transitionVisit, getVisitDetail } from "@/lib/services/visits";
import { addObservation, listObservations, updateObservation } from "@/lib/services/observations";
import { approveFeedback, editFeedback, generateFeedback } from "@/lib/services/feedback";
import { editReport, generateReport } from "@/lib/services/reports";
import { editDemonstration, generateDemonstration } from "@/lib/services/demonstrations";
import { createCommitment } from "@/lib/services/commitments";
import type { AppError } from "@/lib/errors";

const base = "http://localhost:3000/api/v1";
beforeEach(() => resetRateLimits());

const codeOf = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return (e as AppError).code ?? (e as Error).message; }
  return "no-error";
};

function start(db: ReturnType<typeof freshDb>) {
  const me = asha(db);
  const v = listVisits(db, me, { status: "in_progress" }).items[0];
  return { me, id: v.id };
}

describe("stale edits are refused instead of overwriting newer work", () => {
  it("observations", () => {
    const db = freshDb();
    const { me, id } = start(db);
    const o = addObservation(db, me, id, { practice_observed: "Pairs read aloud.", evidence: "Turns were taken." });
    const first = updateObservation(db, me, o.id, { evidence: "Tab A edit of the evidence", expected_updated_at: o.updated_at });
    expect(first.evidence).toBe("Tab A edit of the evidence");
    // tab B still holds the original version
    expect(codeOf(() => updateObservation(db, me, o.id, { evidence: "Tab B overwrite", expected_updated_at: o.updated_at }))).toBe("stale_edit");
    expect(listObservations(db, me, id).find((x) => x.id === o.id)!.evidence).toBe("Tab A edit of the evidence");
    // without the token the API stays backward compatible
    expect(updateObservation(db, me, o.id, { evidence: "No token supplied" }).evidence).toBe("No token supplied");
  });

  it("feedback, demonstration and report summary", async () => {
    const db = freshDb();
    const { me, id } = start(db);
    const fb = await generateFeedback(db, me, id, { language: "en" });
    editFeedback(db, me, fb.id, { next_step: "Tab A next step edit", expected_updated_at: fb.updated_at });
    expect(codeOf(() => editFeedback(db, me, fb.id, { next_step: "Tab B overwrite", expected_updated_at: fb.updated_at }))).toBe("stale_edit");
    const current = get<{ next_step: string; updated_at: string }>(db, "SELECT next_step, updated_at FROM feedback_drafts WHERE id = ?", fb.id)!;
    expect(current.next_step).toBe("Tab A next step edit");
    approveFeedback(db, me, fb.id);

    const demo = await generateDemonstration(db, me, id, {});
    editDemonstration(db, me, demo.id, { objective: "Tab A objective text", expected_updated_at: demo.updated_at });
    expect(codeOf(() => editDemonstration(db, me, demo.id, { objective: "Tab B objective text", expected_updated_at: demo.updated_at }))).toBe("stale_edit");

    const rep = generateReport(db, me, id);
    editReport(db, me, id, { mentor_summary: "Tab A summary of the visit.", expected_updated_at: rep.updated_at });
    expect(codeOf(() => editReport(db, me, id, { mentor_summary: "Tab B summary of the visit.", expected_updated_at: rep.updated_at }))).toBe("stale_edit");
  });
});

describe("duplicate submissions", () => {
  async function post(db: ReturnType<typeof freshDb>, p: string, body: object, key?: string) {
    const res = await dispatch(
      new Request(base + p, { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", cookie: `samvaad_session=${createSession(db, "demo-mentor-asha").token}`, ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body) }),
      p, db,
    );
    return { status: res.status, json: (await res.json()) as { data?: { id: string } } };
  }

  it("rapid repeated visit creation with one Idempotency-Key creates exactly one visit", async () => {
    const db = freshDb();
    const school = get<{ school_id: string }>(db, "SELECT school_id FROM school_assignments WHERE profile_id = 'demo-mentor-asha' LIMIT 1")!;
    const body = { school_id: school.school_id, teacher_alias: "T-555", scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit", save_as: "planned" };
    const before = get<{ n: number }>(db, "SELECT count(*) AS n FROM visits")!.n;
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => post(db, "/visits", body, "form-key-1")));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.json.data!.id)).size).toBe(1);
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM visits")!.n).toBe(before + 1);
  });

  it("the same applies to observations; a different key is a genuinely new record", async () => {
    const db = freshDb();
    const { id } = start(db);
    const body = { practice_observed: "Learners worked in pairs.", evidence: "Pairs compared answers." };
    const n0 = get<{ n: number }>(db, "SELECT count(*) AS n FROM observations WHERE visit_id = ?", id)!.n;
    await post(db, `/visits/${id}/observations`, body, "obs-1");
    await post(db, `/visits/${id}/observations`, body, "obs-1");
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM observations WHERE visit_id = ?", id)!.n).toBe(n0 + 1);
    await post(db, `/visits/${id}/observations`, body, "obs-2");
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM observations WHERE visit_id = ?", id)!.n).toBe(n0 + 2);
  });

  it("an idempotency key from one user cannot replay another user's result", async () => {
    const db = freshDb();
    const school = get<{ school_id: string }>(db, "SELECT school_id FROM school_assignments WHERE profile_id = 'demo-mentor-asha' LIMIT 1")!;
    const body = { school_id: school.school_id, teacher_alias: "T-556", scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), grade: 2, subject: "Hindi", purpose: "Routine academic support visit" };
    const mine = await post(db, "/visits", body, "shared-key");
    const res = await dispatch(
      new Request(base + "/visits", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", cookie: `samvaad_session=${createSession(db, "demo-mentor-rakesh").token}`, "idempotency-key": "shared-key" }, body: JSON.stringify(body) }),
      "/visits", db,
    );
    expect(res.status).toBe(403); // Rakesh runs the real check; he is not assigned to Asha's school
    expect(mine.status).toBe(201);
  });

  it("services also guard against double creation at the database level (one live feedback card, one commitment per card)", async () => {
    const db = freshDb();
    const { me, id } = start(db);
    const a = await generateFeedback(db, me, id, {});
    const b = await generateFeedback(db, me, id, {});
    expect(all(db, "SELECT id FROM feedback_drafts WHERE visit_id = ? AND status IN ('draft','edited','approved','insufficient_evidence')", id)).toHaveLength(1);
    expect(a.id).not.toBe(b.id);
    approveFeedback(db, me, b.id);
    const target = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const input = { visit_id: id, action_text: "Ask three questions", target_date: target, expected_evidence: "Questions asked" };
    createCommitment(db, me, input);
    expect(codeOf(() => createCommitment(db, me, input))).toBe("commitment_exists");
    expect(getVisitDetail(db, me, id).visit.id).toBe(id);
  });
});

describe("persistence and migrations on a disposable file database", () => {
  it("records survive closing and reopening the database; migrations are re-runnable and seeds are idempotent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-persist-"));
    const file = path.join(dir, "p.db");
    const db1 = openDatabase(file);
    seedDemoData(db1);
    const me = asha(db1);
    const school = get<{ school_id: string }>(db1, "SELECT school_id FROM school_assignments WHERE profile_id = ? LIMIT 1", me.id)!;
    const v = createVisit(db1, me, { school_id: school.school_id, teacher_alias: "T-901", scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(), grade: 3, subject: "Mathematics", purpose: "Routine academic support visit", save_as: "planned" });
    transitionVisit(db1, me, v.id, "in_progress");
    addObservation(db1, me, v.id, { practice_observed: "Counted with sticks.", evidence: "Groups of ten were made." });
    const counts1 = { visits: get<{ n: number }>(db1, "SELECT count(*) AS n FROM visits")!.n, audit: get<{ n: number }>(db1, "SELECT count(*) AS n FROM audit_logs")!.n };
    db1.close();

    const db2 = openDatabase(file); // reopening re-runs the migration runner: nothing must be re-applied
    expect(all(db2, "SELECT id FROM schema_migrations").length).toBe(6);
    expect(get<{ n: number }>(db2, "SELECT count(*) AS n FROM visits")!.n).toBe(counts1.visits);
    const reopened = getVisitDetail(db2, asha(db2), v.id);
    expect(reopened.visit.teacher_alias).toBe("T-901");
    expect(reopened.visit.status).toBe("in_progress");
    expect(listObservations(db2, asha(db2), v.id)).toHaveLength(1);
    expect(get<{ n: number }>(db2, "SELECT count(*) AS n FROM audit_logs")!.n).toBe(counts1.audit);
    db2.close();
  });

  it("foreign keys are enforced and a constraint violation inside a transaction leaves no partial writes", () => {
    const db = freshDb();
    const before = get<{ n: number }>(db, "SELECT count(*) AS n FROM observations")!.n;
    expect(() => db.prepare("INSERT INTO observations (id, visit_id, practice_observed, evidence, created_by, created_at, updated_at) VALUES ('x','no-such-visit','abc','def','demo-mentor-asha','t','t')").run()).toThrow();
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM observations")!.n).toBe(before);
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE visits SET grade = 3 WHERE id = (SELECT id FROM visits LIMIT 1)").run();
      db.prepare("UPDATE visits SET grade = 99").run(); // violates CHECK (grade BETWEEN 1 AND 8)
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
    }
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM visits WHERE grade = 99")!.n).toBe(0);
  });
});
