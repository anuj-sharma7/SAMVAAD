/**
 * Ordered, append-only list of SQL migrations. Applied once each, tracked in `schema_migrations`.
 * Never edit a released migration; add a new one.
 *
 * Design notes
 *  - All ids are TEXT (UUIDs, or stable human ids such as "R-14" for practice cards).
 *  - Status columns carry CHECK constraints, and impossible state combinations
 *    (e.g. "approved" without an approver) are rejected by the database itself.
 *  - There is deliberately NO student table and no child-level fields.
 *  - audit_logs is append-only, enforced with triggers.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_core",
    sql: `
CREATE TABLE profiles (
  id                 TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  role               TEXT NOT NULL CHECK (role IN ('mentor','supervisor','diet_admin')),
  designation        TEXT,
  block              TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','hi')),
  is_demo            INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE schools (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  state      TEXT NOT NULL,
  district   TEXT NOT NULL,
  block      TEXT NOT NULL,
  cluster    TEXT,
  is_demo    INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_schools_block ON schools(district, block);

CREATE TABLE school_assignments (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, school_id)
);
CREATE INDEX idx_assign_school ON school_assignments(school_id);

CREATE TABLE rubric_tags (
  code        TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  keywords    TEXT NOT NULL DEFAULT '[]',
  version     INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE practice_cards (
  id               TEXT PRIMARY KEY,
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  title            TEXT NOT NULL,
  domain           TEXT NOT NULL,
  grade_min        INTEGER NOT NULL CHECK (grade_min BETWEEN 0 AND 12),
  grade_max        INTEGER NOT NULL CHECK (grade_max BETWEEN 0 AND 12),
  subject          TEXT NOT NULL,
  teaching_language TEXT NOT NULL DEFAULT 'any' CHECK (teaching_language IN ('any','en','hi')),
  description      TEXT NOT NULL,
  steps            TEXT NOT NULL DEFAULT '[]',
  example_prompts  TEXT NOT NULL DEFAULT '[]',
  next_step        TEXT NOT NULL DEFAULT '',
  variation        TEXT,
  example_dialogue TEXT NOT NULL DEFAULT '[]',
  tlm              TEXT NOT NULL DEFAULT '[]',
  tags             TEXT NOT NULL DEFAULT '[]',
  localized        TEXT NOT NULL DEFAULT '{}',
  source_org       TEXT NOT NULL,
  source_title     TEXT NOT NULL,
  source_section   TEXT,
  source_url       TEXT,
  source_type      TEXT NOT NULL DEFAULT 'illustrative',
  approval_status  TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','approved','rejected')),
  last_reviewed_at TEXT,
  reviewed_by      TEXT REFERENCES profiles(id),
  review_notes     TEXT,
  curator_id       TEXT REFERENCES profiles(id),
  is_demo          INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (grade_min <= grade_max),
  CHECK (approval_status <> 'approved' OR (last_reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX idx_cards_status ON practice_cards(approval_status, subject);

CREATE TABLE practice_card_versions (
  card_id    TEXT NOT NULL REFERENCES practice_cards(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  snapshot   TEXT NOT NULL,
  changed_by TEXT REFERENCES profiles(id),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (card_id, version)
);

CREATE TABLE visits (
  id                     TEXT PRIMARY KEY,
  school_id              TEXT NOT NULL REFERENCES schools(id),
  mentor_id              TEXT NOT NULL REFERENCES profiles(id),
  teacher_alias          TEXT NOT NULL CHECK (length(teacher_alias) BETWEEN 1 AND 60),
  scheduled_at           TEXT NOT NULL,
  grade                  INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 8),
  subject                TEXT NOT NULL,
  language               TEXT NOT NULL DEFAULT 'hi' CHECK (language IN ('en','hi')),
  purpose                TEXT NOT NULL,
  coaching_focus         TEXT,
  prep_notes             TEXT,
  previous_commitment_id TEXT,
  observation_method     TEXT NOT NULL DEFAULT 'text' CHECK (observation_method IN ('text','checklist')),
  audio_consent          TEXT NOT NULL DEFAULT 'not_requested' CHECK (audio_consent IN ('not_requested','declined','granted')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','planned','in_progress','pending_review','completed')),
  is_demo                INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1)),
  started_at             TEXT,
  completed_at           TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX idx_visits_school ON visits(school_id, scheduled_at);
CREATE INDEX idx_visits_mentor ON visits(mentor_id, status);

CREATE TABLE observations (
  id                TEXT PRIMARY KEY,
  visit_id          TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  practice_observed TEXT NOT NULL CHECK (length(practice_observed) BETWEEN 3 AND 1500),
  evidence          TEXT NOT NULL CHECK (length(evidence) BETWEEN 3 AND 2000),
  worked_well       TEXT CHECK (worked_well IS NULL OR length(worked_well) <= 1500),
  improvement_area  TEXT CHECK (improvement_area IS NULL OR length(improvement_area) <= 1500),
  context_note      TEXT CHECK (context_note IS NULL OR length(context_note) <= 500),
  created_by        TEXT NOT NULL REFERENCES profiles(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_obs_visit ON observations(visit_id);

-- Tags are either typed by the mentor or SUGGESTED by the tagger. A suggestion only
-- becomes part of the record once the mentor confirms it (confirmed = 1).
CREATE TABLE observation_tags (
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  tag_code       TEXT NOT NULL REFERENCES rubric_tags(code),
  source         TEXT NOT NULL CHECK (source IN ('mentor','suggested')),
  confirmed      INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
  match_strength REAL CHECK (match_strength IS NULL OR (match_strength >= 0 AND match_strength <= 1)),
  matched_terms  TEXT NOT NULL DEFAULT '[]',
  decided_by     TEXT REFERENCES profiles(id),
  decided_at     TEXT,
  PRIMARY KEY (observation_id, tag_code),
  CHECK (source <> 'mentor' OR confirmed = 1)
);

CREATE TABLE feedback_drafts (
  id               TEXT PRIMARY KEY,
  visit_id         TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL CHECK (seq >= 1),
  status           TEXT NOT NULL CHECK (status IN
                    ('draft','edited','approved','rejected','superseded','insufficient_evidence')),
  language         TEXT NOT NULL CHECK (language IN ('en','hi')),
  strength         TEXT,
  priority_practice TEXT,
  next_step        TEXT,
  ask_question     TEXT,
  describe_statement TEXT,
  ask_again_question TEXT,
  evidence         TEXT NOT NULL DEFAULT '[]',
  provider         TEXT NOT NULL,
  model            TEXT,
  is_simulated     INTEGER NOT NULL DEFAULT 0 CHECK (is_simulated IN (0,1)),
  retrieval_trace  TEXT NOT NULL DEFAULT '{}',
  mentor_edited    INTEGER NOT NULL DEFAULT 0 CHECK (mentor_edited IN (0,1)),
  approved_by      TEXT REFERENCES profiles(id),
  approved_at      TEXT,
  rejected_by      TEXT REFERENCES profiles(id),
  rejected_at      TEXT,
  rejection_reason TEXT,
  created_by       TEXT NOT NULL REFERENCES profiles(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (visit_id, seq),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL
         AND strength IS NOT NULL AND priority_practice IS NOT NULL AND next_step IS NOT NULL)),
  CHECK (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL))
);
CREATE INDEX idx_feedback_visit ON feedback_drafts(visit_id, status);
-- At most one live (non-terminal) draft or approved card per visit.
CREATE UNIQUE INDEX uq_feedback_one_live ON feedback_drafts(visit_id)
  WHERE status IN ('draft','edited','approved','insufficient_evidence');

CREATE TABLE feedback_citations (
  id              TEXT PRIMARY KEY,
  feedback_id     TEXT NOT NULL REFERENCES feedback_drafts(id) ON DELETE CASCADE,
  practice_card_id TEXT NOT NULL REFERENCES practice_cards(id),
  card_version    INTEGER NOT NULL,
  source_title    TEXT NOT NULL,
  source_section  TEXT,
  source_url      TEXT,
  relevance_reason TEXT NOT NULL,
  retrieved_rank  INTEGER,
  is_primary      INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  UNIQUE (feedback_id, practice_card_id)
);

CREATE TABLE demonstration_scripts (
  id                TEXT PRIMARY KEY,
  visit_id          TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  feedback_id       TEXT REFERENCES feedback_drafts(id),
  practice_card_id  TEXT NOT NULL REFERENCES practice_cards(id),
  card_version      INTEGER NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('draft','edited','approved','superseded')),
  language          TEXT NOT NULL CHECK (language IN ('en','hi')),
  grade             INTEGER NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 5 CHECK (duration_minutes BETWEEN 1 AND 15),
  objective         TEXT NOT NULL,
  materials         TEXT NOT NULL DEFAULT '[]',
  steps             TEXT NOT NULL DEFAULT '[]',
  mentor_script     TEXT NOT NULL,
  example_interaction TEXT NOT NULL,
  variation         TEXT,
  reflection_question TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT,
  is_simulated      INTEGER NOT NULL DEFAULT 0 CHECK (is_simulated IN (0,1)),
  mentor_edited     INTEGER NOT NULL DEFAULT 0 CHECK (mentor_edited IN (0,1)),
  approved_by       TEXT REFERENCES profiles(id),
  approved_at       TEXT,
  created_by        TEXT NOT NULL REFERENCES profiles(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_demo_one_live ON demonstration_scripts(visit_id)
  WHERE status IN ('draft','edited','approved');

-- Stored states: open -> completed -> reviewed (or cancelled). "Due soon" and "overdue" are
-- DERIVED from target_date at read time so they can never go stale.
CREATE TABLE commitments (
  id               TEXT PRIMARY KEY,
  visit_id         TEXT NOT NULL REFERENCES visits(id),
  feedback_id      TEXT REFERENCES feedback_drafts(id),
  action_text      TEXT NOT NULL CHECK (length(action_text) BETWEEN 5 AND 600),
  owner_role       TEXT NOT NULL DEFAULT 'teacher' CHECK (owner_role IN ('teacher','head_teacher','mentor')),
  owner_alias      TEXT NOT NULL,
  target_date      TEXT NOT NULL,
  expected_evidence TEXT NOT NULL CHECK (length(expected_evidence) BETWEEN 3 AND 600),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','reviewed','cancelled')),
  completed_at     TEXT,
  review_visit_id  TEXT REFERENCES visits(id),
  review_outcome   TEXT CHECK (review_outcome IS NULL OR review_outcome IN
                     ('tried_working','tried_needs_support','not_tried')),
  review_evidence  TEXT,
  review_barriers  TEXT,
  review_notes     TEXT,
  reviewed_by      TEXT REFERENCES profiles(id),
  reviewed_at      TEXT,
  created_by       TEXT NOT NULL REFERENCES profiles(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'reviewed' OR (review_outcome IS NOT NULL AND reviewed_by IS NOT NULL
         AND reviewed_at IS NOT NULL AND review_visit_id IS NOT NULL))
);
CREATE INDEX idx_commit_status ON commitments(status, target_date);
CREATE UNIQUE INDEX uq_commit_one_per_feedback ON commitments(feedback_id)
  WHERE feedback_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE visit_reports (
  id            TEXT PRIMARY KEY,
  visit_id      TEXT NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  snapshot      TEXT NOT NULL,
  mentor_summary TEXT NOT NULL DEFAULT '',
  summary_origin TEXT NOT NULL DEFAULT 'system_draft' CHECK (summary_origin IN ('system_draft','mentor_edited')),
  generated_at  TEXT NOT NULL,
  reviewed_by   TEXT REFERENCES profiles(id),
  finalized_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (status <> 'finalized' OR (reviewed_by IS NOT NULL AND finalized_at IS NOT NULL))
);

CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TABLE idempotency_keys (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  response   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, scope, actor_id)
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    id: "0002_public_data",
    sql: `
-- Real PUBLIC education statistics. Logically and physically separate from operational (mentor) records:
-- nothing here references visits, schools, teachers or observations, and nothing in the operational tables
-- references these rows.
CREATE TABLE public_sources (
  source_id            TEXT PRIMARY KEY,
  source_name          TEXT NOT NULL,
  publisher            TEXT NOT NULL,
  source_url           TEXT NOT NULL,
  download_url_or_api  TEXT,
  retrieved_at_utc     TEXT,
  published_at         TEXT,
  reference_period     TEXT NOT NULL,
  geography_level      TEXT NOT NULL,
  geography_coverage   TEXT NOT NULL,
  dataset_type         TEXT NOT NULL,
  format               TEXT NOT NULL,
  licence_or_terms     TEXT NOT NULL,
  access_status        TEXT NOT NULL CHECK (access_status IN ('downloaded_and_validated','report_downloaded','public_page_only',
                         'manual_download_needed','registration_or_request_required','captcha_or_interaction_blocked',
                         'unavailable','rejected_due_to_license_or_privacy')),
  access_detail        TEXT,
  sha256               TEXT,
  file_path            TEXT,
  row_count            INTEGER,
  schema_version       TEXT,
  transformation_notes TEXT,
  known_limitations    TEXT NOT NULL,
  citation_or_attribution TEXT NOT NULL,
  is_active            INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  updated_at           TEXT NOT NULL
);

CREATE TABLE public_indicator_defs (
  indicator_id TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  description  TEXT NOT NULL,
  unit         TEXT NOT NULL,
  domain       TEXT NOT NULL CHECK (domain IN ('school_system','infrastructure','enrolment','learning')),
  survey_type  TEXT NOT NULL CHECK (survey_type IN ('school_census','household_sample_survey')),
  caveat       TEXT NOT NULL
);

CREATE TABLE public_indicators (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id     TEXT NOT NULL REFERENCES public_indicator_defs(indicator_id),
  source_id        TEXT NOT NULL REFERENCES public_sources(source_id),
  geography_level  TEXT NOT NULL CHECK (geography_level IN ('national','state','division','district')),
  state            TEXT NOT NULL,
  area             TEXT NOT NULL,
  reference_period TEXT NOT NULL,
  value            REAL,
  ci95_half_width  REAL CHECK (ci95_half_width IS NULL OR ci95_half_width > 0),
  value_status     TEXT NOT NULL CHECK (value_status IN ('reported','derived','suppressed')),
  source_locator   TEXT NOT NULL,
  notes            TEXT NOT NULL DEFAULT '',
  -- a missing value must be flagged suppressed; a present value must not be
  CHECK ((value IS NULL) = (value_status = 'suppressed')),
  UNIQUE (indicator_id, source_id, state, area, reference_period)
);
CREATE INDEX idx_pub_ind_lookup ON public_indicators(indicator_id, state, geography_level);

CREATE TABLE public_ingestions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT NOT NULL,
  finished_at    TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('imported','rejected')),
  rows_imported  INTEGER NOT NULL DEFAULT 0,
  sources_active INTEGER NOT NULL DEFAULT 0,
  checks_passed  INTEGER,
  checks_total   INTEGER,
  registry_sha256 TEXT,
  processed_sha256 TEXT,
  detail         TEXT NOT NULL
);
`,
  },
  {
    id: "0003_knowledge_base",
    sql: `
-- Teaching-practice knowledge base: official/licensed pedagogy SOURCES and short verbatim EXCERPTS (chunks).
-- Kept separate from the public statistics tables. Nothing here is usable for coaching until a human curator
-- approves it (review_status = 'approved').
ALTER TABLE practice_cards ADD COLUMN origin TEXT NOT NULL DEFAULT 'illustrative'
  CHECK (origin IN ('illustrative','official_source'));

CREATE TABLE kb_sources (
  kb_source_id   TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  publisher      TEXT NOT NULL,
  source_url     TEXT NOT NULL,
  version_note   TEXT NOT NULL,
  licence_note   TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'en',
  file_sha256    TEXT NOT NULL,
  retrieved_at_utc TEXT,
  extracted_at_utc TEXT NOT NULL,
  imported_at    TEXT NOT NULL
);

CREATE TABLE kb_chunks (
  chunk_id       TEXT PRIMARY KEY,
  kb_source_id   TEXT NOT NULL REFERENCES kb_sources(kb_source_id),
  pdf_page       INTEGER NOT NULL CHECK (pdf_page >= 1),
  printed_page   INTEGER,
  text           TEXT NOT NULL CHECK (length(text) BETWEEN 20 AND 900),
  text_sha256    TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'en',
  review_status  TEXT NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review','approved','rejected')),
  reviewed_by    TEXT REFERENCES profiles(id),
  reviewed_at    TEXT,
  review_notes   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (review_status = 'pending_review' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX idx_kb_chunks_source ON kb_chunks(kb_source_id, pdf_page);

CREATE TABLE practice_card_chunks (
  card_id    TEXT NOT NULL REFERENCES practice_cards(id) ON DELETE CASCADE,
  chunk_id   TEXT NOT NULL REFERENCES kb_chunks(chunk_id),
  role       TEXT NOT NULL DEFAULT 'supporting' CHECK (role IN ('primary','supporting')),
  PRIMARY KEY (card_id, chunk_id)
);

-- Snapshot of the exact excerpt(s) shown to the mentor with each citation (so approved feedback stays traceable
-- even if the library is later revised).
CREATE TABLE feedback_citation_chunks (
  citation_id  TEXT NOT NULL REFERENCES feedback_citations(id) ON DELETE CASCADE,
  chunk_id     TEXT NOT NULL REFERENCES kb_chunks(chunk_id),
  pdf_page     INTEGER NOT NULL,
  printed_page INTEGER,
  excerpt      TEXT NOT NULL,
  PRIMARY KEY (citation_id, chunk_id)
);
`,
  },
  {
    id: "0004_sessions",
    sql: `
-- Server-side sessions. The cookie carries a random 256-bit token; only its SHA-256 hash is stored, so a copy of the
-- database cannot be used to sign in, and logout or expiry really invalidates the session on the server.
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX idx_sessions_profile ON sessions(profile_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
`,
  },
  {
    id: "0005_ui_language",
    sql: `
-- Interface language is a separate preference from the coaching (content) language. NULL = the user has not chosen yet.
ALTER TABLE profiles ADD COLUMN ui_language TEXT CHECK (ui_language IN ('en','hi'));
`,
  },
  {
    id: "0006_sync_operations",
    sql: `
-- Offline sync: every operation a device sends carries a client-generated operation id. Terminal outcomes are stored here so
-- a retry (for example after a timeout where the first request had already committed) returns the first result instead of
-- applying the change twice. The stored response holds ids, statuses and error codes only, never observation text.
CREATE TABLE sync_operations (
  op_id       TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES profiles(id),
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('applied','rejected')),
  response    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_sync_ops_actor ON sync_operations(actor_id, created_at);
`,
  },
];
