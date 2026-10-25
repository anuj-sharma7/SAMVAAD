import { all, get, type Db } from "../db/client";
import { isoDate, addDays, daysBetween } from "../util";
import { MIN_GROUP_SIZE, requireRole } from "../auth/policy";
import { rulePrioritiser, type PriorityInput, type PriorityItem } from "../engines/prioritizer";
import { getPriorityRules } from "./settings";
import { listCommitments, type CommitmentView } from "./commitments";
import { listAudit } from "./audit";
import { listSchools } from "./schools";
import type { Actor } from "../types";

// ---- Mentor: prioritised schools ------------------------------------------------------------

export function getPriorities(db: Db, actor: Actor): PriorityItem[] {
  requireRole(actor, "visit:read_content");
  const schools = all<{ id: string; name: string }>(
    db,
    `SELECT s.id, s.name FROM schools s JOIN school_assignments a ON a.school_id = s.id
      WHERE a.profile_id = ? AND a.status = 'active'`,
    actor.id,
  );
  const today = isoDate(new Date());
  const inputs: PriorityInput[] = schools.map((s) => ({
    schoolId: s.id,
    schoolName: s.name,
    lastCompletedAt:
      get<{ d: string | null }>(db, "SELECT max(scheduled_at) AS d FROM visits WHERE school_id = ? AND mentor_id = ? AND status = 'completed'", s.id, actor.id)?.d ?? null,
    nextVisit:
      get<{ id: string; scheduled_at: string; status: string }>(
        db,
        `SELECT id, scheduled_at, status FROM visits WHERE school_id = ? AND mentor_id = ?
          AND status IN ('draft','planned','in_progress') AND substr(scheduled_at,1,10) >= ? ORDER BY scheduled_at LIMIT 1`,
        s.id, actor.id, today,
      ) ?? null,
    commitments: all<{ id: string; action_text: string; target_date: string; status: "open" | "completed" }>(
      db,
      `SELECT c.id, c.action_text, c.target_date, c.status FROM commitments c JOIN visits v ON v.id = c.visit_id
        WHERE v.school_id = ? AND v.mentor_id = ? AND c.status IN ('open','completed')`,
      s.id, actor.id,
    ),
  }));
  return rulePrioritiser(inputs, getPriorityRules(db));
}

// ---- Aggregate analytics (supervisor) -------------------------------------------------------

export interface PracticeAreaRow {
  domain: string;
  suppressed: boolean;
  /** Distinct teachers; null when the group is smaller than the minimum group size. */
  teachers: number | null;
}

/**
 * Practice areas tagged in observations, by domain, as DISTINCT TEACHER counts.
 * Groups smaller than MIN_GROUP_SIZE are suppressed entirely (no count, no names).
 * Teacher identities, observation text and school names are never returned.
 */
export function practiceGaps(db: Db, actor: Actor) {
  requireRole(actor, "analytics:read");
  const rows = all<{ domain: string; teachers: number }>(
    db,
    `SELECT r.domain, count(DISTINCT v.teacher_alias || '|' || v.school_id) AS teachers
       FROM observation_tags t
       JOIN rubric_tags r ON r.code = t.tag_code
       JOIN observations o ON o.id = t.observation_id
       JOIN visits v ON v.id = o.visit_id
      WHERE t.confirmed = 1 GROUP BY r.domain ORDER BY teachers DESC`,
  );
  const areas: PracticeAreaRow[] = rows.map((r) =>
    r.teachers >= MIN_GROUP_SIZE
      ? { domain: r.domain, suppressed: false, teachers: r.teachers }
      : { domain: r.domain, suppressed: true, teachers: null },
  );
  return { minGroupSize: MIN_GROUP_SIZE, areas };
}

// ---- Dashboards -----------------------------------------------------------------------------

export const PILOT_TARGETS = [
  { id: "kappa", label: "Observation-tag agreement with a DIET expert (Phase 0)", target: "Cohen’s κ ≥ 0.6 on rubric items" },
  { id: "usable", label: "AI drafts usable with minor edits (Phase 0)", target: "≥ 70% of drafts" },
  { id: "next_step", label: "Visits ending in a written, specific next step", target: "≥ 80% of visits" },
  { id: "followup", label: "Follow-ups checked at the next visit", target: "≥ 60%" },
  { id: "time", label: "Mentor time on reporting per visit", target: "−30% vs comparison group" },
  { id: "uptake", label: "Teachers reporting they acted on feedback", target: "+15 percentage points vs comparison" },
  { id: "practice", label: "Observed teaching-practice change", target: "≥ the minimum detectable effect (0.30 SD) vs comparison" },
  { id: "privacy", label: "Privacy incidents / teacher-score exposure", target: "Zero (hard stop)" },
] as const;

export interface MentorDashboard {
  kind: "mentor";
  counts: {
    visits_planned: number; visits_in_progress: number; visits_completed: number;
    feedback_awaiting_approval: number; followups_due_soon: number; followups_overdue: number;
    schools_assigned: number;
  };
  upcoming: { id: string; school_name: string; scheduled_at: string; grade: number; subject: string; status: string; teacher_alias: string }[];
  followupQueue: CommitmentView[];
  recentVisits: { id: string; school_name: string; scheduled_at: string; status: string; subject: string; grade: number }[];
  priorities: PriorityItem[];
  activity: { at: string; action: string; resource_type: string }[];
  workflow: { observed: number; feedback_approved: number; demos_approved: number; commitments_agreed: number; commitments_reviewed: number };
  coverage: { id: string; name: string; last_visit_at: string | null; open_followups: number; days_since: number | null }[];
}

export function getMentorDashboard(db: Db, actor: Actor): MentorDashboard {
  const n = (sql: string, ...p: string[]) => get<{ n: number }>(db, sql, ...p)!.n;
  const commitments = listCommitments(db, actor);
  const today = isoDate(new Date());
  const horizon = isoDate(addDays(new Date(), 60));
  return {
    kind: "mentor",
    counts: {
      visits_planned: n("SELECT count(*) AS n FROM visits WHERE mentor_id = ? AND status IN ('draft','planned') AND substr(scheduled_at,1,10) >= ?", actor.id, today),
      visits_in_progress: n("SELECT count(*) AS n FROM visits WHERE mentor_id = ? AND status IN ('in_progress','pending_review')", actor.id),
      visits_completed: n("SELECT count(*) AS n FROM visits WHERE mentor_id = ? AND status = 'completed'", actor.id),
      feedback_awaiting_approval: n(
        `SELECT count(*) AS n FROM feedback_drafts f JOIN visits v ON v.id = f.visit_id
          WHERE v.mentor_id = ? AND f.status IN ('draft','edited')`, actor.id),
      followups_due_soon: commitments.filter((c) => c.display_status === "due_soon").length,
      followups_overdue: commitments.filter((c) => c.display_status === "overdue").length,
      schools_assigned: n("SELECT count(*) AS n FROM school_assignments WHERE profile_id = ? AND status = 'active'", actor.id),
    },
    upcoming: all(
      db,
      `SELECT v.id, s.name AS school_name, v.scheduled_at, v.grade, v.subject, v.status, v.teacher_alias
         FROM visits v JOIN schools s ON s.id = v.school_id
        WHERE v.mentor_id = ? AND v.status IN ('draft','planned','in_progress','pending_review')
          AND substr(v.scheduled_at,1,10) <= ? ORDER BY v.scheduled_at LIMIT 5`,
      actor.id, horizon,
    ),
    followupQueue: commitments.filter((c) => ["overdue", "due_soon"].includes(c.display_status) || c.status === "completed").slice(0, 6),
    recentVisits: all(
      db,
      `SELECT v.id, s.name AS school_name, v.scheduled_at, v.status, v.subject, v.grade
         FROM visits v JOIN schools s ON s.id = v.school_id WHERE v.mentor_id = ? ORDER BY v.updated_at DESC LIMIT 5`,
      actor.id,
    ),
    priorities: getPriorities(db, actor).slice(0, 4),
    activity: listAudit(db, actor, { limit: 8 }).map((a) => ({ at: a.at, action: a.action, resource_type: a.resource_type })),
    workflow: {
      observed: n("SELECT count(DISTINCT o.visit_id) AS n FROM observations o JOIN visits v ON v.id = o.visit_id WHERE v.mentor_id = ?", actor.id),
      feedback_approved: n("SELECT count(*) AS n FROM feedback_drafts f JOIN visits v ON v.id = f.visit_id WHERE v.mentor_id = ? AND f.status = 'approved'", actor.id),
      demos_approved: n("SELECT count(*) AS n FROM demonstration_scripts d JOIN visits v ON v.id = d.visit_id WHERE v.mentor_id = ? AND d.status = 'approved'", actor.id),
      commitments_agreed: n("SELECT count(*) AS n FROM commitments c JOIN visits v ON v.id = c.visit_id WHERE v.mentor_id = ? AND c.status <> 'cancelled'", actor.id),
      commitments_reviewed: n("SELECT count(*) AS n FROM commitments c JOIN visits v ON v.id = c.visit_id WHERE v.mentor_id = ? AND c.status = 'reviewed'", actor.id),
    },
    coverage: listSchools(db, actor, { pageSize: 50 }).items.map((s) => ({ id: s.id, name: s.name, last_visit_at: s.last_visit_at, open_followups: s.open_followups, days_since: s.last_visit_at ? Math.max(0, daysBetween(s.last_visit_at, new Date())) : null })),
  };
}

export interface SupervisorDashboard {
  kind: "supervisor";
  schools: number;
  visitsByStatus: Record<string, number>;
  overdueFollowups: number;
  gaps: ReturnType<typeof practiceGaps>;
}

export function getSupervisorDashboard(db: Db, actor: Actor): SupervisorDashboard {
  requireRole(actor, "analytics:read");
  const byStatus: Record<string, number> = {};
  for (const r of all<{ status: string; n: number }>(db, "SELECT status, count(*) AS n FROM visits GROUP BY status")) {
    byStatus[r.status] = r.n;
  }
  return {
    kind: "supervisor",
    schools: get<{ n: number }>(db, "SELECT count(*) AS n FROM schools")!.n,
    visitsByStatus: byStatus,
    overdueFollowups: get<{ n: number }>(db, "SELECT count(*) AS n FROM commitments WHERE status = 'open' AND target_date < ?", isoDate(new Date()))!.n,
    gaps: practiceGaps(db, actor),
  };
}

export interface AdminDashboard {
  kind: "diet_admin";
  cards: Record<string, number>;
  pending: { id: string; title: string; version: number; updated_at: string }[];
}

export function getAdminDashboard(db: Db): AdminDashboard {
  const cards: Record<string, number> = {};
  for (const r of all<{ approval_status: string; n: number }>(db, "SELECT approval_status, count(*) AS n FROM practice_cards GROUP BY approval_status")) {
    cards[r.approval_status] = r.n;
  }
  return {
    kind: "diet_admin",
    cards,
    pending: all(db, "SELECT id, title, version, updated_at FROM practice_cards WHERE approval_status = 'draft' ORDER BY updated_at DESC"),
  };
}

export function getDashboard(db: Db, actor: Actor): MentorDashboard | SupervisorDashboard | AdminDashboard {
  if (actor.role === "mentor") return getMentorDashboard(db, actor);
  if (actor.role === "supervisor") return getSupervisorDashboard(db, actor);
  return getAdminDashboard(db);
}
