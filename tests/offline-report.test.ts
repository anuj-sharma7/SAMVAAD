import { describe, expect, it } from "vitest";
import { buildLocalReport } from "@/lib/offline/report";
import type { LocalCommitment, LocalObservation, LocalVisit, SyncMeta } from "@/lib/offline/types";

const sync = (state: SyncMeta["state"]): SyncMeta => ({ state, localUpdatedAt: "2026-01-01T00:00:00Z", serverVersion: null, confirmedAt: null });
const visit: LocalVisit = {
  id: "v1", school_id: "s1", teacher_alias: "T-101", scheduled_at: "2026-01-02T04:30:00Z", grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit",
  coaching_focus: null, prep_notes: null, previous_commitment_id: null, observation_method: "text", status: "in_progress", created_at: "2026-01-01T00:00:00Z", sync: sync("pending"), origin: "local",
};
const ob = (id: string, state: SyncMeta["state"], extra: Partial<LocalObservation> = {}): LocalObservation => ({
  id, visit_id: "v1", practice_observed: `practice ${id}`, evidence: `evidence ${id}`, worked_well: null, improvement_area: null, context_note: null, created_at: "2026-01-02T05:00:00Z", sync: sync(state), origin: "local", ...extra,
});
const commitment: LocalCommitment = {
  id: "c1", visit_id: "v1", action_text: "Try pair reading", owner_role: "teacher", owner_alias: "T-101", target_date: "2026-01-09", expected_evidence: "Pairs reading", status: "open", created_at: "2026-01-02T06:00:00Z", sync: sync("synced"), origin: "local",
};

describe("buildLocalReport", () => {
  const r = buildLocalReport(visit, { id: "s1", code: "S", name: "GPS Test", state: "X", district: "D", block: "B", cluster: null }, [ob("o1", "pending"), ob("o2", "synced"), ob("o3", "pending", { deleted: true })], commitment);

  it("labels itself as a local draft, not official, not approved, no AI", () => {
    expect(r.kind).toBe("local_draft");
    expect(r.label).toBe("Local draft: not the server report, not approved");
    expect([r.official, r.approved, r.aiUsed]).toEqual([false, false, false]);
  });

  it("includes every (non-deleted) observation and the next step", () => {
    expect(r.observations.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(r.nextStep?.action).toBe("Try pair reading");
  });

  it("marks records that were not sent to the server", () => {
    expect(r.observations.map((o) => o.sent)).toEqual([false, true]);
    expect(r.nextStep?.sent).toBe(true);
    expect(r.unsentCount).toBe(2); // visit + o1
    expect(r.records.find((x) => x.id === "v1")?.sent).toBe(false);
  });

  it("never contains scores or rankings", () => {
    const json = JSON.stringify(r).toLowerCase();
    for (const word of ["score", "rank", "rating", "grade_level", "percent"]) expect(json).not.toContain(`"${word}`);
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["score", "ranking", "rating"]));
  });

  it("works with no next step and no school", () => {
    const e = buildLocalReport(visit, undefined, [], null);
    expect(e.nextStep).toBeNull();
    expect(e.school).toBeNull();
    expect(e.observations).toEqual([]);
  });
});
