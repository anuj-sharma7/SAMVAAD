export type Role = "mentor" | "supervisor" | "diet_admin";
export type Lang = "en" | "hi";

export interface Actor {
  id: string;
  role: Role;
  displayName: string;
  /** Default language for coaching drafts (content). */
  preferredLanguage: Lang;
  /** Interface language (separate from the coaching language); null = not chosen yet. */
  uiLanguage: Lang | null;
}

export const VISIT_STATUSES = ["draft", "planned", "in_progress", "pending_review", "completed"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export type FeedbackStatus =
  | "draft"
  | "edited"
  | "approved"
  | "rejected"
  | "superseded"
  | "insufficient_evidence";

export type CommitmentStatus = "open" | "completed" | "reviewed" | "cancelled";
/** Derived at read time from target_date; never stored. */
export type CommitmentDisplayStatus = "open" | "due_soon" | "overdue" | "completed" | "reviewed" | "cancelled";
export type ReviewOutcome = "tried_working" | "tried_needs_support" | "not_tried";

export interface SchoolRow {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
  block: string;
  cluster: string | null;
  is_demo: number;
}

export interface VisitRow {
  id: string;
  school_id: string;
  mentor_id: string;
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
  audio_consent: "not_requested" | "declined" | "granted";
  status: VisitStatus;
  is_demo: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationRow {
  id: string;
  visit_id: string;
  practice_observed: string;
  evidence: string;
  worked_well: string | null;
  improvement_area: string | null;
  context_note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PracticeCardRow {
  id: string;
  version: number;
  title: string;
  domain: string;
  grade_min: number;
  grade_max: number;
  subject: string;
  teaching_language: "any" | Lang;
  description: string;
  steps: string; // JSON string[]
  example_prompts: string; // JSON string[]
  next_step: string;
  variation: string | null;
  example_dialogue: string; // JSON string[]
  tlm: string; // JSON string[]
  tags: string; // JSON string[]
  localized: string; // JSON { hi?: LocalizedCard }
  source_org: string;
  source_title: string;
  source_section: string | null;
  source_url: string | null;
  source_type: string;
  approval_status: "draft" | "approved" | "rejected";
  last_reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  curator_id: string | null;
  is_demo: number;
  origin: "illustrative" | "official_source";
  created_at: string;
  updated_at: string;
}

export interface LocalizedCard {
  title: string;
  summary: string;
  next_step: string;
  steps: string[];
  prompts: string[];
  dialogue: string[];
}

/** A short verbatim excerpt of an official source, with its page and review state. */
export interface CardChunk {
  chunk_id: string;
  role: "primary" | "supporting";
  pdf_page: number;
  printed_page: number | null;
  text: string;
  review_status: "pending_review" | "approved" | "rejected";
}

export interface PracticeCard
  extends Omit<PracticeCardRow, "steps" | "example_prompts" | "example_dialogue" | "tlm" | "tags" | "localized"> {
  steps: string[];
  example_prompts: string[];
  example_dialogue: string[];
  tlm: string[];
  tags: string[];
  localized: { hi?: LocalizedCard };
  /** Source excerpts (official-source cards only). Approved-only unless loaded for curator review. */
  chunks?: CardChunk[];
}

export interface EvidenceRef {
  observation_id: string;
  quote_or_summary: string;
}

export interface CitationChunk {
  chunk_id: string;
  pdf_page: number;
  printed_page: number | null;
  excerpt: string;
}

export interface Citation {
  practice_card_id: string;
  /** illustrative = demo card with no external source; official_source = excerpts from a published document. */
  origin: "illustrative" | "official_source";
  chunks: CitationChunk[];
  card_version: number;
  source_title: string;
  source_section: string | null;
  source_url: string | null;
  relevance_reason: string;
  retrieved_rank: number | null;
  is_primary: boolean;
}

export interface RetrievalCandidate {
  card_id: string;
  card_version: number;
  title: string;
  score: number;
  matched_terms: string[];
  reasons: string[];
  origin: "illustrative" | "official_source";
  /** Source excerpts retrieved with this card (official-source cards only). */
  chunk_ids: string[];
}

export interface RetrievalTrace {
  query_terms?: string[];
  candidates?: RetrievalCandidate[];
  min_score?: number;
  note?: string;
}

export interface FeedbackDraft {
  id: string;
  visit_id: string;
  seq: number;
  status: FeedbackStatus;
  language: Lang;
  strength: string | null;
  priority_practice: string | null;
  next_step: string | null;
  ask_question: string | null;
  describe_statement: string | null;
  ask_again_question: string | null;
  evidence: EvidenceRef[];
  provider: string;
  model: string | null;
  is_simulated: boolean;
  retrieval_trace: RetrievalTrace;
  mentor_edited: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  citations: Citation[];
}
