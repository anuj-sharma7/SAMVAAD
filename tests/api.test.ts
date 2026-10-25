import { describe, expect, it } from "vitest";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { freshDb } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { listVisits } from "@/lib/services/visits";
import { asha } from "./helpers";

const base = "http://localhost:3000/api/v1";

function client(db: ReturnType<typeof freshDb>, persona?: string) {
  const cookie = persona ? `samvaad_session=${encodeURIComponent(createSession(db, persona).token)}` : "";
  return async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const req = new Request(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), host: "localhost:3000", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extra },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const res = await dispatch(req, path.split("?")[0], db);
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

describe("REST API /api/v1", () => {
  it("health is public and reports the AI provider honestly", async () => {
    const db = freshDb();
    const r = await client(db)("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("ok");
    expect(r.json.data.ai.simulated).toBe(true);
  });

  it("requires a session: 401 without a cookie, and forged cookies are refused", async () => {
    const db = freshDb();
    expect((await client(db)("GET", "/dashboard")).status).toBe(401);
    const forged = await dispatch(new Request(base + "/dashboard", { headers: { cookie: "samvaad_session=demo-mentor-asha.forged" } }), "/dashboard", db);
    expect(forged.status).toBe(401);
  });

  it("demo sign-in sets an HttpOnly cookie", async () => {
    const db = freshDb();
    const r = await client(db)("POST", "/session", { profile_id: "demo-mentor-asha" });
    expect(r.status).toBe(200);
    const setCookie = r.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect((await client(db)("POST", "/session", { profile_id: "nobody" })).status).toBe(404);
  });

  it("structured validation errors and unknown routes", async () => {
    const db = freshDb();
    const api = client(db, "demo-mentor-asha");
    const bad = await api("POST", "/visits", { school_id: "x", teacher_alias: "", grade: 99 });
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe("validation_failed");
    expect(Object.keys(bad.json.error.details).length).toBeGreaterThan(0);
    expect((await api("GET", "/nope")).status).toBe(404);
    expect((await api("DELETE", "/dashboard")).status).toBe(405);
  });

  it("rejects cross-origin mutations and non-JSON bodies", async () => {
    const db = freshDb();
    const api = client(db, "demo-mentor-asha");
    expect((await api("POST", "/commitments", {}, { origin: "https://evil.example" })).status).toBe(403);
    const form = await dispatch(new Request(base + "/commitments", { method: "POST", headers: { cookie: `samvaad_session=${createSession(db, "demo-mentor-asha").token}`, "content-type": "text/plain" }, body: "x=1" }), "/commitments", db);
    expect(form.status).toBe(415);
  });

  it("role boundaries over HTTP: supervisor 403 on content, curator 403 on visits", async () => {
    const db = freshDb();
    const visitId = listVisits(db, asha(db)).items[0].id;
    const sup = client(db, "demo-supervisor-meena");
    expect((await sup("GET", `/visits/${visitId}/observations`)).status).toBe(403);
    expect((await sup("GET", "/analytics/practice-gaps")).status).toBe(200);
    expect((await client(db, "demo-mentor-asha")("GET", "/analytics/practice-gaps")).status).toBe(403);
    expect((await client(db, "demo-mentor-rakesh")("GET", `/visits/${visitId}`)).status).toBe(404);
    expect((await client(db, "demo-curator-ishaan")("POST", "/visits", {})).status).toBe(403);
  });

  it("runs the core flow over HTTP and returns a CSV export", async () => {
    const db = freshDb();
    const api = client(db, "demo-mentor-asha");
    const planned = (await api("GET", "/visits?status=planned")).json.data.items.find((v: { subject: string }) => v.subject === "Hindi");
    expect((await api("POST", `/visits/${planned.id}/transition`, { to: "in_progress" })).status).toBe(200);
    const obs = await api("POST", `/visits/${planned.id}/observations`, {
      practice_observed: "Learners read aloud in pairs.", evidence: "Few questions checked whether learners understood the story.",
      improvement_area: "Few questions on the meaning of the story.",
    });
    expect(obs.status).toBe(201);
    const key = { "idempotency-key": "gen-1" };
    const fb = await api("POST", `/visits/${planned.id}/feedback`, {}, key);
    expect(fb.status).toBe(201);
    const fb2 = await api("POST", `/visits/${planned.id}/feedback`, {}, key);
    expect(fb2.json.data.id).toBe(fb.json.data.id); // replayed, not duplicated
    expect(fb.json.data.citations[0].practice_card_id).toBe("R-14");
    expect((await api("POST", `/feedback/${fb.json.data.id}/approve`)).json.data.status).toBe("approved");
    const sug = (await api("GET", `/visits/${planned.id}/commitment-suggestion`)).json.data;
    expect((await api("POST", "/commitments", { visit_id: planned.id, action_text: sug.action_text, target_date: sug.target_date, expected_evidence: sug.expected_evidence })).status).toBe(201);
    expect((await api("POST", `/visits/${planned.id}/report`)).status).toBe(201);
    expect((await api("POST", `/visits/${planned.id}/report/finalize`)).json.data.status).toBe("finalized");
    const csv = await api("GET", "/reports/export");
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.text.split("\r\n")[0]).toContain("school_code");
  });
});

describe("body-less requests", () => {
  it("a DELETE with no body and no content type is accepted (sign-out from the browser)", async () => {
    const db = freshDb();
    const res = await dispatch(new Request(base + "/session", { method: "DELETE" }), "/session", db);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});
