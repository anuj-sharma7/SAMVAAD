import type { LocalCard, LocalCommitment, LocalObservation, LocalSchool, LocalVisit, SyncState } from "./types";

/**
 * The draft report built on the device from local records. It is NOT the server report: it is never approved, no AI is used,
 * and it contains no scores, ratings or rankings (the data structure has no field that could hold one).
 */
export interface LocalReportRecord {
  kind: "visit" | "observation" | "commitment";
  id: string;
  state: SyncState;
  /** true only when the server acknowledged the latest local change */
  sent: boolean;
}

export interface LocalReport {
  kind: "local_draft";
  label: "Local draft: not the server report, not approved";
  official: false;
  approved: false;
  aiUsed: false;
  visit: {
    id: string; status: string; scheduledAt: string; grade: number; subject: string; language: string; purpose: string;
    teacherAlias: string; coachingFocus: string | null; prepNotes: string | null;
  };
  school: { name: string; district: string; block: string } | null;
  observations: Array<{
    id: string; practice: string; evidence: string; workedWell: string | null; improvementArea: string | null; contextNote: string | null; state: SyncState; sent: boolean;
  }>;
  nextStep: { id: string; action: string; owner: string; targetDate: string; expectedEvidence: string; status: string; state: SyncState; sent: boolean } | null;
  cards: Array<{ id: string; title: string; sourceTitle: string; sourceOrg: string; origin: LocalCard["origin"] }>;
  records: LocalReportRecord[];
  /** how many records are saved only on this device */
  unsentCount: number;
}

const rec = (kind: LocalReportRecord["kind"], id: string, state: SyncState): LocalReportRecord => ({ kind, id, state, sent: state === "synced" });

export function buildLocalReport(
  visit: LocalVisit,
  school: LocalSchool | undefined | null,
  observations: LocalObservation[],
  commitment: LocalCommitment | undefined | null,
  cards: LocalCard[] = [],
): LocalReport {
  const obs = observations.filter((o) => !o.deleted);
  const records = [rec("visit", visit.id, visit.sync.state), ...obs.map((o) => rec("observation", o.id, o.sync.state))];
  if (commitment) records.push(rec("commitment", commitment.id, commitment.sync.state));
  return {
    kind: "local_draft",
    label: "Local draft: not the server report, not approved",
    official: false,
    approved: false,
    aiUsed: false,
    visit: {
      id: visit.id, status: visit.status, scheduledAt: visit.scheduled_at, grade: visit.grade, subject: visit.subject, language: visit.language,
      purpose: visit.purpose, teacherAlias: visit.teacher_alias, coachingFocus: visit.coaching_focus, prepNotes: visit.prep_notes,
    },
    school: school ? { name: school.name, district: school.district, block: school.block } : null,
    observations: obs.map((o) => ({
      id: o.id, practice: o.practice_observed, evidence: o.evidence, workedWell: o.worked_well, improvementArea: o.improvement_area,
      contextNote: o.context_note, state: o.sync.state, sent: o.sync.state === "synced",
    })),
    nextStep: commitment
      ? {
        id: commitment.id, action: commitment.action_text, owner: commitment.owner_alias, targetDate: commitment.target_date,
        expectedEvidence: commitment.expected_evidence, status: commitment.status, state: commitment.sync.state, sent: commitment.sync.state === "synced",
      }
      : null,
    cards: cards.map((c) => ({ id: c.id, title: c.title, sourceTitle: c.source_title, sourceOrg: c.source_org, origin: c.origin })),
    records,
    unsentCount: records.filter((r) => !r.sent).length,
  };
}
