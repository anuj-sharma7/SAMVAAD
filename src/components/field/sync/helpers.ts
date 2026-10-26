import type { EntityType, OutboxOp, OutboxStatus } from "@/lib/offline/types";

/** Error codes the Sync Center can explain in plain words (keys: sync.err.<code>). */
export const KNOWN_ERROR_CODES = [
  "network", "server_error", "rate_limited", "bad_request", "auth_expired", "validation_failed", "forbidden", "not_found",
  "feedback_already_approved", "visit_locked", "visit_not_observable", "invalid_transition", "no_observations", "commitment_exists",
  "conflict", "stale_edit", "earlier_operation_failed", "no_answer", "rejected",
] as const;

/** Message key for an error code, or null when the code is not one we know (the screen then shows a generic text plus the code). */
export function errorMessageKey(code: string | undefined | null): string | null {
  if (!code) return null;
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code) ? `sync.err.${code}` : null;
}

/** Only letters, digits, dots, dashes and underscores may be shown as a "short code" (never free text). */
export function safeCode(code: string | undefined | null): string | null {
  if (!code) return null;
  return /^[A-Za-z0-9._-]{1,40}$/.test(code) ? code : "unknown";
}

const SEVERITY: Record<OutboxStatus, number> = { rejected: 5, conflict: 4, failed: 3, inflight: 2, queued: 1 };
/** The most serious status among the operations of one record. */
export function worstStatus(ops: Pick<OutboxOp, "status">[]): OutboxStatus {
  return ops.reduce<OutboxStatus>((w, o) => (SEVERITY[o.status] > SEVERITY[w] ? o.status : w), "queued");
}

export type RecordBadge = "pending" | "failed" | "conflict";
export function badgeFor(status: OutboxStatus): RecordBadge {
  if (status === "conflict") return "conflict";
  if (status === "failed" || status === "rejected") return "failed";
  return "pending";
}

export interface RecordGroup { key: string; entityType: EntityType; entityId: string; chain: string; ops: OutboxOp[]; status: OutboxStatus }

/** One row per record: operations are grouped by record, most serious first. */
export function groupOps(ops: OutboxOp[]): RecordGroup[] {
  const map = new Map<string, RecordGroup>();
  for (const o of ops) {
    const key = `${o.entityType}:${o.entityId}`;
    const g = map.get(key) ?? { key, entityType: o.entityType, entityId: o.entityId, chain: o.chain, ops: [], status: "queued" as OutboxStatus };
    g.ops.push(o);
    map.set(key, g);
  }
  const out = [...map.values()];
  for (const g of out) g.status = worstStatus(g.ops);
  return out.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || a.key.localeCompare(b.key));
}

/** First `n` characters of free text, on one line, with an ellipsis when cut. */
export function snippet(text: string | null | undefined, n = 40): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

/** Fields that can be compared in a conflict, per record type (keys: sync.field.<key>). */
export const CONFLICT_FIELDS: Record<EntityType, string[]> = {
  visit: ["teacher_alias", "scheduled_at", "grade", "subject", "language", "purpose", "coaching_focus", "prep_notes", "observation_method", "status"],
  observation: ["practice_observed", "evidence", "worked_well", "improvement_area", "context_note"],
  commitment: ["action_text", "owner_role", "owner_alias", "target_date", "expected_evidence", "status"],
};

const norm = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);

export interface FieldCompare { key: string; local: unknown; server: unknown; differs: boolean }
/** Compare the two versions field by field. Fields missing on both sides are left out. */
export function compareVersions(type: EntityType, local: Record<string, unknown>, server: Record<string, unknown>): FieldCompare[] {
  const rows: FieldCompare[] = [];
  for (const key of CONFLICT_FIELDS[type]) {
    if (!(key in local) && !(key in server)) continue;
    const l = norm(local[key]);
    const s = norm(server[key]);
    rows.push({ key, local: local[key], server: server[key], differs: JSON.stringify(l) !== JSON.stringify(s) });
  }
  return rows;
}

/** Wording key for a finished sync report (or null = the server could not be reached). */
export function reportMessage(report: { status: string; applied: number; duplicates: number } | null): { key: string; n?: number } {
  if (!report) return { key: "sync.result.offline" };
  switch (report.status) {
    case "ok": return { key: "sync.result.sent", n: report.applied + report.duplicates };
    case "nothing": return { key: "sync.result.nothing" };
    case "partial": return { key: "sync.result.partial" };
    case "auth_expired": return { key: "sync.result.authExpired" };
    case "account_mismatch": return { key: "sync.result.mismatch" };
    case "busy": return { key: "sync.result.busy" };
    default: return { key: "sync.result.offline" };
  }
}

const KNOWN_LOG = ["applied", "duplicate", "conflict", "rejected", "failed", "skipped", "resolved_mine", "resolved_server", "discarded_by_user"];
export const logResultKey = (r: string) => (KNOWN_LOG.includes(r) ? `sync.log.${r}` : "sync.log.other");

export function formatBytes(n: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: v >= 100 || i === 0 ? 0 : 1 });
  return `${fmt.format(v)} ${units[i]}`;
}

/** Percentage of the storage quota in use (0-100), or null when unknown. */
export function usagePercent(usage: number | null, quota: number | null): number | null {
  if (usage === null || quota === null || quota <= 0) return null;
  return Math.min(100, Math.round((usage / quota) * 100));
}
