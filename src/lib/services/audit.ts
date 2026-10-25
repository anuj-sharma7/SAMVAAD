import { all, run, type Db } from "../db/client";
import { nowIso, parseJson } from "../util";
import type { Actor } from "../types";
import { requireRole } from "../auth/policy";

export type AuditAction =
  | "session.sign_in"
  | "visit.created"
  | "visit.updated"
  | "visit.transitioned"
  | "observation.added"
  | "observation.updated"
  | "observation.deleted"
  | "observation_tag.suggested"
  | "observation_tag.confirmed"
  | "observation_tag.dismissed"
  | "feedback.generated"
  | "feedback.generation_failed"
  | "feedback.insufficient_evidence"
  | "feedback.edited"
  | "feedback.approved"
  | "feedback.rejected"
  | "demonstration.generated"
  | "demonstration.edited"
  | "demonstration.approved"
  | "commitment.created"
  | "commitment.updated"
  | "commitment.reviewed"
  | "report.generated"
  | "report.edited"
  | "report.finalized"
  | "report.exported"
  | "practice_card.created"
  | "practice_card.revised"
  | "practice_card.approved"
  | "practice_card.rejected"
  | "school.created"
  | "school.assigned"
  | "settings.priority_rules_updated"
  | "dataset.imported"
  | "dataset.updated"
  | "dataset.rejected"
  | "dataset.activated"
  | "kb.imported"
  | "kb_chunk.approved"
  | "kb_chunk.rejected"
  | "kb_chunk.changed";

/** Keys that must never be persisted into audit metadata, whatever a caller passes. */
const FORBIDDEN_KEYS = /key|secret|token|password|authorization|audio|transcript/i;

function sanitise(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;
  }
  return out;
}

/**
 * Append an audit event. Metadata is minimal on purpose: ids, statuses and counts, not free text
 * typed by mentors, and never secrets. The table itself is append-only (DB triggers).
 */
export function audit(
  db: Db,
  actor: Actor | null,
  action: AuditAction,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): void {
  run(
    db,
    `INSERT INTO audit_logs (at, actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    nowIso(),
    actor?.id ?? null,
    actor?.role ?? null,
    action,
    resourceType,
    resourceId,
    JSON.stringify(sanitise(metadata)),
  );
}

export interface AuditEntry {
  id: number;
  at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
}

interface AuditRowRaw extends Omit<AuditEntry, "metadata"> {
  metadata: string;
}

export function listAudit(
  db: Db,
  actor: Actor,
  filter: { resourceType?: string; resourceId?: string; limit?: number } = {},
): AuditEntry[] {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const where: string[] = [];
  const params: string[] = [];

  if (actor.role === "supervisor") {
    requireRole(actor, "audit:read_all");
  } else if (actor.role === "diet_admin") {
    requireRole(actor, "audit:read_library");
    where.push("resource_type = 'practice_card'");
  } else {
    // mentors: only events they performed themselves
    where.push("actor_id = ?");
    params.push(actor.id);
  }
  if (filter.resourceType) {
    where.push("resource_type = ?");
    params.push(filter.resourceType);
  }
  if (filter.resourceId) {
    where.push("resource_id = ?");
    params.push(filter.resourceId);
  }
  const sql = `SELECT * FROM audit_logs ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY id DESC LIMIT ${limit}`;
  return all<AuditRowRaw>(db, sql, ...params).map((r) => ({
    ...r,
    metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
  }));
}
