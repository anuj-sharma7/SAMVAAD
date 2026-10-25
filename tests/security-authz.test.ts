import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { createSession } from "@/lib/auth/session";
import { all } from "@/lib/db/client";
import { freshDb, asha } from "./helpers";
import { listVisits, transitionVisit } from "@/lib/services/visits";
import { addObservation } from "@/lib/services/observations";
import { approveFeedback, generateFeedback } from "@/lib/services/feedback";
import { approveDemonstration, generateDemonstration } from "@/lib/services/demonstrations";
import { createCommitment } from "@/lib/services/commitments";
import { generateReport } from "@/lib/services/reports";
import { listSchools } from "@/lib/services/schools";

const base = "http://localhost:3000/api/v1";

/** Tables an unauthorised call must never change. (audit_logs / sessions / idempotency_keys legitimately grow.) */
const GUARDED = ["visits", "observations", "observation_tags", "feedback_drafts", "feedback_citations", "demonstration_scripts", "commitments", "visit_reports", "practice_cards", "kb_chunks", "app_settings", "school_assignments", "schools"];

type Db = ReturnType<typeof freshDb>;
const snapshot = (db: Db) => JSON.stringify(GUARDED.map((t) => all(db, `SELECT * FROM ${t} ORDER BY rowid`)));

let db: Db;
let ids: { visit: string; obs: string; fb: string; demo: string; commit: string; school: string; southSchool: string };

beforeAll(async () => {
  db = freshDb();
  const me = asha(db);
  const planned = listVisits(db, me, { status: "planned" }).items.find((v) => v.subject === "Hindi")!;
  transitionVisit(db, me, planned.id, "in_progress");
  const obs = addObservation(db, me, planned.id, {
    practice_observed: "Learners read the story aloud in pairs.", evidence: "Few questions checked whether learners understood the story.",
    worked_well: "Pairs read together.", improvement_area: "Few questions on the meaning of the story.",
  });
  const fb = await generateFeedback(db, me, planned.id, { language: "en" });
  approveFeedback(db, me, fb.id);
  const demo = await generateDemonstration(db, me, planned.id, {});
  approveDemonstration(db, me, demo.id);
  const target = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const commit = createCommitment(db, me, { visit_id: planned.id, action_text: "Ask three questions after each read-aloud", target_date: target, expected_evidence: "Questions asked" });
  generateReport(db, me, planned.id);
  ids = {
    visit: planned.id, obs: obs.id, fb: fb.id, demo: demo.id, commit: commit.id, school: planned.school_id,
    southSchool: listSchools(db, { id: "demo-mentor-rakesh", role: "mentor", displayName: "x", preferredLanguage: "en", uiLanguage: null }).items[0].id,
  };
});
beforeEach(() => resetRateLimits());

async function call(persona: string | null, method: string, path: string, body?: object) {
  const headers: Record<string, string> = { host: "localhost:3000" };
  if (persona) headers.cookie = `samvaad_session=${createSession(db, persona).token}`;
  if (body) headers["content-type"] = "application/json";
  const res = await dispatch(
    new Request(base + path, { method, headers, body: body ? JSON.stringify(body).replaceAll("{{visit}}", ids.visit) : undefined }),
    path.split("?")[0], db,
  );
  return { status: res.status, text: await res.text() };
}

/** Every endpoint that takes an object id: [method, path builder, body]. */
const OBJECT_ENDPOINTS: [string, (i: typeof ids) => string, object | undefined][] = [
  ["GET", (i) => `/visits/${i.visit}`, undefined],
  ["PATCH", (i) => `/visits/${i.visit}`, { prep_notes: "tampered" }],
  ["POST", (i) => `/visits/${i.visit}/transition`, { to: "pending_review" }],
  ["GET", (i) => `/visits/${i.visit}/observations`, undefined],
  ["POST", (i) => `/visits/${i.visit}/observations`, { practice_observed: "Injected observation", evidence: "Injected evidence" }],
  ["PATCH", (i) => `/observations/${i.obs}`, { evidence: "tampered evidence" }],
  ["DELETE", (i) => `/observations/${i.obs}`, undefined],
  ["POST", (i) => `/observations/${i.obs}/tags`, { add: ["RC-01"] }],
  ["GET", (i) => `/visits/${i.visit}/feedback`, undefined],
  ["POST", (i) => `/visits/${i.visit}/feedback`, {}],
  ["PATCH", (i) => `/feedback/${i.fb}`, { next_step: "tampered next step" }],
  ["POST", (i) => `/feedback/${i.fb}/approve`, undefined],
  ["POST", (i) => `/feedback/${i.fb}/reject`, { reason: "tampered" }],
  ["GET", (i) => `/visits/${i.visit}/demonstration`, undefined],
  ["POST", (i) => `/visits/${i.visit}/demonstration`, {}],
  ["PATCH", (i) => `/demonstrations/${i.demo}`, { objective: "tampered objective text" }],
  ["POST", (i) => `/demonstrations/${i.demo}/approve`, undefined],
  ["GET", (i) => `/visits/${i.visit}/commitment-suggestion`, undefined],
  ["GET", (i) => `/visits/${i.visit}/brief`, undefined],
  ["GET", (i) => `/visits/${i.visit}/action-summary`, undefined],
  ["GET", (i) => `/commitments/${i.commit}`, undefined],
  ["PATCH", (i) => `/commitments/${i.commit}`, { status: "cancelled" }],
  ["POST", (i) => `/commitments/${i.commit}/review`, { review_visit_id: "{{visit}}", outcome: "not_tried", barriers: "x" }],
  ["POST", () => "/commitments", { visit_id: "x", action_text: "Injected action", target_date: "2026-12-01", expected_evidence: "x" }],
  ["GET", (i) => `/visits/${i.visit}/report`, undefined],
  ["POST", (i) => `/visits/${i.visit}/report`, undefined],
  ["PATCH", (i) => `/visits/${i.visit}/report`, { mentor_summary: "tampered summary of the visit" }],
  ["POST", (i) => `/visits/${i.visit}/report/finalize`, undefined],
];

describe("object-level authorization (IDOR/BOLA): every id endpoint, every other persona", () => {
  const INTRUDERS = [
    ["another mentor", "demo-mentor-rakesh"],
    ["a supervisor", "demo-supervisor-meena"],
    ["a library curator", "demo-curator-ishaan"],
    ["an anonymous caller", null],
  ] as const;

  for (const [who, persona] of INTRUDERS) {
    it(`${who} is refused on all ${OBJECT_ENDPOINTS.length} object endpoints and changes nothing`, async () => {
      const before = snapshot(db);
      for (const [method, path, body] of OBJECT_ENDPOINTS) {
        const p = path(ids);
        const r = await call(persona, method, p, body as object | undefined);
        expect([401, 403, 404, 422], `${who}: ${method} ${p.replace(ids.visit, "{visit}")} -> ${r.status}`).toContain(r.status);
        // a refusal must not disclose the record's content
        expect(r.text, `${method} ${p} leaked content`).not.toMatch(/Few questions|understood the story|T-101|Kesar Vihar|tampered/);
      }
      expect(snapshot(db)).toBe(before);
    });
  }

  it("the owner can still use the same endpoints (the matrix is not passing because everything is broken)", async () => {
    const reads = [`/visits/${ids.visit}`, `/visits/${ids.visit}/observations`, `/visits/${ids.visit}/feedback`, `/visits/${ids.visit}/demonstration`, `/visits/${ids.visit}/brief`, `/visits/${ids.visit}/action-summary`, `/commitments/${ids.commit}`, `/visits/${ids.visit}/report`];
    for (const p of reads) expect((await call("demo-mentor-asha", "GET", p)).status, p).toBe(200);
  });

  it("list endpoints only ever return the caller's own records", async () => {
    for (const path of ["/visits", "/commitments", "/reports", "/schools"]) {
      const r = await call("demo-mentor-rakesh", "GET", path);
      expect(r.status).toBe(200);
      expect(r.text, path).not.toMatch(/Kesar Vihar|Ganga Ghat|Neem Chowk|Palash Nagar|Mango Grove|Lotus Pond|T-10[1-6]/);
    }
    const csv = await call("demo-mentor-rakesh", "GET", "/reports/export");
    expect(csv.status).toBe(200);
    expect(csv.text).not.toMatch(/Kesar Vihar|T-101|T-102/);
    expect(csv.text).toMatch(/Banyan Tree|T-107/);
  });

  it("an unassigned school is invisible and cannot receive a visit", async () => {
    expect((await call("demo-mentor-asha", "GET", `/schools/${ids.southSchool}`)).status).toBe(404);
    const r = await call("demo-mentor-asha", "POST", "/visits", { school_id: ids.southSchool, teacher_alias: "T-1", scheduled_at: new Date(Date.now() + 86400000).toISOString(), grade: 2, subject: "Hindi", purpose: "Routine support visit" });
    expect(r.status).toBe(403);
  });
});

describe("function-level authorization: role-restricted operations", () => {
  const before = () => snapshot(db);
  const ADMIN_OPS: [string, string, object | undefined][] = [
    ["POST", "/practice-cards", { title: "Injected", domain: "Reading comprehension", grade_min: 1, grade_max: 2, subject: "Hindi", description: "An injected card for testing.", steps: ["step"], next_step: "do the thing now", source_org: "x org", source_title: "x title" }],
    ["PATCH", "/practice-cards/R-14", { description: "Tampered description for the card." }],
    ["POST", "/practice-cards/R-14/review", { decision: "reject", notes: "tamper" }],
    ["POST", "/knowledge/chunks/NBG-p6-readaloud/review", { decision: "approve" }],
    ["POST", "/schools", { code: "HACK-1", name: "Injected School", state: "S", district: "D", block: "B" }],
    ["PUT", "/settings/priority-rules", { overdue_commitment: 0, due_soon_commitment: 0, unreviewed_completed_action: 0, no_recent_visit: 0, no_recent_visit_days: 30, visit_scheduled_soon: 0, visit_scheduled_soon_days: 3, high_threshold: 50, medium_threshold: 25 }],
    ["GET", "/analytics/practice-gaps", undefined],
  ];

  it("mentors cannot administer the library, schools, rules, excerpts or aggregates", async () => {
    const snap = before();
    for (const [m, p, b] of ADMIN_OPS.filter(([m2, p2]) => !(m2 === "PUT" && false) && p2 !== "/schools")) {
      const r = await call("demo-mentor-asha", m, p, b);
      expect([403, 404], `${m} ${p} -> ${r.status}`).toContain(r.status);
    }
    expect((await call("demo-mentor-asha", "POST", "/schools", ADMIN_OPS.find(([, p]) => p === "/schools")![2])).status).toBe(403);
    expect(snapshot(db)).toBe(snap);
  });

  it("supervisors cannot change the library or read coaching content; curators cannot touch visits", async () => {
    const snap = before();
    for (const [m, p, b] of ADMIN_OPS.filter(([, p2]) => p2.startsWith("/practice-cards") || p2.startsWith("/knowledge"))) {
      expect([403, 404], `${m} ${p}`).toContain((await call("demo-supervisor-meena", m, p, b)).status);
    }
    expect((await call("demo-supervisor-meena", "GET", `/visits/${ids.visit}/observations`)).status).toBe(403);
    expect((await call("demo-curator-ishaan", "GET", "/visits")).status).toBe(403);
    expect((await call("demo-curator-ishaan", "POST", "/visits", { school_id: ids.school })).status).toBe(403);
    expect((await call("demo-curator-ishaan", "GET", "/commitments")).status).toBe(403);
    expect(snapshot(db)).toBe(snap);
  });

  it("a client cannot claim a role: forged role values in the body, headers or query are ignored", async () => {
    const snap = before();
    const r = await call("demo-mentor-asha", "POST", "/practice-cards?role=diet_admin", { role: "diet_admin", actor: { role: "diet_admin" }, title: "Injected", domain: "x", grade_min: 1, grade_max: 2, subject: "Hindi", description: "Injected description text", steps: ["s"], next_step: "do it now please", source_org: "o", source_title: "t" });
    expect(r.status).toBe(403);
    const withHeader = await dispatch(new Request(`${base}/practice-cards`, { method: "POST", headers: { host: "localhost:3000", cookie: `samvaad_session=${createSession(db, "demo-mentor-asha").token}`, "content-type": "application/json", "x-role": "diet_admin", "x-user-id": "demo-curator-ishaan" }, body: "{}" }), "/practice-cards", db);
    expect(withHeader.status).toBe(403);
    expect(snapshot(db)).toBe(snap);
  });

  it("mass-assignment: unexpected fields cannot set privileged columns on create/update", async () => {
    const r = await call("demo-mentor-asha", "PATCH", `/visits/${ids.visit}`, { status: "completed", mentor_id: "demo-mentor-rakesh", is_demo: 0, completed_at: "2020-01-01T00:00:00Z", prep_notes: "ok note" });
    expect([200, 409, 422]).toContain(r.status);
    const row = all<{ status: string; mentor_id: string; is_demo: number }>(db, "SELECT status, mentor_id, is_demo FROM visits WHERE id = ?", ids.visit)[0];
    expect(row.status).not.toBe("completed");
    expect(row.mentor_id).toBe("demo-mentor-asha");
    expect(row.is_demo).toBe(1);
  });
});
