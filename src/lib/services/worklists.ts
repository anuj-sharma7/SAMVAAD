import { all, type Db } from "../db/client";
import { requireRole } from "../auth/policy";
import type { Actor } from "../types";

export interface WorklistRow {
  visit_id: string;
  school_name: string;
  scheduled_at: string;
  grade: number;
  subject: string;
  teacher_alias: string;
  visit_status: string;
  feedback_status: string | null;
  feedback_simulated: number | null;
  demo_status: string | null;
  observation_count: number;
}

/** One row per mentor visit with the status of its feedback card and demonstration. Powers /feedback and /demonstrate. */
export function visitWorklist(db: Db, actor: Actor): WorklistRow[] {
  requireRole(actor, "visit:read_content");
  return all<WorklistRow>(
    db,
    `SELECT v.id AS visit_id, s.name AS school_name, v.scheduled_at, v.grade, v.subject, v.teacher_alias, v.status AS visit_status,
        (SELECT f.status FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status IN ('draft','edited','approved','insufficient_evidence')) AS feedback_status,
        (SELECT f.is_simulated FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status IN ('draft','edited','approved','insufficient_evidence')) AS feedback_simulated,
        (SELECT d.status FROM demonstration_scripts d WHERE d.visit_id = v.id AND d.status IN ('draft','edited','approved')) AS demo_status,
        (SELECT count(*) FROM observations o WHERE o.visit_id = v.id) AS observation_count
       FROM visits v JOIN schools s ON s.id = v.school_id
      WHERE v.mentor_id = ? AND v.status IN ('in_progress','pending_review','completed')
      ORDER BY v.scheduled_at DESC`,
    actor.id,
  );
}
