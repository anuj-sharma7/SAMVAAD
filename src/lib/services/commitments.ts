import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, addDays, daysBetween, isoDate } from "../util";
import { conflict, invalid, notFound } from "../errors";
import { audit } from "./audit";
import { getAuthorizedVisit } from "./access";
import { currentFeedbackInternal } from "./feedback";
import { requireRole } from "../auth/policy";
import { DEFAULT_COMMITMENT_DAYS, DUE_SOON_DAYS } from "../config";
import type { Actor, CommitmentDisplayStatus, CommitmentStatus, ReviewOutcome } from "../types";

/**
 * Commitment lifecycle (stored):  open -> completed -> reviewed   (open/completed -> cancelled)
 * "Due soon" and "overdue" are derived from the target date, so they can never go stale.
 * An unmet commitment is a support signal for the next conversation. It is never a teacher score.
 */
export const COMMITMENT_TRANSITIONS: Record<CommitmentStatus, CommitmentStatus[]> = {
  open: ["completed", "reviewed", "cancelled"],
  completed: ["reviewed", "cancelled"],
  reviewed: [],
  cancelled: [],
};
export const canCommitmentTransition = (from: CommitmentStatus, to: CommitmentStatus) =>
  COMMITMENT_TRANSITIONS[from].includes(to);

export function displayStatus(status: CommitmentStatus, targetDate: string, today = new Date()): CommitmentDisplayStatus {
  if (status !== "open") return status;
  const d = daysBetween(isoDate(today), targetDate);
  if (d < 0) return "overdue";
  if (d <= DUE_SOON_DAYS) return "due_soon";
  return "open";
}

export interface CommitmentRow {
  id: string; visit_id: string; feedback_id: string | null; action_text: string;
  owner_role: "teacher" | "head_teacher" | "mentor"; owner_alias: string; target_date: string;
  expected_evidence: string; status: CommitmentStatus; completed_at: string | null;
  review_visit_id: string | null; review_outcome: ReviewOutcome | null; review_evidence: string | null;
  review_barriers: string | null; review_notes: string | null; reviewed_by: string | null; reviewed_at: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface CommitmentView extends CommitmentRow {
  display_status: CommitmentDisplayStatus;
  days_until_due: number;
  school_id: string;
  school_name: string;
  teacher_alias: string;
  origin_visit_date: string;
}

const BASE = `SELECT c.*, v.school_id, s.name AS school_name, v.teacher_alias, v.scheduled_at AS origin_visit_date
                FROM commitments c JOIN visits v ON v.id = c.visit_id JOIN schools s ON s.id = v.school_id`;

function decorate(r: Omit<CommitmentView, "display_status" | "days_until_due">): CommitmentView {
  return {
    ...r,
    display_status: displayStatus(r.status, r.target_date),
    days_until_due: daysBetween(isoDate(new Date()), r.target_date),
  };
}

export const commitmentFilterSchema = z.object({
  bucket: z.enum(["all", "overdue", "due_soon", "open", "completed", "reviewed"]).default("all"),
  school_id: z.string().optional(),
  visit_id: z.string().optional(),
});

export function listCommitments(db: Db, actor: Actor, rawFilter: unknown = {}): CommitmentView[] {
  requireRole(actor, "visit:read_content");
  const f = commitmentFilterSchema.parse(rawFilter);
  const where = ["v.mentor_id = ?", "c.status <> 'cancelled'"];
  const params: string[] = [actor.id];
  if (f.school_id) { where.push("v.school_id = ?"); params.push(f.school_id); }
  if (f.visit_id) { where.push("c.visit_id = ?"); params.push(f.visit_id); }
  const rows = all<Omit<CommitmentView, "display_status" | "days_until_due">>(
    db, `${BASE} WHERE ${where.join(" AND ")} ORDER BY c.target_date`, ...params,
  ).map(decorate);
  const order = (c: CommitmentView) => (c.display_status === "overdue" ? 0 : c.display_status === "due_soon" ? 1 : 2);
  const filtered = f.bucket === "all" ? rows : rows.filter((r) => r.display_status === f.bucket);
  return filtered.sort((a, b) => order(a) - order(b) || a.target_date.localeCompare(b.target_date));
}

export function getCommitment(db: Db, actor: Actor, id: string): CommitmentView {
  requireRole(actor, "visit:read_content");
  const r = get<Omit<CommitmentView, "display_status" | "days_until_due">>(db, `${BASE} WHERE c.id = ?`, id);
  if (!r) throw notFound("Commitment");
  getAuthorizedVisit(db, actor, r.visit_id, "content");
  return decorate(r);
}

/** E5: propose a commitment from the approved feedback. Pure suggestion; nothing is saved. */
export function suggestCommitment(db: Db, actor: Actor, visitId: string) {
  const visit = getAuthorizedVisit(db, actor, visitId, "content");
  const fb = currentFeedbackInternal(db, visitId);
  if (!fb || fb.status !== "approved" || !fb.next_step) {
    throw conflict("feedback_not_approved", "Approve the feedback card first. A commitment is built from its approved next step.");
  }
  const nextVisit = get<{ scheduled_at: string }>(
    db,
    `SELECT scheduled_at FROM visits WHERE school_id = ? AND mentor_id = ? AND teacher_alias = ? AND id <> ?
        AND status IN ('draft','planned') AND scheduled_at > ? ORDER BY scheduled_at LIMIT 1`,
    visit.school_id, visit.mentor_id, visit.teacher_alias, visit.id, visit.scheduled_at,
  );
  const target = nextVisit ? isoDate(nextVisit.scheduled_at) : isoDate(addDays(visit.scheduled_at, DEFAULT_COMMITMENT_DAYS));
  return {
    action_text: fb.next_step,
    owner_role: "teacher" as const,
    owner_alias: visit.teacher_alias,
    target_date: target,
    expected_evidence: `At the next visit, the mentor looks for: ${fb.next_step}`,
    feedback_id: fb.id,
    target_basis: nextVisit ? "date of the next planned visit" : `${DEFAULT_COMMITMENT_DAYS} days after this visit`,
  };
}

export const createCommitmentSchema = z.object({
  visit_id: z.string().min(1),
  action_text: z.string().trim().min(5, "Describe the agreed action").max(600),
  owner_role: z.enum(["teacher", "head_teacher", "mentor"]).default("teacher"),
  owner_alias: z.string().trim().min(1).max(60).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  expected_evidence: z.string().trim().min(3, "What will the mentor look for?").max(600),
});

export function createCommitment(db: Db, actor: Actor, input: unknown): CommitmentView {
  const d = createCommitmentSchema.parse(input);
  const visit = getAuthorizedVisit(db, actor, d.visit_id, "write");
  if (visit.status === "completed") throw conflict("visit_locked", "Completed visits are read-only");
  const fb = currentFeedbackInternal(db, visit.id);
  if (!fb || fb.status !== "approved") {
    throw conflict("feedback_not_approved", "Approve the feedback card before agreeing a commitment");
  }
  if (get(db, "SELECT 1 AS x FROM commitments WHERE feedback_id = ? AND status <> 'cancelled'", fb.id)) {
    throw conflict("commitment_exists", "A commitment already exists for this feedback card");
  }
  const days = daysBetween(isoDate(visit.scheduled_at), d.target_date);
  if (days < 0) throw invalid("The target date cannot be before the visit date");
  if (days > 180) throw invalid("The target date should be within 180 days of the visit");

  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO commitments (id, visit_id, feedback_id, action_text, owner_role, owner_alias, target_date,
         expected_evidence, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'open', ?,?,?)`,
      id, visit.id, fb.id, d.action_text, d.owner_role, d.owner_alias ?? visit.teacher_alias, d.target_date,
      d.expected_evidence, actor.id, ts, ts,
    );
    audit(db, actor, "commitment.created", "commitment", id, { visit_id: visit.id, target_date: d.target_date });
  });
  return getCommitment(db, actor, id);
}

export const updateCommitmentSchema = z.object({
  action_text: z.string().trim().min(5).max(600).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expected_evidence: z.string().trim().min(3).max(600).optional(),
  status: z.enum(["completed", "cancelled"]).optional(),
});

export function updateCommitment(db: Db, actor: Actor, id: string, input: unknown): CommitmentView {
  const current = getCommitment(db, actor, id);
  getAuthorizedVisit(db, actor, current.visit_id, "write");
  const d = updateCommitmentSchema.parse(input);
  if (current.status === "reviewed" || current.status === "cancelled") {
    throw conflict("commitment_locked", `A ${current.status} commitment can no longer be changed`);
  }
  if (d.status && !canCommitmentTransition(current.status, d.status)) {
    throw conflict("invalid_transition", `Cannot move a commitment from ${current.status} to ${d.status}`);
  }
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `UPDATE commitments SET action_text=COALESCE(?, action_text), target_date=COALESCE(?, target_date),
         expected_evidence=COALESCE(?, expected_evidence), status=COALESCE(?, status),
         completed_at=CASE WHEN ? = 'completed' THEN ? ELSE completed_at END, updated_at=? WHERE id=?`,
      d.action_text ?? null, d.target_date ?? null, d.expected_evidence ?? null, d.status ?? null, d.status ?? "", ts, ts, id,
    );
    audit(db, actor, "commitment.updated", "commitment", id, { to: d.status ?? null, fields: Object.keys(d).join(",") });
  });
  return getCommitment(db, actor, id);
}

export const reviewCommitmentSchema = z
  .object({
    review_visit_id: z.string().min(1),
    outcome: z.enum(["tried_working", "tried_needs_support", "not_tried"]),
    evidence: z.string().trim().max(800).optional().or(z.literal("")),
    barriers: z.string().trim().max(800).optional().or(z.literal("")),
    notes: z.string().trim().max(800).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.outcome !== "not_tried" && !v.evidence) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "Record what you observed as evidence" });
    }
    if (v.outcome !== "tried_working" && !v.barriers) {
      ctx.addIssue({ code: "custom", path: ["barriers"], message: "Note the barriers or the support needed" });
    }
  });

/** Record, during a LATER visit, what happened to an earlier commitment. */
export function reviewCommitment(db: Db, actor: Actor, id: string, input: unknown): CommitmentView {
  const c = getCommitment(db, actor, id);
  const d = reviewCommitmentSchema.parse(input);
  const visit = getAuthorizedVisit(db, actor, d.review_visit_id, "write");
  if (!canCommitmentTransition(c.status, "reviewed")) {
    throw conflict("invalid_transition", `A ${c.status} commitment cannot be reviewed`);
  }
  if (visit.school_id !== c.school_id) throw invalid("The review visit must be at the same school as the commitment");
  if (visit.id === c.visit_id) throw invalid("A commitment is reviewed at a later visit, not the visit that created it");
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict("visit_not_observable", "Start the follow-up visit before recording the review");
  }
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `UPDATE commitments SET status='reviewed', review_visit_id=?, review_outcome=?, review_evidence=?, review_barriers=?,
         review_notes=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`,
      visit.id, d.outcome, d.evidence || null, d.barriers || null, d.notes || null, actor.id, ts, ts, id,
    );
    audit(db, actor, "commitment.reviewed", "commitment", id, { review_visit_id: visit.id, outcome: d.outcome });
  });
  return getCommitment(db, actor, id);
}
