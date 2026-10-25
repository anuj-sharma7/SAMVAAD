import { describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { all, get } from "@/lib/db/client";

describe("schema + seed", () => {
  it("applies migrations and seeds coherent fictional data", () => {
    const db = freshDb();
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM schools")!.n).toBeGreaterThanOrEqual(6);
    const visits = get<{ n: number }>(db, "SELECT count(*) AS n FROM visits")!.n;
    expect(visits).toBeGreaterThanOrEqual(8);
    expect(visits).toBeLessThanOrEqual(12);
    // every seeded record is flagged as demo
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM schools WHERE is_demo = 0")!.n).toBe(0);
    // no student/child table exists
    const tables = all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type='table'").map((t) => t.name);
    expect(tables.some((t) => /student|child|pupil/i.test(t))).toBe(false);
  });

  it("flagship visit gets R-14 with a valid citation", () => {
    const db = freshDb();
    const row = get<{ practice_card_id: string }>(
      db,
      `SELECT c.practice_card_id FROM feedback_citations c JOIN feedback_drafts f ON f.id = c.feedback_id
         JOIN visits v ON v.id = f.visit_id WHERE v.teacher_alias = 'T-101' AND v.status = 'completed' AND c.is_primary = 1`,
    );
    expect(row?.practice_card_id).toBe("R-14");
  });

  it("audit log is append-only", () => {
    const db = freshDb();
    db.prepare("INSERT INTO audit_logs (at, action, resource_type) VALUES ('t','x','y')").run();
    expect(() => db.prepare("UPDATE audit_logs SET action='z'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_logs").run()).toThrow(/append-only/);
  });

  it("database rejects impossible state combinations", () => {
    const db = freshDb();
    const fb = get<{ id: string }>(db, "SELECT id FROM feedback_drafts WHERE status='draft' LIMIT 1")!;
    expect(() => db.prepare("UPDATE feedback_drafts SET status='approved' WHERE id=?").run(fb.id)).toThrow();
  });
});
