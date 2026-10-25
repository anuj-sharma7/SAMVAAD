import { describe, expect, it } from "vitest";
import { all, get } from "@/lib/db/client";
import { freshDb } from "./helpers";
import { createSession, demoSignIn, resolveSession, revokeSession, SESSION_TTL_MS } from "@/lib/auth/session";
import { dispatch } from "@/lib/api/router";
import "@/lib/api/handlers";
import { createHash } from "node:crypto";

const base = "http://localhost:3000/api/v1";

describe("server-side sessions", () => {
  it("issues high-entropy random tokens and stores only their hash", () => {
    const db = freshDb();
    const a = createSession(db, "demo-mentor-asha");
    const b = createSession(db, "demo-mentor-asha");
    expect(a.token).not.toBe(b.token); // a new token on every sign-in (no session fixation)
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    const rows = all<{ token_hash: string }>(db, "SELECT token_hash FROM sessions");
    expect(rows.some((r) => r.token_hash === a.token)).toBe(false); // plain token is never stored
    expect(rows.some((r) => r.token_hash === createHash("sha256").update(a.token).digest("hex"))).toBe(true);
    expect(JSON.stringify(all(db, "SELECT * FROM sessions"))).not.toContain(a.token);
  });

  it("denies unknown, malformed, empty and oversized tokens", () => {
    const db = freshDb();
    for (const t of [undefined, null, "", "abc", "demo-mentor-asha", "x".repeat(500), "' OR 1=1 --", "../../etc/passwd", "a.b.c"]) {
      expect(resolveSession(db, t as string | null | undefined), String(t).slice(0, 20)).toBeNull();
    }
  });

  it("expires on the server, regardless of what the cookie says", () => {
    const db = freshDb();
    const t0 = Date.now();
    const { token } = createSession(db, "demo-mentor-asha", t0);
    expect(resolveSession(db, token, t0 + SESSION_TTL_MS - 1000)?.id).toBe("demo-mentor-asha");
    expect(resolveSession(db, token, t0 + SESSION_TTL_MS + 1000)).toBeNull();
  });

  it("logout revokes the session so a copied cookie stops working (not just cleared in the browser)", async () => {
    const db = freshDb();
    const { token } = createSession(db, "demo-mentor-asha");
    const cookie = `samvaad_session=${token}`;
    const ok = await dispatch(new Request(`${base}/me`, { headers: { cookie } }), "/me", db);
    expect(ok.status).toBe(200);
    const out = await dispatch(new Request(`${base}/session`, { method: "DELETE", headers: { cookie } }), "/session", db);
    expect(out.status).toBe(200);
    const replay = await dispatch(new Request(`${base}/me`, { headers: { cookie } }), "/me", db);
    expect(replay.status).toBe(401); // the attacker replaying the old cookie is refused
    expect(get<{ revoked_at: string | null }>(db, "SELECT revoked_at FROM sessions LIMIT 1")?.revoked_at).not.toBeNull();
  });

  it("a session belongs to one profile; revoking one does not affect another", () => {
    const db = freshDb();
    const a = createSession(db, "demo-mentor-asha");
    const r = createSession(db, "demo-mentor-rakesh");
    revokeSession(db, a.token);
    expect(resolveSession(db, a.token)).toBeNull();
    expect(resolveSession(db, r.token)?.id).toBe("demo-mentor-rakesh");
  });

  it("demo sign-in refuses non-demo profiles and is disabled when DEMO_MODE=false", () => {
    const db = freshDb();
    expect(() => demoSignIn(db, "no-such-profile")).toThrow();
    db.prepare("UPDATE profiles SET is_demo = 0 WHERE id = 'demo-mentor-asha'").run();
    expect(() => demoSignIn(db, "demo-mentor-asha")).toThrow();
    const prev = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    try {
      expect(() => demoSignIn(db, "demo-mentor-rakesh")).toThrow(/disabled/);
    } finally {
      if (prev === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prev;
    }
  });

  it("the sign-in cookie is HttpOnly, SameSite=Lax and carries a server-enforced lifetime", async () => {
    const db = freshDb();
    const res = await dispatch(
      new Request(`${base}/session`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000" }, body: JSON.stringify({ profile_id: "demo-mentor-asha" }) }),
      "/session", db,
    );
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Max-Age=43200/);
    expect(c).toMatch(/Path=\//);
  });

  it("the hard-coded fallback signing secret no longer exists in source", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/lib/auth/session.ts", "utf8");
    expect(src).not.toMatch(/dev-only-secret|SESSION_SECRET/);
  });
});
