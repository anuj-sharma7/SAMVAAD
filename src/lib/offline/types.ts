/** Local (on-device) record shapes. Server ids ARE the local ids: offline records are created with client UUIDs. */
export type Lang = "en" | "hi";
export type VisitStatus = "draft" | "planned" | "in_progress" | "pending_review" | "completed";

/**
 * pending   saved on this device, not yet confirmed by the server
 * synced    the server acknowledged the latest local change
 * failed    the last attempt did not finish (temporary problem, will retry) or the server refused it (needs attention)
 * conflict  the record also changed elsewhere; both versions are kept until the user chooses
 */
export type SyncState = "pending" | "synced" | "failed" | "conflict";

export interface SyncMeta {
  state: SyncState;
  /** when the latest local change was saved on this device */
  localUpdatedAt: string;
  /** the server's updated_at we last saw for this record (null until the server has it) */
  serverVersion: string | null;
  /** when the server last acknowledged this record */
  confirmedAt: string | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface LocalSchool { id: string; code: string; name: string; state: string; district: string; block: string; cluster: string | null }

export interface LocalVisit {
  id: string;
  school_id: string;
  teacher_alias: string;
  scheduled_at: string;
  grade: number;
  subject: string;
  language: Lang;
  purpose: string;
  coaching_focus: string | null;
  prep_notes: string | null;
  previous_commitment_id: string | null;
  observation_method: "text" | "checklist";
  status: VisitStatus;
  created_at: string;
  sync: SyncMeta;
  /** server-created records can be opened offline but only the server can complete them */
  origin: "local" | "server";
}

export interface LocalObservation {
  id: string;
  visit_id: string;
  practice_observed: string;
  evidence: string;
  worked_well: string | null;
  improvement_area: string | null;
  context_note: string | null;
  created_at: string;
  sync: SyncMeta;
  origin: "local" | "server";
  /** deleted locally, waiting for the server to confirm; hidden from lists */
  deleted?: boolean;
}

export type CommitmentStatus = "open" | "completed" | "reviewed" | "cancelled";
export interface LocalCommitment {
  id: string;
  visit_id: string;
  action_text: string;
  owner_role: "teacher" | "head_teacher" | "mentor";
  owner_alias: string;
  target_date: string;
  expected_evidence: string;
  status: CommitmentStatus;
  created_at: string;
  sync: SyncMeta;
  origin: "local" | "server";
}

export interface LocalCard {
  id: string; version: number; title: string; domain: string; grade_min: number; grade_max: number; subject: string;
  description: string; steps: string[]; example_prompts: string[]; next_step: string; source_title: string; source_org: string;
  origin: "illustrative" | "official_source"; localized_hi: { title: string; summary: string; next_step: string; steps: string[]; prompts: string[] } | null;
}

export type EntityType = "visit" | "observation" | "commitment";
export type OpKind = "create" | "update" | "delete" | "transition";
export type OutboxStatus = "queued" | "inflight" | "failed" | "conflict" | "rejected";

export interface OutboxOp {
  /** auto-increment: operations are applied in this order */
  seq?: number;
  opId: string;
  entityType: EntityType;
  entityId: string;
  op: OpKind;
  /** only what the server needs to apply the change */
  payload: Record<string, unknown>;
  /** visit id; operations on one visit are applied in order and a failure holds back the rest of that visit */
  chain: string;
  schemaVersion: 1;
  createdAt: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  retryCount: number;
  status: OutboxStatus;
  /** sanitized category/code only: never record text */
  errorCode?: string;
  errorMessage?: string;
}

export interface ConflictRecord {
  id: string;
  opId: string;
  entityType: EntityType;
  entityId: string;
  /** the device's version at the moment of the conflict */
  local: Record<string, unknown>;
  /** the server's version */
  server: Record<string, unknown>;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: "mine" | "server" | null;
}

/** Minimal sync history. Never contains observation text. */
export interface SyncLogEntry {
  id?: number;
  at: string;
  opId: string | null;
  entityType: EntityType | null;
  result: string;
  code?: string;
}

export interface Snapshot {
  server_time: string;
  account: { id: string; display_name: string; role: string; preferred_language: Lang; ui_language: Lang | null };
  schools: LocalSchool[];
  visits: Array<Omit<LocalVisit, "sync" | "origin"> & { updated_at: string; started_at?: string | null; completed_at?: string | null }>;
  observations: Array<Omit<LocalObservation, "sync" | "origin"> & { updated_at: string }>;
  commitments: Array<Omit<LocalCommitment, "sync" | "origin"> & { updated_at: string }>;
  cards: LocalCard[];
}

export class StorageError extends Error {
  constructor(public kind: "quota" | "unavailable" | "migration" | "corrupt", message: string, public cause2?: unknown) {
    super(message);
    this.name = "StorageError";
  }
}
