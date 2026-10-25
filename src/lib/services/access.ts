import { get, type Db } from "../db/client";
import { conflict, notFound } from "../errors";
import { requireRole } from "../auth/policy";
import type { Actor, VisitRow } from "../types";

export function isActivelyAssigned(db: Db, mentorId: string, schoolId: string): boolean {
  return !!get(
    db,
    "SELECT 1 AS ok FROM school_assignments WHERE profile_id = ? AND school_id = ? AND status = 'active'",
    mentorId,
    schoolId,
  );
}

/**
 * Load a visit the actor is allowed to work with.
 *
 * - 403 when the *role* can never do this (e.g. a supervisor asking for observation text).
 * - 404 when the visit exists but belongs to another mentor, so existence is not leaked.
 */
export function getAuthorizedVisit(
  db: Db,
  actor: Actor,
  visitId: string,
  mode: "content" | "write",
): VisitRow {
  requireRole(actor, mode === "write" ? "visit:write" : "visit:read_content");
  const visit = get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId);
  if (!visit || visit.mentor_id !== actor.id) throw notFound("Visit");
  if (!isActivelyAssigned(db, actor.id, visit.school_id)) throw notFound("Visit");
  return visit;
}

/**
 * Optimistic concurrency for edits. A client that opened a record at version X sends `expected_updated_at: X`; if the
 * record has changed since (another tab, another device), the edit is refused instead of silently overwriting newer work.
 * The field is optional so API clients that do not need the protection keep working.
 */
export function assertNotStale(currentUpdatedAt: string, expected: string | undefined | null): void {
  if (expected && expected !== currentUpdatedAt) {
    throw conflict("stale_edit", "This record was changed since you opened it. Reload to see the latest version before editing.");
  }
}
