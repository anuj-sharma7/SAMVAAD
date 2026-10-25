import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, parseJson, isoDate } from "../util";
import { conflict, notFound } from "../errors";
import { audit } from "./audit";
import { assertNotStale, getAuthorizedVisit } from "./access";
import { currentFeedbackInternal } from "./feedback";
import { currentDemoInternal } from "./demonstrations";
import { markVisitCompleted } from "./visits";
import { requireRole } from "../auth/policy";
import type { Actor, Citation, SchoolRow, VisitRow } from "../types";

/** Which parts of the report came from whom. Shown in the UI so AI-drafted text is never passed off as mentor-written. */
export type Provenance = "mentor_authored" | "ai_drafted_mentor_approved" | "ai_drafted_mentor_edited_approved" | "system_generated_from_records";

export interface ReportSnapshot {
  visit: {
    id: string; date: string; school: Pick<SchoolRow, "name" | "code" | "block" | "district" | "state">;
    grade: number; subject: string; language: string; purpose: string; coaching_focus: string | null;
    teacher_alias: string; mentor_name: string; observation_method: string;
  };
  observations: {
    practice_observed: string; evidence: string; worked_well: string | null; improvement_area: string | null;
    confirmed_tags: { code: string; label: string }[];
  }[];
  feedback: null | {
    strength: string; priority_practice: string; next_step: string;
    coaching_questions: { ask: string | null; describe: string | null; ask_again: string | null };
    language: string; simulated: boolean; mentor_edited: boolean; approved_by: string | null; approved_at: string | null;
    provenance: Provenance; citations: Citation[];
  };
  demonstration: null | { objective: string; card_title: string; status: string; simulated: boolean; approved_at: string | null };
  commitment: null | { action_text: string; owner: string; target_date: string; expected_evidence: string; status: string };
  previous_commitment_review: null | {
    action_text: string; target_date: string; outcome: string; evidence: string | null; barriers: string | null;
  };
  sections: Record<string, Provenance>;
}

export interface ReportView {
  id: string; visit_id: string; status: "draft" | "finalized"; snapshot: ReportSnapshot; mentor_summary: string;
  summary_origin: "system_draft" | "mentor_edited"; generated_at: string; reviewed_by: string | null;
  finalized_at: string | null; updated_at: string;
}

interface ReportRaw extends Omit<ReportView, "snapshot"> { snapshot: string }
const mapReport = (r: ReportRaw): ReportView => ({ ...r, snapshot: parseJson<ReportSnapshot>(r.snapshot, null as never) });

const name = (db: Db, id: string | null) =>
  id ? (get<{ display_name: string }>(db, "SELECT display_name FROM profiles WHERE id = ?", id)?.display_name ?? null) : null;

/** E5 (deterministic): every factual field is copied from stored records. */
export function buildSnapshot(db: Db, visit: VisitRow): ReportSnapshot {
  const school = get<SchoolRow>(db, "SELECT * FROM schools WHERE id = ?", visit.school_id)!;
  const obs = all<{ id: string; practice_observed: string; evidence: string; worked_well: string | null; improvement_area: string | null }>(
    db, "SELECT * FROM observations WHERE visit_id = ? ORDER BY created_at", visit.id,
  );
  const fb = currentFeedbackInternal(db, visit.id);
  const demo = currentDemoInternal(db, visit.id);
  const c = get<{ action_text: string; owner_alias: string; target_date: string; expected_evidence: string; status: string }>(
    db, "SELECT * FROM commitments WHERE visit_id = ? AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1", visit.id,
  );
  const review = get<{ action_text: string; target_date: string; review_outcome: string; review_evidence: string | null; review_barriers: string | null }>(
    db, "SELECT * FROM commitments WHERE review_visit_id = ? ORDER BY reviewed_at DESC LIMIT 1", visit.id,
  );
  const approved = fb?.status === "approved";
  const fbProv: Provenance = fb?.mentor_edited ? "ai_drafted_mentor_edited_approved" : "ai_drafted_mentor_approved";

  return {
    visit: {
      id: visit.id, date: visit.scheduled_at, school: { name: school.name, code: school.code, block: school.block, district: school.district, state: school.state },
      grade: visit.grade, subject: visit.subject, language: visit.language, purpose: visit.purpose,
      coaching_focus: visit.coaching_focus, teacher_alias: visit.teacher_alias,
      mentor_name: name(db, visit.mentor_id) ?? "", observation_method: visit.observation_method,
    },
    observations: obs.map((o) => ({
      practice_observed: o.practice_observed, evidence: o.evidence, worked_well: o.worked_well, improvement_area: o.improvement_area,
      confirmed_tags: all<{ code: string; label: string }>(
        db, `SELECT t.tag_code AS code, r.label FROM observation_tags t JOIN rubric_tags r ON r.code = t.tag_code
              WHERE t.observation_id = ? AND t.confirmed = 1`, o.id,
      ),
    })),
    feedback: approved && fb
      ? {
          strength: fb.strength!, priority_practice: fb.priority_practice!, next_step: fb.next_step!,
          coaching_questions: { ask: fb.ask_question, describe: fb.describe_statement, ask_again: fb.ask_again_question },
          language: fb.language, simulated: fb.is_simulated, mentor_edited: fb.mentor_edited,
          approved_by: name(db, fb.approved_by), approved_at: fb.approved_at, provenance: fbProv, citations: fb.citations,
        }
      : null,
    demonstration: demo && demo.status === "approved"
      ? { objective: demo.objective, card_title: demo.source.card_title, status: demo.status, simulated: demo.is_simulated, approved_at: demo.approved_at }
      : null,
    commitment: c ? { action_text: c.action_text, owner: c.owner_alias, target_date: c.target_date, expected_evidence: c.expected_evidence, status: c.status } : null,
    previous_commitment_review: review
      ? { action_text: review.action_text, target_date: review.target_date, outcome: review.review_outcome, evidence: review.review_evidence, barriers: review.review_barriers }
      : null,
    sections: {
      visit_details: "system_generated_from_records",
      observations: "mentor_authored",
      feedback: approved ? fbProv : "system_generated_from_records",
      commitment: "mentor_authored",
    },
  };
}

const OUTCOME_TEXT: Record<string, string> = {
  tried_working: "was tried and is working",
  tried_needs_support: "was tried; the teacher needs more support",
  not_tried: "was not yet tried",
};

/** System-written starting text for the mentor's summary. The mentor reviews and may rewrite it. */
export function draftSummary(s: ReportSnapshot): string {
  const date = isoDate(s.visit.date);
  const lines: string[] = [
    `On ${date}, a Grade ${s.visit.grade} ${s.visit.subject} lesson was observed at ${s.visit.school.name} (${s.observations.length} observation${s.observations.length === 1 ? "" : "s"} recorded).`,
  ];
  if (s.previous_commitment_review) {
    const r = s.previous_commitment_review;
    lines.push(`Follow-up on the earlier agreed action ("${r.action_text}"): it ${OUTCOME_TEXT[r.outcome] ?? r.outcome}.`);
  }
  if (s.feedback) {
    lines.push(`Strength noted: ${s.feedback.strength}`);
    lines.push(`Priority practice: ${s.feedback.priority_practice}`);
    lines.push(`Agreed next step: ${s.feedback.next_step}`);
  }
  if (s.commitment) lines.push(`To be reviewed by ${s.commitment.target_date}: ${s.commitment.expected_evidence}`);
  return lines.join("\n");
}

function loadReport(db: Db, visitId: string): ReportView | null {
  const r = get<ReportRaw>(db, "SELECT * FROM visit_reports WHERE visit_id = ?", visitId);
  return r ? mapReport(r) : null;
}

export function getReport(db: Db, actor: Actor, visitId: string): ReportView | null {
  getAuthorizedVisit(db, actor, visitId, "content");
  return loadReport(db, visitId);
}

/** Create the draft report, or refresh its snapshot from current records. Finalized reports are frozen. */
export function generateReport(db: Db, actor: Actor, visitId: string): ReportView {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  const existing = loadReport(db, visitId);
  if (existing?.status === "finalized") throw conflict("report_finalized", "This report is finalized and can no longer be regenerated");
  if (visit.status === "draft" || visit.status === "planned") {
    throw conflict("visit_not_started", "Start the visit and record observations before preparing a report");
  }
  const snapshot = buildSnapshot(db, visit);
  const ts = nowIso();
  transaction(db, () => {
    if (existing) {
      const keepSummary = existing.summary_origin === "mentor_edited";
      run(
        db,
        "UPDATE visit_reports SET snapshot=?, mentor_summary=?, generated_at=?, updated_at=? WHERE id=?",
        JSON.stringify(snapshot), keepSummary ? existing.mentor_summary : draftSummary(snapshot), ts, ts, existing.id,
      );
    } else {
      run(
        db,
        `INSERT INTO visit_reports (id, visit_id, status, snapshot, mentor_summary, summary_origin, generated_at, created_at, updated_at)
         VALUES (?,?, 'draft', ?, ?, 'system_draft', ?, ?, ?)`,
        newId(), visitId, JSON.stringify(snapshot), draftSummary(snapshot), ts, ts, ts,
      );
    }
    audit(db, actor, "report.generated", "report", visitId, { visit_id: visitId, refreshed: !!existing });
  });
  return loadReport(db, visitId)!;
}

export const reportEditSchema = z.object({ mentor_summary: z.string().trim().min(10, "Write a short summary").max(3000), expected_updated_at: z.string().max(40).optional() });

export function editReport(db: Db, actor: Actor, visitId: string, input: unknown): ReportView {
  getAuthorizedVisit(db, actor, visitId, "write");
  const rep = loadReport(db, visitId);
  if (!rep) throw notFound("Report");
  if (rep.status === "finalized") throw conflict("report_finalized", "This report is finalized");
  const { mentor_summary, expected_updated_at } = reportEditSchema.parse(input);
  assertNotStale(rep.updated_at, expected_updated_at);
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE visit_reports SET mentor_summary=?, summary_origin='mentor_edited', updated_at=? WHERE id=?", mentor_summary, ts, rep.id);
    audit(db, actor, "report.edited", "report", visitId, { visit_id: visitId });
  });
  return loadReport(db, visitId)!;
}

/**
 * Finalize = the mentor's explicit review step. Requires approved feedback and an agreed commitment
 * (the product's key output: one specific next step), then completes the visit atomically.
 */
export function finalizeReport(db: Db, actor: Actor, visitId: string): ReportView {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  const rep = loadReport(db, visitId);
  if (!rep) throw notFound("Report");
  if (rep.status === "finalized") return rep;
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict("visit_not_ready", "Only a visit that is in progress or pending review can be finalized");
  }
  const snapshot = buildSnapshot(db, visit); // freeze what is actually stored right now
  if (!snapshot.feedback) throw conflict("feedback_not_approved", "Approve the feedback card before finalizing the report");
  if (!snapshot.commitment) throw conflict("commitment_required", "Agree a next-step commitment with the teacher before finalizing the report");
  if (rep.mentor_summary.trim().length < 10) throw conflict("summary_required", "Add a short mentor summary first");
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      "UPDATE visit_reports SET status='finalized', snapshot=?, reviewed_by=?, finalized_at=?, generated_at=?, updated_at=? WHERE id=?",
      JSON.stringify(snapshot), actor.id, ts, ts, ts, rep.id,
    );
    markVisitCompleted(db, visitId);
    audit(db, actor, "report.finalized", "report", visitId, { visit_id: visitId, summary_origin: rep.summary_origin });
  });
  return loadReport(db, visitId)!;
}

export interface ReportListItem {
  visit_id: string; school_name: string; scheduled_at: string; grade: number; subject: string; teacher_alias: string;
  visit_status: string; report_status: "none" | "draft" | "finalized"; finalized_at: string | null;
}

export function listReports(db: Db, actor: Actor, filter: { status?: string } = {}): ReportListItem[] {
  requireRole(actor, "visit:read_content");
  const rows = all<ReportListItem>(
    db,
    `SELECT v.id AS visit_id, s.name AS school_name, v.scheduled_at, v.grade, v.subject, v.teacher_alias,
            v.status AS visit_status, COALESCE(r.status, 'none') AS report_status, r.finalized_at
       FROM visits v JOIN schools s ON s.id = v.school_id LEFT JOIN visit_reports r ON r.visit_id = v.id
      WHERE v.mentor_id = ? AND v.status <> 'draft' AND v.status <> 'planned'
      ORDER BY v.scheduled_at DESC`,
    actor.id,
  );
  return filter.status ? rows.filter((r) => r.report_status === filter.status) : rows;
}

// ---- CSV export -----------------------------------------------------------------------------

/** Neutralise spreadsheet formula injection and quote per RFC 4180. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Structured visit records for the actor's own visits. Deliberately excludes observation text and
 * evidence: the export carries what a state MIS would need, not private coaching notes.
 */
export function exportVisitsCsv(db: Db, actor: Actor): string {
  requireRole(actor, "visit:read_content");
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT v.id AS visit_id, s.code AS school_code, s.name AS school_name, substr(v.scheduled_at,1,10) AS visit_date,
            v.grade, v.subject, v.teacher_alias, v.status AS visit_status,
            (SELECT priority_practice FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status='approved') AS priority_practice,
            (SELECT next_step FROM feedback_drafts f WHERE f.visit_id = v.id AND f.status='approved') AS agreed_next_step,
            (SELECT c.practice_card_id FROM feedback_citations c JOIN feedback_drafts f ON f.id = c.feedback_id WHERE f.visit_id = v.id AND f.status='approved' AND c.is_primary = 1) AS primary_source_card,
            (SELECT c.card_version FROM feedback_citations c JOIN feedback_drafts f ON f.id = c.feedback_id WHERE f.visit_id = v.id AND f.status='approved' AND c.is_primary = 1) AS source_card_version,
            (SELECT p.origin FROM feedback_citations c JOIN feedback_drafts f ON f.id = c.feedback_id JOIN practice_cards p ON p.id = c.practice_card_id WHERE f.visit_id = v.id AND f.status='approved' AND c.is_primary = 1) AS source_origin,
            (SELECT group_concat(DISTINCT coalesce(k.printed_page, k.pdf_page)) FROM feedback_citations c JOIN feedback_drafts f ON f.id = c.feedback_id JOIN feedback_citation_chunks k ON k.citation_id = c.id WHERE f.visit_id = v.id AND f.status='approved' AND c.is_primary = 1) AS source_printed_pages,
            (SELECT c.status FROM commitments c WHERE c.visit_id = v.id AND c.status <> 'cancelled' LIMIT 1) AS commitment_status,
            (SELECT c.target_date FROM commitments c WHERE c.visit_id = v.id AND c.status <> 'cancelled' LIMIT 1) AS commitment_target_date,
            COALESCE(r.status, 'none') AS report_status, v.is_demo AS is_demo_record
       FROM visits v JOIN schools s ON s.id = v.school_id LEFT JOIN visit_reports r ON r.visit_id = v.id
      WHERE v.mentor_id = ? ORDER BY v.scheduled_at DESC`,
    actor.id,
  );
  const cols = ["visit_id","school_code","school_name","visit_date","grade","subject","teacher_alias","visit_status","priority_practice","agreed_next_step","primary_source_card","source_card_version","source_origin","source_printed_pages","commitment_status","commitment_target_date","report_status","is_demo_record"];
  audit(db, actor, "report.exported", "report", null, { rows: rows.length });
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}
