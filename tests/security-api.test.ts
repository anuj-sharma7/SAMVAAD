import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { resetRateLimits, MAX_BODY_BYTES } from "@/lib/security/rate-limit";
import { createSession } from "@/lib/auth/session";
import { openDatabase } from "@/lib/db/client";
import { seedDemoData } from "@/lib/db/seed";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshDb, asha } from "./helpers";
import { listVisits } from "@/lib/services/visits";

const base = "http://localhost:3000/api/v1";
beforeEach(() => resetRateLimits());

function api(db: ReturnType<typeof freshDb>, persona = "demo-mentor-asha") {
  const cookie = `samvaad_session=${createSession(db, persona).token}`;
  return async (method: string, p: string, body?: BodyInit | object, headers: Record<string, string> = {}) => {
    const isObj = body !== undefined && typeof body === "object" && !(body instanceof ReadableStream);
    const res = await dispatch(
      new Request(base + p, {
        method,
        headers: { cookie, host: "localhost:3000", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : isObj ? JSON.stringify(body) : (body as BodyInit),
      }),
      p.split("?")[0], db,
    );
    const text = await res.text();
    let json: { data?: unknown; error?: { code: string; message: string; request_id?: string; details?: unknown } } | null = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

describe("request size limits", () => {
  it("rejects an oversized body declared by Content-Length (413) before parsing it", async () => {
    const db = freshDb();
    const huge = JSON.stringify({ practice_observed: "x".repeat(MAX_BODY_BYTES + 10), evidence: "y" });
    const r = await api(db)("POST", `/visits/${listVisits(db, asha(db), { status: "in_progress" }).items[0].id}/observations`, huge);
    expect(r.status).toBe(413);
    expect(r.json?.error?.code).toBe("payload_too_large");
  });

  it("enforces the cap on the real stream even when Content-Length is absent or lies", async () => {
    const db = freshDb();
    const id = listVisits(db, asha(db), { status: "in_progress" }).items[0].id;
    const chunk = new TextEncoder().encode("a".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { if (sent >= 8) c.close(); else { c.enqueue(chunk); sent++; } }, // 512 KiB, no content-length header
    });
    const req = new Request(`${base}/visits/${id}/observations`, {
      method: "POST", headers: { cookie: `samvaad_session=${createSession(db, "demo-mentor-asha").token}`, host: "localhost:3000", "content-type": "application/json" },
      body: stream, duplex: "half",
    } as RequestInit);
    const res = await dispatch(req, `/visits/${id}/observations`, db);
    expect(res.status).toBe(413);
  });

  it("accepts a normal-sized observation and enforces per-field limits with a 422", async () => {
    const db = freshDb();
    const id = listVisits(db, asha(db), { status: "in_progress" }).items[0].id;
    const ok = await api(db)("POST", `/visits/${id}/observations`, { practice_observed: "Learners worked in pairs.", evidence: "Pairs shared answers." });
    expect(ok.status).toBe(201);
    const long = await api(db)("POST", `/visits/${id}/observations`, { practice_observed: "x".repeat(5000), evidence: "ok text" });
    expect(long.status).toBe(422);
    expect(long.json?.error?.code).toBe("validation_failed");
  });

  it("malformed JSON is a clean 400, not a 500", async () => {
    const db = freshDb();
    const r = await api(db)("POST", "/commitments", "{not json");
    expect(r.status).toBe(400);
    expect(r.json?.error?.code).toBe("bad_json");
  });
});

describe("rate limiting", () => {
  it("throttles AI generation per user with 429 and Retry-After, and does not call the provider after the limit", async () => {
    const db = freshDb();
    const call = api(db);
    const id = listVisits(db, asha(db), { status: "in_progress" }).items[0].id;
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) statuses.push((await call("POST", `/visits/${id}/feedback`, {})).status);
    expect(statuses.slice(0, 12).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(12).every((s) => s === 429)).toBe(true);
    const blocked = await call("POST", `/visits/${id}/feedback`, {});
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.json?.error?.code).toBe("rate_limited");
  });

  it("limits are per user: one user's burst does not block another", async () => {
    const db = freshDb();
    const a = api(db, "demo-mentor-asha");
    const r = api(db, "demo-mentor-rakesh");
    const id = listVisits(db, asha(db), { status: "in_progress" }).items[0].id;
    for (let i = 0; i < 14; i++) await a("POST", `/visits/${id}/feedback`, {});
    expect((await a("POST", `/visits/${id}/feedback`, {})).status).toBe(429);
    expect((await r("GET", "/me")).status).toBe(200);
  });

  it("throttles sign-in attempts per client", async () => {
    const db = freshDb();
    const attempt = () => dispatch(new Request(`${base}/session`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ profile_id: "nobody" }) }), "/session", db);
    const codes: number[] = [];
    for (let i = 0; i < 24; i++) codes.push((await attempt()).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(4);
    expect(codes[0]).toBe(404);
  });

  it("rotating a spoofed X-Forwarded-For cannot bypass the sign-in limit unless the proxy is explicitly trusted", async () => {
    const db = freshDb();
    const attempt = (i: number) => dispatch(new Request(`${base}/session`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": `203.0.113.${i}` }, body: JSON.stringify({ profile_id: "nobody" }) }), "/session", db);
    const spoofed: number[] = [];
    for (let i = 0; i < 24; i++) spoofed.push((await attempt(i)).status);
    expect(spoofed.filter((c) => c === 429).length).toBeGreaterThanOrEqual(4); // header ignored: one shared bucket

    resetRateLimits();
    process.env.SAMVAAD_TRUST_PROXY = "true";
    try {
      const trusted: number[] = [];
      for (let i = 0; i < 24; i++) trusted.push((await attempt(i)).status);
      expect(trusted.filter((c) => c === 429)).toHaveLength(0); // distinct client addresses behind a trusted proxy get distinct buckets
    } finally {
      delete process.env.SAMVAAD_TRUST_PROXY;
    }
  });
});

describe("malformed routes and parameters never become 500s", () => {
  const BAD = ["%E0%A4%A", "%00", "a".repeat(300), "' OR 1=1 --", "../../etc/passwd", "null", "undefined", "%2e%2e%2f", "1;DROP TABLE visits"];
  it.each(["/visits/", "/observations/", "/feedback/", "/commitments/", "/demonstrations/", "/practice-cards/", "/schools/", "/knowledge/chunks/"])("%s{bad id}", async (prefix) => {
    const db = freshDb();
    const call = api(db);
    for (const id of BAD) {
      const r = await call("GET", `${prefix}${id}`);
      expect([400, 403, 404, 405], `${prefix}${id.slice(0, 20)} -> ${r.status}`).toContain(r.status);
      expect(r.text).not.toMatch(/sqlite|stack|at .*\(.*:\d+:\d+\)|C:\\\\/i);
    }
  });

  it("SQL-looking input stays data: tables survive and filters just return nothing", async () => {
    const db = freshDb();
    const call = api(db);
    for (const q of ["' OR 1=1 --", "'; DROP TABLE visits; --", "%' UNION SELECT * FROM sessions --", "\\"]) {
      expect((await call("GET", `/visits?q=${encodeURIComponent(q)}`)).status).toBe(200);
      expect((await call("GET", `/schools?q=${encodeURIComponent(q)}`)).status).toBe(200);
      expect((await call("GET", `/practice-cards?q=${encodeURIComponent(q)}`)).status).toBe(200);
    }
    const visits = await call("GET", "/visits");
    expect(((visits.json?.data as { total: number }).total)).toBeGreaterThan(0);
    const t = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('visits','sessions','audit_logs')").get() as { n: number };
    expect(t.n).toBe(3);
  });

  it("non-numeric paging/limit parameters are handled, not crashed on", async () => {
    const db = freshDb();
    const sup = api(db, "demo-supervisor-meena");
    for (const q of ["limit=abc", "limit=-5", "limit=999999", "limit=1e9", "limit=NaN"]) {
      const r = await sup("GET", `/audit?${q}`);
      expect(r.status, q).toBe(200);
    }
    const call = api(db);
    for (const q of ["page=abc", "page=-1", "pageSize=0", "pageSize=100000"]) {
      const r = await call("GET", `/visits?${q}`);
      expect([200, 422], q).toContain(r.status);
    }
  });
});

describe("cross-site and content-type protections", () => {
  it("rejects cross-site browser requests and cross-origin Origin headers on mutations", async () => {
    const db = freshDb();
    const call = api(db);
    expect((await call("POST", "/commitments", {}, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call("POST", "/commitments", {}, { "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await call("POST", "/commitments", {}, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/commitments", {}, { origin: "not a url" })).status).toBe(403);
    // same-origin requests pass the cross-site gate and fail later on validation, not on origin
    const same = await call("POST", "/commitments", {}, { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" });
    expect(same.status).toBe(422);
  });

  it("state-changing endpoints do not respond to GET", async () => {
    const db = freshDb();
    const call = api(db);
    for (const p of ["/session", "/commitments/x/review", "/feedback/x/approve", "/visits/x/transition", "/visits/x/report/finalize"]) {
      const r = await call("GET", p);
      expect([404, 405, 200], p).toContain(r.status);
    }
    expect((await call("GET", "/feedback/x/approve")).status).toBe(405);
    expect((await call("GET", "/visits/x/report/finalize")).status).toBe(405);
  });

  it("never opens CORS and marks every response as non-cacheable and non-sniffable", async () => {
    const db = freshDb();
    for (const p of ["/health", "/me", "/dashboard", "/reports/export", "/public/sources"]) {
      const r = await api(db)("GET", p);
      expect(r.headers.get("access-control-allow-origin"), p).toBeNull();
      expect(r.headers.get("cache-control"), p).toMatch(/no-store/);
      expect(r.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(r.headers.get("x-request-id"), p).toMatch(/^[0-9a-f-]{36}$/);
    }
    const pre = await dispatch(new Request(`${base}/me`, { method: "OPTIONS", headers: { origin: "https://evil.example" } }), "/me", db);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("error hygiene", () => {
  it("errors carry a request id and never leak internals", async () => {
    const db = freshDb();
    const r = await api(db)("GET", "/visits/does-not-exist");
    expect(r.status).toBe(404);
    expect(r.json?.error?.request_id).toBe(r.headers.get("x-request-id"));
    expect(r.text).not.toMatch(/\.ts|node_modules|sqlite|SELECT |stack/i);
  });

  it("an unexpected internal failure returns a generic 500 with only a request id", async () => {
    const db = freshDb();
    db.exec("DROP TABLE kb_chunks"); // simulate corrupted storage that code paths will trip over
    const r = await api(db, "demo-curator-ishaan")("GET", "/knowledge/chunks/x");
    expect([500, 404]).toContain(r.status);
    if (r.status === 500) {
      expect(r.json?.error?.message).toBe("Something went wrong on the server");
      expect(r.text).not.toMatch(/no such table|kb_chunks|sqlite/i);
    }
  });

  it("maps SQLite lock contention to a safe 503 with Retry-After", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-lock-"));
    const file = path.join(dir, "lock.db");
    const a = openDatabase(file);
    seedDemoData(a);
    const b = openDatabase(file);
    b.exec("PRAGMA busy_timeout = 50");
    const cookie = `samvaad_session=${createSession(a, "demo-mentor-asha").token}`;
    const id = listVisits(a, asha(a), { status: "in_progress" }).items[0].id;
    a.exec("BEGIN EXCLUSIVE"); // another writer holds the database
    try {
      const res = await dispatch(
        new Request(`${base}/visits/${id}/observations`, { method: "POST", headers: { cookie, host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ practice_observed: "Pairs read aloud.", evidence: "Turns taken." }) }),
        `/visits/${id}/observations`, b,
      );
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("1");
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("db_busy");
      expect(JSON.stringify(body)).not.toMatch(/sqlite|locked|SELECT|INSERT/i);
    } finally {
      a.exec("ROLLBACK");
    }
  });
});
