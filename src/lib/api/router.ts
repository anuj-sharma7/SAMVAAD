import { ZodError } from "zod";
import { AppError, unauthenticated } from "../errors";
import { SESSION_COOKIE, actorFromToken } from "../auth/session";
import { getDb } from "../db";
import type { Db } from "../db/client";
import type { Actor } from "../types";
import { LIMITS, MAX_BODY_BYTES, rateLimit, type Limit } from "../security/rate-limit";

export interface Ctx {
  db: Db;
  actor: Actor;
  params: Record<string, string>;
  query: URLSearchParams;
  req: Request;
  json: () => Promise<unknown>;
  idempotencyKey: string | null;
  setCookie: (name: string, value: string, opts?: { maxAge?: number }) => void;
  cookie: (name: string) => string | null;
  requestId: string;
}
export type PublicCtx = Omit<Ctx, "actor"> & { actor: Actor | null };

type Handler = (c: Ctx) => Promise<unknown> | unknown;
type PublicHandler = (c: PublicCtx) => Promise<unknown> | unknown;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler | PublicHandler;
  isPublic: boolean;
  status: number;
  limit?: Limit;
}

const routes: Route[] = [];

function compile(pattern: string) {
  const keys: string[] = [];
  const src = pattern.replace(/:([a-z_]+)/gi, (_m, k: string) => {
    keys.push(k);
    return "([^/]+)";
  });
  return { re: new RegExp(`^${src}/?$`), keys };
}

export function route(method: string, pattern: string, handler: Handler, status = 200, limit?: Limit) {
  routes.push({ method, ...compile(pattern), handler, isPublic: false, status, limit });
}
export function publicRoute(method: string, pattern: string, handler: PublicHandler, status = 200, limit?: Limit) {
  routes.push({ method, ...compile(pattern), handler, isPublic: true, status, limit });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function errorResponse(status: number, code: string, message: string, requestId: string, details?: unknown, headers?: Headers) {
  return Response.json({ error: { code, message, details, request_id: requestId } }, { status, headers });
}

/** Cross-site request hardening for cookie-authenticated mutations. */
function checkCrossSite(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError(403, "bad_origin", "Cross-origin requests are not allowed");
    }
    const host = req.headers.get("host");
    if (host && originHost !== host) throw new AppError(403, "bad_origin", "Cross-origin requests are not allowed");
  }
  // Browsers state where a request came from; anything but our own origin (or a direct navigation) is refused.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new AppError(403, "bad_origin", "Cross-site requests are not allowed");
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null; // malformed cookie value is simply "no session"
      }
    }
  }
  return null;
}

/** Read the request body up to MAX_BODY_BYTES, whatever Content-Length claims. */
async function readCapped(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError(413, "payload_too_large", `The request body is larger than ${Math.round(MAX_BODY_BYTES / 1024)} KiB`);
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(413, "payload_too_large", `The request body is larger than ${Math.round(MAX_BODY_BYTES / 1024)} KiB`);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

function clientKey(req: Request): string {
  // x-forwarded-for is client-controlled unless a proxy you operate overwrites it, so it is ignored by default
  // (otherwise rotating the header would bypass every per-client limit). Set SAMVAAD_TRUST_PROXY=true only behind such a proxy.
  if (process.env.SAMVAAD_TRUST_PROXY !== "true") return "shared";
  return (req.headers.get("x-forwarded-for") ?? "").split(",").pop()!.trim().slice(0, 64) || "shared";
}

/** node:sqlite reports lock contention and constraint failures as generic errors; map them to safe responses. */
function sqliteError(err: unknown): { status: number; code: string; message: string; retry?: boolean } | null {
  const e = err as { code?: string; errcode?: number; message?: string };
  if (e?.code !== "ERR_SQLITE_ERROR") return null;
  const msg = String(e.message ?? "").toLowerCase();
  if (e.errcode === 5 || e.errcode === 6 || msg.includes("database is locked") || msg.includes("database table is locked")) {
    return { status: 503, code: "db_busy", message: "The database is busy. Please retry in a moment.", retry: true };
  }
  if (e.errcode === 19 || (e.errcode ?? 0) % 256 === 19 || msg.includes("constraint failed")) {
    return { status: 409, code: "conflict", message: "That change conflicts with existing data." };
  }
  return null;
}

/** Dispatch a request under /api/v1. `path` is the path after `/api/v1`, e.g. "/visits/123/feedback". */
export async function dispatch(req: Request, path: string, db: Db = getDb()): Promise<Response> {
  const requestId = crypto.randomUUID();
  const res = await handle(req, path, db, requestId);
  // Headers every API response carries, success or failure.
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "no-referrer");
  if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
  return res;
}

async function handle(req: Request, path: string, db: Db, requestId: string): Promise<Response> {
  const headers = new Headers();
  try {
    const method = req.method.toUpperCase();
    const matches = routes.filter((r) => r.re.test(path));
    if (matches.length === 0) return errorResponse(404, "not_found", "No such endpoint", requestId);
    const hit = matches.find((r) => r.method === method);
    if (!hit) {
      return errorResponse(405, "method_not_allowed", `${method} is not supported here`, requestId, undefined, new Headers({ allow: matches.map((m) => m.method).join(", ") }));
    }
    if (MUTATING.has(method)) {
      checkCrossSite(req);
      const type = req.headers.get("content-type") ?? "";
      // A request only needs a JSON content type when it actually carries a body (e.g. a body-less DELETE does not).
      const hasBody = Number(req.headers.get("content-length") ?? 0) > 0 || req.headers.has("transfer-encoding") || type !== "";
      if (hasBody && !type.includes("application/json")) {
        return errorResponse(415, "unsupported_media_type", "Send JSON with Content-Type: application/json", requestId);
      }
      if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
        throw new AppError(413, "payload_too_large", `The request body is larger than ${Math.round(MAX_BODY_BYTES / 1024)} KiB`);
      }
    }

    const m = hit.re.exec(path)!;
    let params: Record<string, string>;
    try {
      params = Object.fromEntries(hit.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    } catch {
      throw new AppError(400, "bad_request", "The URL contains an invalid escape sequence");
    }
    for (const v of Object.values(params)) {
      if (v.length > 128 || /[\u0000-\u001f]/.test(v)) throw new AppError(400, "bad_request", "A path parameter is malformed");
    }

    const cookieHeaders: string[] = [];
    const base = {
      db, params, req, requestId,
      query: new URL(req.url).searchParams,
      json: async () => {
        const text = await readCapped(req);
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          throw new AppError(400, "bad_json", "The request body is not valid JSON");
        }
      },
      idempotencyKey: (req.headers.get("idempotency-key") ?? "").slice(0, 100) || null,
      cookie: (name: string) => readCookie(req, name),
      setCookie: (name: string, value: string, opts: { maxAge?: number } = {}) => {
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        cookieHeaders.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge ?? 60 * 60 * 12}${secure}`);
      },
    };

    const token = readCookie(req, SESSION_COOKIE);
    const throttle = (key: string, limit: Limit) => {
      const r = rateLimit(key, limit);
      if (!r.ok) {
        headers.set("retry-after", String(r.retryAfterSec));
        throw new AppError(429, "rate_limited", `Too many requests. Please wait ${r.retryAfterSec} seconds and try again.`);
      }
    };

    let result: unknown;
    if (hit.isPublic) {
      let actor: Actor | null = null;
      try { actor = actorFromToken(db, token); } catch { /* anonymous */ }
      throttle(`ip:${clientKey(req)}`, hit.limit ?? LIMITS.general);
      result = await (hit.handler as PublicHandler)({ ...base, actor });
    } else {
      if (!token) throw unauthenticated();
      const actor = actorFromToken(db, token);
      throttle(actor.id, LIMITS.general);
      if (MUTATING.has(method)) throttle(actor.id, LIMITS.mutation);
      if (hit.limit) throttle(actor.id, hit.limit);
      result = await (hit.handler as Handler)({ ...base, actor });
    }
    for (const c of cookieHeaders) headers.append("set-cookie", c);
    if (result instanceof Response) {
      cookieHeaders.forEach((c) => result.headers.append("set-cookie", c));
      return result;
    }
    headers.set("cache-control", "no-store");
    return Response.json({ data: result }, { status: hit.status, headers });
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err.status, err.code, err.message, requestId, err.details, headers);
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const i of err.issues) fields[i.path.join(".") || "_"] ??= i.message;
      return errorResponse(422, "validation_failed", "Some fields need attention", requestId, fields, headers);
    }
    const sq = sqliteError(err);
    if (sq) {
      if (sq.retry) headers.set("retry-after", "1");
      console.error(`[api] ${requestId} database error: ${sq.code}`);
      return errorResponse(sq.status, sq.code, sq.message, requestId, undefined, headers);
    }
    // Unknown failure: log a short message with the request id server-side only; never leak internals to the client.
    console.error(`[api] ${requestId} unhandled error:`, err instanceof Error ? err.message.slice(0, 200) : "unknown");
    return errorResponse(500, "internal_error", "Something went wrong on the server", requestId, undefined, headers);
  }
}
