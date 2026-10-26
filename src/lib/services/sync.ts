import { z } from "zod";
import { all, get, run, type Db } from "../db/client";
import { AppError, forbidden } from "../errors";
import { requireRole } from "../auth/policy";
import { isUuid, nowIso, parseJson } from "../util";
import { audit } from "./audit";
import { createVisit, transitionVisit, updateVisit } from "./visits";
import { addObservation, deleteObservation, updateObservation } from "./observations";
import { createCommitment, updateCommitment } from "./commitments";
import { getApprovedCards } from "./practice-cards";
import { loadActor } from "../auth/session";
import type { Actor, VisitStatus } from "../types";

/**
 * Offline synchronisation, server side.
 *
 * A device sends a batch of operations it recorded while offline. Each operation has a client-generated `op_id`; the
 * outcome of every TERMINAL operation (applied or rejected) is stored, so a retry returns the first answer and nothing is
 * applied twice. Operations run through the same service functions as the online UI (authorisation, validation,
 * transactions, audit), so offline does not create a second, weaker rule set.
 *
 * Result statuses:
 *   applied   the change is now on the server (server_version = the record's updated_at)
 *   duplicate this op_id was already applied; the original result is returned
 *   conflict  the record changed on the server since the device last saw it; the server's current copy is returned and
 *             nothing was overwritten
 *   rejected  the server will not accept this change (validation, permission, locked record); the code says why
 *   skipped   an earlier operation on the same visit was not applied, so this one was not attempted
 *   error     a temporary server problem; safe to retry the same operation
 */
export const MAX_OPS_PER_PUSH = 25;
const ENTITY = z.enum(["visit", "observation", "commitment"]);
const uuid = z.string().refine(isUuid, "must be a UUID");

export const syncOpSchema = z.object({
  op_id: uuid,
  entity_type: ENTITY,
  entity_id: uuid,
  op: z.enum(["create", "update", "delete", "transition"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  expected_updated_at: z.string().max(40).optional(),
  created_at: z.string().max(40),
  schema_version: z.number().int().min(1).max(1),
});
export const syncPushSchema = z.object({
  account_id: z.string().min(1).max(100),
  ops: z.array(syncOpSchema).min(1).max(MAX_OPS_PER_PUSH),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

export interface SyncResult {
  op_id: string;
  status: "applied" | "duplicate" | "conflict" | "rejected" | "skipped" | "error";
  entity_type: SyncOp["entity_type"];
  entity_id: string;
  /** updated_at of the server record after this op (the version token the device must use next). */
  server_version?: string;
  /** conflict only: the server's current copy of the record. */
  server_record?: Record<string, unknown>;
  /** rejected / error: stable machine-readable code (never a stack trace). */
  code?: string;
  message?: string;
  fields?: unknown;
}

const chainOf = (op: SyncOp): string => (op.entity_type === "visit" ? op.entity_id : String(op.payload.visit_id ?? op.entity_id));

function visitRecord(db: Db, id: string) {
  return get<Record<string, unknown>>(db, "SELECT * FROM visits WHERE id = ?", id);
}
function observationRecord(db: Db, id: string) {
  return get<Record<string, unknown>>(db, "SELECT * FROM observations WHERE id = ?", id);
}
function commitmentRecord(db: Db, id: string) {
  return get<Record<string, unknown>>(db, "SELECT * FROM commitments WHERE id = ?", id);
}
const RECORD = { visit: visitRecord, observation: observationRecord, commitment: commitmentRecord } as const;

function execute(db: Db, actor: Actor, op: SyncOp): void {
  const withExpected = { ...op.payload, expected_updated_at: op.expected_updated_at };
  switch (`${op.entity_type}.${op.op}`) {
    case "visit.create":
      createVisit(db, actor, { ...op.payload, save_as: "planned" }, { id: op.entity_id });
      return;
    case "visit.update":
      updateVisit(db, actor, op.entity_id, withExpected);
      return;
    case "visit.transition":
      transitionVisit(db, actor, op.entity_id, z.enum(["draft", "planned", "in_progress", "pending_review"]).parse(op.payload.to) as VisitStatus);
      return;
    case "observation.create":
      addObservation(db, actor, String(op.payload.visit_id ?? ""), op.payload, { id: op.entity_id });
      return;
    case "observation.update":
      updateObservation(db, actor, op.entity_id, withExpected);
      return;
    case "observation.delete":
      deleteObservation(db, actor, op.entity_id);
      return;
    case "commitment.create":
      createCommitment(db, actor, op.payload, { id: op.entity_id, mentorAgreed: true });
      return;
    case "commitment.update":
      updateCommitment(db, actor, op.entity_id, withExpected);
      return;
    default:
      throw new AppError(422, "unsupported_operation", `Unsupported operation ${op.entity_type}.${op.op}`);
  }
}

function classify(err: unknown): { kind: "conflict" | "rejected" | "error"; code: string; message: string; fields?: unknown } {
  if (err instanceof z.ZodError) return { kind: "rejected", code: "validation_failed", message: "Some fields are not valid", fields: err.flatten().fieldErrors };
  if (err instanceof AppError) {
    if (err.status === 409 && err.code === "stale_edit") return { kind: "conflict", code: err.code, message: err.message };
    if (err.status >= 400 && err.status < 500) return { kind: "rejected", code: err.code, message: err.message, fields: err.details };
    return { kind: "error", code: err.code, message: "Temporary server problem" };
  }
  const e = err as { code?: string; errcode?: number; message?: string };
  if (e?.code === "ERR_SQLITE_ERROR") {
    const lock = e.errcode === 5 || e.errcode === 6 || /locked/i.test(e.message ?? "");
    if (lock) return { kind: "error", code: "db_busy", message: "The database is busy" };
    return { kind: "rejected", code: "conflict", message: "That change conflicts with existing data." }; // constraint (for example a taken id)
  }
  return { kind: "error", code: "internal_error", message: "Something went wrong on the server" };
}

function remember(db: Db, actor: Actor, op: SyncOp, status: "applied" | "rejected", result: SyncResult) {
  run(
    db,
    "INSERT OR IGNORE INTO sync_operations (op_id, actor_id, entity_type, entity_id, op, status, response, created_at) VALUES (?,?,?,?,?,?,?,?)",
    op.op_id, actor.id, op.entity_type, op.entity_id, op.op, status, JSON.stringify(result), nowIso(),
  );
}

/** Apply a batch in order. `accountId` is the account that owns the device's local data; it must be the signed-in actor. */
export function pushOperations(db: Db, actor: Actor, input: unknown): { results: SyncResult[]; server_time: string } {
  requireRole(actor, "visit:write");
  const { account_id, ops } = syncPushSchema.parse(input);
  if (account_id !== actor.id) {
    // Defence in depth: the device refuses this too, but the server must not apply one account's queue under another session.
    throw forbidden("These records belong to a different account. Sign in as that account to sync them.");
  }
  const results: SyncResult[] = [];
  const failedChains = new Set<string>();
  const seenInBatch = new Map<string, SyncResult>();

  for (const op of ops) {
    const base = { op_id: op.op_id, entity_type: op.entity_type, entity_id: op.entity_id };
    const earlier = seenInBatch.get(op.op_id);
    if (earlier) { results.push({ ...earlier, status: "duplicate" }); continue; }

    const prior = get<{ actor_id: string; response: string }>(db, "SELECT actor_id, response FROM sync_operations WHERE op_id = ?", op.op_id);
    if (prior) {
      if (prior.actor_id !== actor.id) {
        results.push({ ...base, status: "rejected", code: "forbidden", message: "Operation id belongs to another account" });
        continue;
      }
      const original = parseJson<SyncResult>(prior.response, { ...base, status: "applied" });
      results.push({ ...original, status: original.status === "applied" ? "duplicate" : original.status });
      continue;
    }

    const chain = chainOf(op);
    if (failedChains.has(chain)) {
      results.push({ ...base, status: "skipped", code: "earlier_operation_failed", message: "An earlier change on this visit was not applied" });
      continue;
    }

    try {
      execute(db, actor, op);
      const rec = op.op === "delete" ? undefined : RECORD[op.entity_type](db, op.entity_id);
      const result: SyncResult = { ...base, status: "applied", server_version: rec ? String(rec.updated_at) : nowIso() };
      remember(db, actor, op, "applied", result);
      seenInBatch.set(op.op_id, result);
      results.push(result);
    } catch (err) {
      const c = classify(err);
      failedChains.add(chain);
      if (c.kind === "conflict") {
        const rec = RECORD[op.entity_type](db, op.entity_id);
        results.push({ ...base, status: "conflict", code: c.code, message: c.message, server_version: rec ? String(rec.updated_at) : undefined, server_record: rec });
      } else if (c.kind === "rejected") {
        const result: SyncResult = { ...base, status: "rejected", code: c.code, message: c.message, fields: c.fields };
        remember(db, actor, op, "rejected", result);
        results.push(result);
      } else {
        results.push({ ...base, status: "error", code: c.code, message: c.message }); // not remembered: the same op may be retried
      }
    }
  }
  const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  audit(db, actor, "sync.pushed", "profile", actor.id, counts);
  return { results, server_time: nowIso() };
}

/**
 * Everything a mentor needs in the field, as one bounded snapshot: assigned schools, their own recent visits with observations
 * and commitments, and the approved practice cards. Nothing about other mentors; nothing that is not already visible to this user online.
 */
export function buildSnapshot(db: Db, actor: Actor) {
  requireRole(actor, "visit:write");
  const account = loadActor(db, actor.id)!;
  const schools = all<Record<string, unknown>>(
    db,
    `SELECT s.id, s.code, s.name, s.state, s.district, s.block, s.cluster
       FROM schools s JOIN school_assignments a ON a.school_id = s.id AND a.profile_id = ? AND a.status = 'active'
      ORDER BY s.name`,
    actor.id,
  );
  const visits = all<Record<string, unknown>>(
    db,
    `SELECT v.id, v.school_id, v.teacher_alias, v.scheduled_at, v.grade, v.subject, v.language, v.purpose, v.coaching_focus, v.prep_notes,
            v.previous_commitment_id, v.observation_method, v.status, v.started_at, v.completed_at, v.created_at, v.updated_at
       FROM visits v WHERE v.mentor_id = ? AND v.school_id IN (SELECT school_id FROM school_assignments WHERE profile_id = ? AND status = 'active')
      ORDER BY v.scheduled_at DESC LIMIT 200`,
    actor.id, actor.id,
  );
  const ids = visits.map((v) => String(v.id));
  const marks = ids.map(() => "?").join(",") || "''";
  const observations = ids.length
    ? all<Record<string, unknown>>(
        db,
        `SELECT id, visit_id, practice_observed, evidence, worked_well, improvement_area, context_note, created_at, updated_at
           FROM observations WHERE visit_id IN (${marks}) ORDER BY created_at`,
        ...ids,
      )
    : [];
  const commitments = ids.length
    ? all<Record<string, unknown>>(
        db,
        `SELECT id, visit_id, feedback_id, action_text, owner_role, owner_alias, target_date, expected_evidence, status, completed_at,
                review_visit_id, review_outcome, review_evidence, review_barriers, reviewed_at, created_at, updated_at
           FROM commitments WHERE visit_id IN (${marks}) ORDER BY created_at`,
        ...ids,
      )
    : [];
  const cards = getApprovedCards(db).map((c) => ({
    id: c.id, version: c.version, title: c.title, domain: c.domain, grade_min: c.grade_min, grade_max: c.grade_max, subject: c.subject,
    description: c.description, steps: c.steps, example_prompts: c.example_prompts, next_step: c.next_step,
    source_title: c.source_title, source_org: c.source_org, origin: c.origin, localized_hi: c.localized.hi ?? null,
  }));
  return {
    server_time: nowIso(),
    account: { id: account.id, display_name: account.displayName, role: account.role, preferred_language: account.preferredLanguage, ui_language: account.uiLanguage },
    schools, visits, observations, commitments, cards,
  };
}
