import { describe, expect, it } from "vitest";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { createSession } from "@/lib/auth/session";
import { all, get, run } from "@/lib/db/client";
import { freshDb, asha, rakesh, meena, ishaan } from "./helpers";
import { buildSnapshot, pushOperations, type SyncOp } from "@/lib/services/sync";
import { getAuthorizedVisit } from "@/lib/services/access";
import type { AppError } from "@/lib/errors";

type Db = ReturnType<typeof freshDb>;
const uuid = () => crypto.randomUUID();
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as Error).name === "ZodError" ? "validation_failed" : (e as AppError).code; } return "no-error"; };

function schoolOf(db: Db, mentor = "demo-mentor-asha") {
  return get<{ school_id: string }>(db, "SELECT school_id FROM school_assignments WHERE profile_id = ? AND status = 'active' LIMIT 1", mentor)!.school_id;
}
const when = () => new Date(Date.now() + 2 * 86_400_000).toISOString();
const op = (o: Partial<SyncOp> & Pick<SyncOp, "entity_type" | "entity_id" | "op">): SyncOp =>
  ({ op_id: uuid(), payload: {}, created_at: new Date().toISOString(), schema_version: 1, ...o }) as SyncOp;

function visitOps(db: Db, visitId = uuid()) {
  return [
    op({ entity_type: "visit", entity_id: visitId, op: "create", payload: { school_id: schoolOf(db), teacher_alias: "T-777", scheduled_at: when(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit" } }),
    op({ entity_type: "visit", entity_id: visitId, op: "transition", payload: { to: "in_progress" } }),
  ];
}
const count = (db: Db, table: string) => get<{ n: number }>(db, `SELECT count(*) AS n FROM ${table}`)!.n;

describe("pushing offline work to the server", () => {
  it("applies a visit, its observation and a mentor-agreed commitment under the client's own ids", () => {
    const db = freshDb();
    const me = asha(db);
    const visitId = uuid(), obsId = uuid(), comId = uuid();
    const ops = [
      ...visitOps(db, visitId),
      op({ entity_type: "observation", entity_id: obsId, op: "create", payload: { visit_id: visitId, practice_observed: "Pairs read aloud.", evidence: "Learners took turns reading." } }),
      op({ entity_type: "commitment", entity_id: comId, op: "create", payload: { visit_id: visitId, action_text: "Ask three questions after each read-aloud", target_date: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10), expected_evidence: "Questions asked" } }),
    ];
    const { results } = pushOperations(db, me, { account_id: me.id, ops });
    expect(results.map((r) => r.status)).toEqual(["applied", "applied", "applied", "applied"]);
    expect(results.every((r) => r.server_version)).toBe(true);
    expect(get(db, "SELECT id FROM visits WHERE id = ?", visitId)).toBeTruthy();
    expect(get<{ status: string }>(db, "SELECT status FROM visits WHERE id = ?", visitId)!.status).toBe("in_progress");
    expect(get(db, "SELECT id FROM observations WHERE id = ?", obsId)).toBeTruthy();
    const com = get<{ feedback_id: string | null }>(db, "SELECT feedback_id FROM commitments WHERE id = ?", comId)!;
    expect(com.feedback_id).toBeNull();
    // the server audit trail records that this agreement was made by the mentor without AI feedback, and the sync itself (counts only)
    const audits = all<{ action: string; metadata: string }>(db, "SELECT action, metadata FROM audit_logs ORDER BY id DESC LIMIT 20");
    expect(audits.some((a) => a.action === "commitment.created" && /mentor_agreed_without_feedback/.test(a.metadata))).toBe(true);
    expect(audits.find((a) => a.action === "sync.pushed")!.metadata).not.toMatch(/Pairs read aloud|Learners took turns/);
  });

  it("is idempotent: re-sending the same batch (a retry after a timeout) creates nothing new", () => {
    const db = freshDb();
    const me = asha(db);
    const visitId = uuid();
    const ops = [...visitOps(db, visitId), op({ entity_type: "observation", entity_id: uuid(), op: "create", payload: { visit_id: visitId, practice_observed: "Counting with sticks.", evidence: "Groups of ten were made." } })];
    pushOperations(db, me, { account_id: me.id, ops });
    const before = { visits: count(db, "visits"), obs: count(db, "observations"), ops: count(db, "sync_operations") };
    for (let i = 0; i < 3; i++) {
      const r = pushOperations(db, me, { account_id: me.id, ops });
      expect(r.results.every((x) => x.status === "duplicate")).toBe(true);
    }
    expect({ visits: count(db, "visits"), obs: count(db, "observations"), ops: count(db, "sync_operations") }).toEqual(before);
  });

  it("a duplicate op_id inside one batch is applied once", () => {
    const db = freshDb();
    const me = asha(db);
    const [create] = visitOps(db);
    const before = count(db, "visits");
    const { results } = pushOperations(db, me, { account_id: me.id, ops: [create, create] });
    expect(results.map((r) => r.status)).toEqual(["applied", "duplicate"]);
    expect(count(db, "visits")).toBe(before + 1);
  });

  it("rejects an invalid change with a code, remembers the answer, and skips later changes on the same visit (partial sync is safe)", () => {
    const db = freshDb();
    const me = asha(db);
    const badVisit = uuid(), goodVisit = uuid();
    const bad = op({ entity_type: "visit", entity_id: badVisit, op: "create", payload: { school_id: schoolOf(db), teacher_alias: "<img src=x>", scheduled_at: when(), grade: 2, subject: "Hindi", purpose: "Routine academic support visit" } });
    const dependent = op({ entity_type: "observation", entity_id: uuid(), op: "create", payload: { visit_id: badVisit, practice_observed: "abc", evidence: "def" } });
    const good = visitOps(db, goodVisit);
    const { results } = pushOperations(db, me, { account_id: me.id, ops: [bad, dependent, ...good] });
    expect(results.map((r) => r.status)).toEqual(["rejected", "skipped", "applied", "applied"]);
    expect(results[0].code).toBe("validation_failed");
    expect(get(db, "SELECT id FROM visits WHERE id = ?", badVisit)).toBeUndefined();
    expect(get(db, "SELECT id FROM visits WHERE id = ?", goodVisit)).toBeTruthy(); // one failed record did not block the others
    // retrying the rejected op returns the same answer without re-running it
    expect(pushOperations(db, me, { account_id: me.id, ops: [bad] }).results[0].status).toBe("rejected");
  });

  it("returns the server copy and changes nothing when the record changed on the server (conflict)", () => {
    const db = freshDb();
    const me = asha(db);
    const visitId = uuid(), obsId = uuid();
    pushOperations(db, me, { account_id: me.id, ops: [...visitOps(db, visitId), op({ entity_type: "observation", entity_id: obsId, op: "create", payload: { visit_id: visitId, practice_observed: "Original text", evidence: "Original evidence" } })] });
    const v1 = get<{ updated_at: string }>(db, "SELECT updated_at FROM observations WHERE id = ?", obsId)!.updated_at;
    // another device edits the same observation first
    run(db, "UPDATE observations SET evidence = 'Edited on the other device', updated_at = ? WHERE id = ?", new Date(Date.now() + 5000).toISOString(), obsId);
    const { results } = pushOperations(db, me, { account_id: me.id, ops: [op({ entity_type: "observation", entity_id: obsId, op: "update", payload: { evidence: "My offline edit" }, expected_updated_at: v1 })] });
    expect(results[0].status).toBe("conflict");
    expect((results[0].server_record as { evidence: string }).evidence).toBe("Edited on the other device");
    expect(get<{ evidence: string }>(db, "SELECT evidence FROM observations WHERE id = ?", obsId)!.evidence).toBe("Edited on the other device");
    // a conflict is NOT remembered as final: after the user resolves it, a new op with the fresh version applies
    const fresh = String(results[0].server_version);
    const again = pushOperations(db, me, { account_id: me.id, ops: [op({ entity_type: "observation", entity_id: obsId, op: "update", payload: { evidence: "My offline edit" }, expected_updated_at: fresh })] });
    expect(again.results[0].status).toBe("applied");
  });

  it("refuses a queue that belongs to a different account, and replaying another account's op id", () => {
    const db = freshDb();
    const a = asha(db), r = rakesh(db);
    expect(code(() => pushOperations(db, r, { account_id: a.id, ops: visitOps(db) }))).toBe("forbidden");
    const ops = visitOps(db);
    pushOperations(db, a, { account_id: a.id, ops });
    const stolen = pushOperations(db, r, { account_id: r.id, ops: [{ ...ops[0], entity_id: uuid() }] });
    expect(stolen.results[0].status).toBe("rejected");
    expect(stolen.results[0].code).toBe("forbidden");
  });

  it("cannot be used to touch another mentor's visit or an unassigned school, and an id cannot be taken over", () => {
    const db = freshDb();
    const a = asha(db), r = rakesh(db);
    const visitId = uuid();
    pushOperations(db, a, { account_id: a.id, ops: visitOps(db, visitId) });
    const takeover = pushOperations(db, r, { account_id: r.id, ops: [op({ entity_type: "visit", entity_id: visitId, op: "transition", payload: { to: "pending_review" } })] });
    expect(takeover.results[0].status).toBe("rejected");
    expect(getAuthorizedVisit(db, a, visitId, "write").status).toBe("in_progress");
    const collide = pushOperations(db, r, { account_id: r.id, ops: [op({ entity_type: "visit", entity_id: visitId, op: "create", payload: { school_id: schoolOf(db, "demo-mentor-rakesh"), teacher_alias: "T-1", scheduled_at: when(), grade: 2, subject: "Hindi", purpose: "Routine academic support visit" } })] });
    expect(collide.results[0].status).toBe("rejected");
    const unassigned = pushOperations(db, a, { account_id: a.id, ops: [op({ entity_type: "visit", entity_id: uuid(), op: "create", payload: { school_id: schoolOf(db, "demo-mentor-rakesh"), teacher_alias: "T-2", scheduled_at: when(), grade: 2, subject: "Hindi", purpose: "Routine academic support visit" } })] });
    expect(unassigned.results[0].status).toBe("rejected");
  });

  it("validates the envelope: UUID ids, at most 25 operations, mentors only", () => {
    const db = freshDb();
    const me = asha(db);
    expect(code(() => pushOperations(db, me, { account_id: me.id, ops: [] }))).toBe("validation_failed");
    expect(code(() => pushOperations(db, me, { account_id: me.id, ops: Array.from({ length: 26 }, () => visitOps(db)[0]) }))).toBe("validation_failed");
    expect(code(() => pushOperations(db, me, { account_id: me.id, ops: [{ ...visitOps(db)[0], entity_id: "not-a-uuid" }] }))).toBe("validation_failed");
    expect(code(() => pushOperations(db, meena(db), { account_id: "demo-supervisor-meena", ops: visitOps(db) }))).toBe("forbidden");
    expect(code(() => pushOperations(db, ishaan(db), { account_id: "demo-curator-ishaan", ops: visitOps(db) }))).toBe("forbidden");
    expect(code(() => buildSnapshot(db, meena(db)))).toBe("forbidden");
  });
});

describe("snapshot for offline use", () => {
  it("contains only this mentor's schools, visits, observations and commitments, plus approved cards", () => {
    const db = freshDb();
    const s = buildSnapshot(db, asha(db));
    expect(s.account.id).toBe("demo-mentor-asha");
    expect(s.schools.length).toBeGreaterThan(0);
    const mine = new Set(s.schools.map((x) => x.id));
    expect(s.visits.every((v) => mine.has(v.school_id as string))).toBe(true);
    const visitIds = new Set(s.visits.map((v) => v.id));
    expect(s.observations.every((o) => visitIds.has(o.visit_id))).toBe(true);
    expect(s.commitments.every((c) => visitIds.has(c.visit_id))).toBe(true);
    expect(s.cards.length).toBeGreaterThan(0);
    const other = buildSnapshot(db, rakesh(db));
    expect(other.visits.some((v) => visitIds.has(v.id))).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/mentor_id|created_by|approved_by|score|rank/i);
    // draft / rejected cards never leave the server
    run(db, "UPDATE practice_cards SET approval_status = 'draft'");
    expect(buildSnapshot(db, asha(db)).cards).toHaveLength(0);
  });
});

describe("HTTP endpoints", () => {
  const base = "http://localhost:3000/api/v1";
  async function call(db: Db, persona: string | null, method: string, path: string, body?: object) {
    const headers: Record<string, string> = { host: "localhost:3000" };
    if (persona) headers.cookie = `samvaad_session=${createSession(db, persona).token}`;
    if (body) headers["content-type"] = "application/json";
    const res = await dispatch(new Request(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), path, db);
    return { status: res.status, json: (await res.json()) as { data?: { results?: { status: string }[]; visits?: unknown[] }; error?: { code: string } } };
  }

  it("push and snapshot require a session and the right role; push is idempotent over HTTP", async () => {
    const db = freshDb();
    expect((await call(db, null, "POST", "/sync/push", { account_id: "x", ops: [] })).status).toBe(401);
    expect((await call(db, null, "GET", "/sync/snapshot")).status).toBe(401);
    expect((await call(db, "demo-supervisor-meena", "GET", "/sync/snapshot")).status).toBe(403);
    const ops = visitOps(db);
    const first = await call(db, "demo-mentor-asha", "POST", "/sync/push", { account_id: "demo-mentor-asha", ops });
    expect(first.status).toBe(200);
    expect(first.json.data!.results!.map((r) => r.status)).toEqual(["applied", "applied"]);
    const second = await call(db, "demo-mentor-asha", "POST", "/sync/push", { account_id: "demo-mentor-asha", ops });
    expect(second.json.data!.results!.map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
    const wrongAccount = await call(db, "demo-mentor-asha", "POST", "/sync/push", { account_id: "demo-mentor-rakesh", ops: visitOps(db) });
    expect(wrongAccount.status).toBe(403);
    const snap = await call(db, "demo-mentor-asha", "GET", "/sync/snapshot");
    expect(snap.status).toBe(200);
    expect((snap.json.data!.visits as { id: string }[]).some((v) => v.id === ops[0].entity_id)).toBe(true);
  });
});
