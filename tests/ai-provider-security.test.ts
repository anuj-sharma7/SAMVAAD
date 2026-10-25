import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { createSession } from "@/lib/auth/session";
import { createAnthropicProvider } from "@/lib/ai/anthropic-provider";
import { providerStatus } from "@/lib/ai";
import { AiProviderError } from "@/lib/ai/provider";
import { generateFeedback, mapProviderError } from "@/lib/services/feedback";
import { listVisits } from "@/lib/services/visits";
import { get } from "@/lib/db/client";
import { freshDb, asha } from "./helpers";

/**
 * These tests use a LOCAL mock HTTP server that speaks enough of the Messages API to exercise the real provider code.
 * They prove error handling and secret hygiene of that code. They do NOT prove behaviour against the live Anthropic API
 * (no live call has been made in this project; see docs/KNOWN_LIMITATIONS.md).
 */
const KEY = "sk-ant-CANARY-0123456789abcdef";
let server: http.Server;
let base = "";
let mode = "ok";
let lastHeaders: http.IncomingHttpHeaders = {};
let lastBody = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastHeaders = req.headers;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastBody = body;
      const send = (status: number, payload: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(typeof payload === "string" ? payload : JSON.stringify(payload)); };
      if (mode === "401") return send(401, { error: { type: "authentication_error", message: `invalid x-api-key: ${req.headers["x-api-key"]}` } });
      if (mode === "429") return send(429, { error: { message: "slow down" } });
      if (mode === "500") return send(500, { error: { message: `upstream exploded, key was ${req.headers["x-api-key"]}` } });
      if (mode === "credits") return send(400, { error: { message: "Your credit balance is too low" } });
      if (mode === "html") return send(200, "<html>captive portal</html>");
      if (mode === "prose") return send(200, { content: [{ type: "text", text: "Sure! Here is some prose, not JSON." }] });
      if (mode === "hang") return; // never answers
      if (mode === "fenced") return send(200, { model: "mock-model", content: [{ type: "text", text: "```json\n{\"ok\":true}\n```" }] });
      send(200, { model: "mock-model", content: [{ type: "text", text: "{\"ok\":true}" }] });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const provider = () => createAnthropicProvider({ apiKey: KEY, model: "mock-model", baseUrl: base });
const req = { task: { task: "feedback", input: {} } as never, system: "sys", prompt: "hello", timeoutMs: 400 };
const failure = async (m: string) => { mode = m; try { await provider().generate(req); return null; } catch (e) { return e as AiProviderError; } };

describe("Anthropic provider (against a local mock server)", () => {
  it("sends the key only in the x-api-key header, never in the body", async () => {
    mode = "ok";
    const r = await provider().generate(req);
    expect(r.json).toEqual({ ok: true });
    expect(r.simulated).toBe(false);
    expect(lastHeaders["x-api-key"]).toBe(KEY);
    expect(lastBody).not.toContain(KEY);
  });

  it("strips Markdown fences around JSON", async () => {
    mode = "fenced";
    expect((await provider().generate(req)).json).toEqual({ ok: true });
  });

  it.each([
    ["401", "invalid_credentials"],
    ["429", "rate_limited"],
    ["500", "provider_error"],
    ["credits", "insufficient_credits"],
    ["html", "malformed_output"],
    ["prose", "malformed_output"],
    ["hang", "timeout"],
  ])("upstream '%s' becomes a safe '%s' error that never contains the key or upstream text", async (m, code) => {
    const err = await failure(m);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err!.code).toBe(code);
    expect(err!.message).not.toContain(KEY);
    expect(err!.message).not.toMatch(/sk-ant|exploded|x-api-key|captive/i);
    const mapped = mapProviderError(err);
    expect(mapped.message).not.toContain(KEY);
    expect(JSON.stringify(mapped)).not.toContain(KEY);
  });

  it("an unreachable endpoint is reported as a connection problem", async () => {
    const dead = createAnthropicProvider({ apiKey: KEY, model: "m", baseUrl: "http://127.0.0.1:1" });
    await expect(dead.generate(req)).rejects.toMatchObject({ code: "provider_error" });
  });

  it("a failed AI call saves nothing and returns a mentor-safe API error (service level)", async () => {
    const db = freshDb();
    const me = asha(db);
    const v = listVisits(db, me, { status: "in_progress" }).items[0];
    const before = get<{ n: number }>(db, "SELECT count(*) AS n FROM feedback_drafts")!.n;
    mode = "401";
    await expect(generateFeedback(db, me, v.id, {}, { provider: provider() })).rejects.toMatchObject({ code: "ai_invalid_credentials" });
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM feedback_drafts")!.n).toBe(before);
  });

  it("an unexpected exception whose text contains the key is replaced by a generic 500", () => {
    const e = mapProviderError(new Error(`connect failed with ${KEY}`));
    expect(e.status).toBe(500);
    expect(e.message).not.toContain(KEY);
  });
});

describe("configuration never leaks through API responses", () => {
  it("status endpoints and /me do not echo the API key even when it is configured", async () => {
    const env = { ...process.env, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "mock-model" };
    expect(JSON.stringify(providerStatus(env))).not.toContain(KEY);
    const prev = { ...process.env };
    Object.assign(process.env, { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "mock-model" });
    try {
      const db = freshDb();
      const cookie = `samvaad_session=${createSession(db, "demo-mentor-asha").token}`;
      for (const p of ["/me", "/health", "/ready", "/session/personas", "/dashboard", "/schools", "/visits", "/audit"]) {
        const res = await dispatch(new Request(`http://localhost:3000/api/v1${p}`, { headers: { host: "localhost:3000", cookie } }), p, db);
        expect(await res.text(), p).not.toMatch(/CANARY|sk-ant/);
      }
      const bad = await dispatch(new Request("http://localhost:3000/api/v1/visits/%E0%A4%A", { headers: { host: "localhost:3000", cookie } }), "/visits/%E0%A4%A", db);
      expect(await bad.text()).not.toMatch(/CANARY|sk-ant|at .*\.ts:\d+/);
    } finally {
      for (const k of ["AI_PROVIDER", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) {
        if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
      }
    }
  });
});
