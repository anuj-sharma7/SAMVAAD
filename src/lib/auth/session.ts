import { createHash, randomBytes } from "node:crypto";
import { get, run, type Db } from "../db/client";
import { AppError, unauthenticated } from "../errors";
import { nowIso } from "../util";
import type { Actor, Lang, Role } from "../types";

export const SESSION_COOKIE = "samvaad_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, enforced on the server (not just by the cookie)

/**
 * DEMO AUTHENTICATION ONLY. Signing in means choosing a fictional persona: there are no passwords, so anyone who can
 * reach the app can pick any demo persona. What IS real: the session itself. Tokens are random, stored hashed, expire
 * on the server, and are revoked on sign-out. Production needs real identity (e.g. state SSO) before any real data.
 */
export const demoModeEnabled = () => process.env.DEMO_MODE !== "false";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionInfo { actor: Actor; token: string; expiresAt: string }

export function loadActor(db: Db, profileId: string): Actor | null {
  const p = get<{ id: string; role: Role; display_name: string; preferred_language: Lang; ui_language: Lang | null }>(
    db,
    "SELECT id, role, display_name, preferred_language, ui_language FROM profiles WHERE id = ?",
    profileId,
  );
  return p ? { id: p.id, role: p.role, displayName: p.display_name, preferredLanguage: p.preferred_language, uiLanguage: p.ui_language } : null;
}

/** Create a session for a profile. A fresh token is issued on every sign-in (no session fixation). */
export function createSession(db: Db, profileId: string, now = Date.now()): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  run(db, "DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL", new Date(now).toISOString()); // opportunistic purge
  run(
    db,
    "INSERT INTO sessions (token_hash, profile_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)",
    hash(token), profileId, new Date(now).toISOString(), expiresAt, new Date(now).toISOString(),
  );
  return { token, expiresAt };
}

/** Resolve a cookie token to an actor. Unknown, expired and revoked tokens all yield null (deny by default). */
export function resolveSession(db: Db, token: string | undefined | null, now = Date.now()): Actor | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const row = get<{ profile_id: string; expires_at: string; revoked_at: string | null }>(
    db,
    "SELECT profile_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?",
    hash(token),
  );
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= now) return null;
  return loadActor(db, row.profile_id);
}

export function revokeSession(db: Db, token: string | undefined | null): void {
  if (!token) return;
  run(db, "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", nowIso(), hash(token));
}

/** Demo sign-in: only demo profiles, and only while DEMO_MODE is on. */
export function demoSignIn(db: Db, profileId: string): SessionInfo {
  if (!demoModeEnabled()) throw new AppError(403, "demo_disabled", "Demo sign-in is disabled on this server");
  const row = get<{ is_demo: number }>(db, "SELECT is_demo FROM profiles WHERE id = ?", profileId);
  if (!row || !row.is_demo) throw new AppError(404, "not_found", "Unknown demo persona");
  const { token, expiresAt } = createSession(db, profileId);
  return { actor: loadActor(db, profileId)!, token, expiresAt };
}

export function actorFromToken(db: Db, token: string | undefined | null): Actor {
  const actor = resolveSession(db, token);
  if (!actor) throw unauthenticated();
  return actor;
}
