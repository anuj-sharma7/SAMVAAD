import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso } from "../util";
import { conflict, forbidden, invalid } from "../errors";
import { requireRole } from "../auth/policy";
import { audit } from "./audit";
import { getAuthorizedVisit, isActivelyAssigned } from "./access";
import type { Actor, VisitRow, VisitStatus, SchoolRow } from "../types";

export const SUBJECTS = ["Hindi", "English", "Mathematics", "EVS"] as const;
export const VISIT_PURPOSES = [
  "Routine academic support visit",
  "Follow-up on a previous coaching commitment",
  "FLN practice observation",
  "New teacher support",
] as const;

/**
 * Lifecycle: Draft -> Planned -> In Progress -> Pending Review -> Completed.
 * "completed" is NOT reachable through a plain transition: it only happens when the mentor
 * finalizes the visit report (which itself requires an approved feedback card). That is how
 * mandatory mentor review cannot be bypassed.
 */
export const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  draft: ["planned"],
  planned: ["in_progress", "draft"],
  in_progress: ["pending_review"],
  pending_review: ["in_progress"],
  completed: [],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const createVisitSchema = z.object({
  school_id: z.string().min(1),
  teacher_alias: z
    .string()
    .trim()
    .min(1, "Enter a teacher alias, e.g. T-101")
    .max(60)
    .regex(/^[\p{L}\p{N} .\-_]+$/u, "Use a short alias; avoid personal details"),
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time"),
  grade: z.coerce.number().int().min(1).max(8),
  subject: z.enum(SUBJECTS),
  language: z.enum(["en", "hi"]).default("hi"),
  purpose: z.string().trim().min(3, "Select or describe the purpose").max(200),
  coaching_focus: z.string().trim().max(300).optional().or(z.literal("")),
  prep_notes: z.string().trim().max(1000).optional().or(z.literal("")),
  previous_commitment_id: z.string().optional().or(z.literal("")),
  observation_method: z.enum(["text", "checklist"]).default("text"),
  save_as: z.enum(["draft", "planned"]).default("planned"),
});
export type CreateVisitInput = z.infer<typeof createVisitSchema>;

export const updateVisitSchema = createVisitSchema
  .omit({ school_id: true, save_as: true })
  .partial();

const blankToNull = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

function assertSaneDate(iso: string) {
  const t = Date.parse(iso);
  const now = Date.now();
  if (t < now - 366 * 86_400_000 || t > now + 366 * 86_400_000) {
    throw invalid("Visit date must be within a year of today");
  }
}

/** The unresolved commitment (open or completed-but-not-yet-reviewed) a new visit should follow up on. */
export function findPendingCommitment(db: Db, schoolId: string, mentorId: string, teacherAlias: string) {
  return get<{ id: string; action_text: string; target_date: string; status: string; visit_id: string }>(
    db,
    `SELECT c.id, c.action_text, c.target_date, c.status, c.visit_id
       FROM commitments c JOIN visits v ON v.id = c.visit_id
      WHERE v.school_id = ? AND v.mentor_id = ? AND v.teacher_alias = ?
        AND c.status IN ('open','completed')
      ORDER BY c.created_at DESC LIMIT 1`,
    schoolId,
    mentorId,
    teacherAlias,
  );
}

export function createVisit(db: Db, actor: Actor, input: unknown): VisitRow {
  requireRole(actor, "visit:create");
  const data = createVisitSchema.parse(input);
  assertSaneDate(data.scheduled_at);
  if (!isActivelyAssigned(db, actor.id, data.school_id)) {
    throw forbidden("You are not assigned to this school");
  }

  let previousId = blankToNull(data.previous_commitment_id);
  if (previousId) {
    const prev = get<{ school_id: string; mentor_id: string; teacher_alias: string }>(
      db,
      `SELECT v.school_id, v.mentor_id, v.teacher_alias FROM commitments c
         JOIN visits v ON v.id = c.visit_id WHERE c.id = ?`,
      previousId,
    );
    if (!prev || prev.mentor_id !== actor.id || prev.school_id !== data.school_id) {
      throw invalid("The selected previous commitment does not belong to this school and mentor");
    }
  } else {
    previousId = findPendingCommitment(db, data.school_id, actor.id, data.teacher_alias)?.id ?? null;
  }

  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO visits (id, school_id, mentor_id, teacher_alias, scheduled_at, grade, subject, language,
         purpose, coaching_focus, prep_notes, previous_commitment_id, observation_method, audio_consent,
         status, is_demo, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'not_requested', ?, ?, ?, ?)`,
      id, data.school_id, actor.id, data.teacher_alias, data.scheduled_at, data.grade, data.subject,
      data.language, data.purpose, blankToNull(data.coaching_focus), blankToNull(data.prep_notes),
      previousId, data.observation_method, data.save_as,
      get<SchoolRow>(db, "SELECT is_demo FROM schools WHERE id = ?", data.school_id)?.is_demo ?? 1,
      ts, ts,
    );
    audit(db, actor, "visit.created", "visit", id, { school_id: data.school_id, status: data.save_as });
  });
  return get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", id)!;
}

export function updateVisit(db: Db, actor: Actor, visitId: string, input: unknown): VisitRow {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  const patch = updateVisitSchema.parse(input);
  const planningOnly = ["teacher_alias", "scheduled_at", "grade", "subject", "language", "purpose", "observation_method"];
  if (visit.status !== "draft" && visit.status !== "planned") {
    const touched = Object.keys(patch).filter((k) => planningOnly.includes(k));
    if (touched.length) {
      throw conflict("visit_locked", `Visit details cannot be changed once it is ${visit.status.replace("_", " ")}`);
    }
  }
  if (visit.status === "completed") throw conflict("visit_locked", "Completed visits are read-only");
  if (patch.scheduled_at) assertSaneDate(patch.scheduled_at);

  const next = { ...visit, ...patch } as VisitRow & typeof patch;
  transaction(db, () => {
    run(
      db,
      `UPDATE visits SET teacher_alias=?, scheduled_at=?, grade=?, subject=?, language=?, purpose=?,
         coaching_focus=?, prep_notes=?, observation_method=?, updated_at=? WHERE id=?`,
      next.teacher_alias, next.scheduled_at, next.grade, next.subject, next.language, next.purpose,
      blankToNull(next.coaching_focus), blankToNull(next.prep_notes), next.observation_method,
      nowIso(), visitId,
    );
    audit(db, actor, "visit.updated", "visit", visitId, { fields: Object.keys(patch) });
  });
  return get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId)!;
}

export function transitionVisit(db: Db, actor: Actor, visitId: string, to: VisitStatus): VisitRow {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  if (to === "completed") {
    throw conflict(
      "completion_requires_report",
      "A visit is completed by finalizing its report after the mentor has approved the feedback.",
    );
  }
  if (!canTransition(visit.status, to)) {
    throw conflict("invalid_transition", `Cannot move a visit from ${visit.status} to ${to}`);
  }
  if (to === "pending_review") {
    const n = get<{ n: number }>(db, "SELECT count(*) AS n FROM observations WHERE visit_id = ?", visitId)!.n;
    if (n === 0) throw conflict("no_observations", "Add at least one observation before sending the visit for review");
  }
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `UPDATE visits SET status = ?, started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN ? ELSE started_at END,
         updated_at = ? WHERE id = ?`,
      to, to, ts, ts, visitId,
    );
    audit(db, actor, "visit.transitioned", "visit", visitId, { from: visit.status, to });
  });
  return get<VisitRow>(db, "SELECT * FROM visits WHERE id = ?", visitId)!;
}

/** Used by the report service once feedback is approved and the report is finalized. */
export function markVisitCompleted(db: Db, visitId: string) {
  const ts = nowIso();
  run(db, "UPDATE visits SET status='completed', completed_at=?, updated_at=? WHERE id=?", ts, ts, visitId);
}

export const visitFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["draft", "planned", "in_progress", "pending_review", "completed"]).optional(),
  school_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export interface VisitListItem extends VisitRow {
  school_name: string;
  school_code: string;
  mentor_name: string;
  has_approved_feedback: number;
  has_pending_feedback: number;
}

export function listVisits(db: Db, actor: Actor, rawFilter: unknown = {}) {
  // Visit lists are for mentors (their own) and supervisors (masked metadata). Library curators have no business here.
  if (actor.role !== "mentor" && actor.role !== "supervisor") throw forbidden("Your role cannot list visits");
  const f = visitFilterSchema.parse(rawFilter);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (actor.role === "mentor") {
    where.push("v.mentor_id = ?");
    params.push(actor.id);
    where.push("v.school_id IN (SELECT school_id FROM school_assignments WHERE profile_id = ? AND status = 'active')");
    params.push(actor.id);
  }
  if (f.status) { where.push("v.status = ?"); params.push(f.status); }
  if (f.school_id) { where.push("v.school_id = ?"); params.push(f.school_id); }
  if (f.from) { where.push("v.scheduled_at >= ?"); params.push(f.from); }
  if (f.to) { where.push("v.scheduled_at <= ?"); params.push(f.to); }
  if (f.q) {
    where.push("(s.name LIKE ? OR v.teacher_alias LIKE ? OR v.subject LIKE ?)");
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = get<{ n: number }>(
    db,
    `SELECT count(*) AS n FROM visits v JOIN schools s ON s.id = v.school_id ${w}`,
    ...params,
  )!.n;
  const rows = all<VisitListItem>(
    db,
    `SELECT v.*, s.name AS school_name, s.code AS school_code, p.display_name AS mentor_name,
        EXISTS(SELECT 1 FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status = 'approved') AS has_approved_feedback,
        EXISTS(SELECT 1 FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status IN ('draft','edited')) AS has_pending_feedback
       FROM visits v JOIN schools s ON s.id = v.school_id JOIN profiles p ON p.id = v.mentor_id
       ${w} ORDER BY v.scheduled_at DESC LIMIT ? OFFSET ?`,
    ...params,
    f.pageSize,
    (f.page - 1) * f.pageSize,
  );
  // Supervisors see operational metadata only: mask the teacher alias and free-text fields.
  const items =
    actor.role === "supervisor"
      ? rows.map((r) => ({ ...r, teacher_alias: "—", coaching_focus: null, prep_notes: null, purpose: "—" }))
      : rows;
  return { items, total, page: f.page, pageSize: f.pageSize };
}

export function getVisitDetail(db: Db, actor: Actor, visitId: string) {
  const visit = getAuthorizedVisit(db, actor, visitId, "content");
  const school = get<SchoolRow>(db, "SELECT * FROM schools WHERE id = ?", visit.school_id)!;
  const mentor = get<{ display_name: string }>(db, "SELECT display_name FROM profiles WHERE id = ?", visit.mentor_id)!;
  const previous = visit.previous_commitment_id
    ? get<{
        id: string; action_text: string; target_date: string; status: string; visit_id: string;
        expected_evidence: string; review_outcome: string | null;
      }>(
        db,
        "SELECT id, action_text, target_date, status, visit_id, expected_evidence, review_outcome FROM commitments WHERE id = ?",
        visit.previous_commitment_id,
      )
    : undefined;
  const counts = get<{ obs: number }>(db, "SELECT count(*) AS obs FROM observations WHERE visit_id = ?", visitId)!;
  return { visit, school, mentorName: mentor.display_name, previousCommitment: previous ?? null, observationCount: counts.obs };
}

/** Which workflow stage a visit is in, for the Plan -> Observe -> Coach -> Demonstrate -> Follow up indicator. */
export type Stage = "plan" | "observe" | "coach" | "demonstrate" | "follow_up";
export const STAGES: Stage[] = ["plan", "observe", "coach", "demonstrate", "follow_up"];

export function visitProgress(db: Db, visit: VisitRow) {
  const obs = get<{ n: number }>(db, "SELECT count(*) AS n FROM observations WHERE visit_id = ?", visit.id)!.n;
  const fb = get<{ status: string }>(
    db,
    "SELECT status FROM feedback_drafts WHERE visit_id = ? AND status IN ('draft','edited','approved','insufficient_evidence')",
    visit.id,
  );
  const demo = get<{ status: string }>(
    db,
    "SELECT status FROM demonstration_scripts WHERE visit_id = ? AND status IN ('draft','edited','approved')",
    visit.id,
  );
  const commit = get<{ n: number }>(db, "SELECT count(*) AS n FROM commitments WHERE visit_id = ? AND status <> 'cancelled'", visit.id)!.n;
  const done: Record<Stage, boolean> = {
    plan: visit.status !== "draft",
    observe: obs > 0,
    coach: fb?.status === "approved",
    demonstrate: demo?.status === "approved",
    follow_up: commit > 0,
  };
  const current = STAGES.find((s) => !done[s]) ?? "follow_up";
  return { done, current, observationCount: obs, feedbackStatus: fb?.status ?? null, demoStatus: demo?.status ?? null };
}
