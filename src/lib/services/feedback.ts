import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, parseJson } from "../util";
import { AppError, conflict, invalid, notFound } from "../errors";
import { audit } from "./audit";
import { assertNotStale, getAuthorizedVisit } from "./access";
import { attachChunks, getApprovedCards, getCardInternal } from "./practice-cards";
import { keywordRetriever, type RetrievalQuery } from "../engines/retrieval";
import { feedbackOutputSchema, type CardContext, type FeedbackOutput, type FeedbackTaskInput } from "../ai/schemas";
import { feedbackPrompts } from "../ai/prompts";
import { getProvider, AI_TIMEOUT_MS } from "../ai";
import { AiProviderError, type AiProvider } from "../ai/provider";
import type {
  Actor, Citation, CitationChunk, EvidenceRef, FeedbackDraft, FeedbackStatus, Lang, ObservationRow,
  PracticeCard, RetrievalCandidate, RetrievalTrace, VisitRow,
} from "../types";

// ---------------------------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------------------------

interface FeedbackRowRaw {
  id: string; visit_id: string; seq: number; status: FeedbackStatus; language: Lang;
  strength: string | null; priority_practice: string | null; next_step: string | null;
  ask_question: string | null; describe_statement: string | null; ask_again_question: string | null;
  evidence: string; provider: string; model: string | null; is_simulated: number; retrieval_trace: string;
  mentor_edited: number; approved_by: string | null; approved_at: string | null; rejected_by: string | null;
  rejected_at: string | null; rejection_reason: string | null; created_at: string; updated_at: string;
}

function loadCitations(db: Db, feedbackId: string): Citation[] {
  const rows = all<Omit<Citation, "is_primary" | "chunks"> & { id: string; is_primary: number }>(
    db,
    `SELECT c.id, c.practice_card_id, c.card_version, c.source_title, c.source_section, c.source_url, c.relevance_reason,
            c.retrieved_rank, c.is_primary, p.origin
       FROM feedback_citations c JOIN practice_cards p ON p.id = c.practice_card_id
      WHERE c.feedback_id = ? ORDER BY c.is_primary DESC, c.retrieved_rank`,
    feedbackId,
  );
  return rows.map(({ id, ...c }) => ({
    ...c,
    is_primary: !!c.is_primary,
    chunks: all<CitationChunk>(db, "SELECT chunk_id, pdf_page, printed_page, excerpt FROM feedback_citation_chunks WHERE citation_id = ? ORDER BY pdf_page", id),
  }));
}

export function mapFeedback(db: Db, r: FeedbackRowRaw): FeedbackDraft {
  return {
    ...r,
    evidence: parseJson<EvidenceRef[]>(r.evidence, []),
    is_simulated: !!r.is_simulated,
    retrieval_trace: parseJson<RetrievalTrace>(r.retrieval_trace, {}),
    mentor_edited: !!r.mentor_edited,
    citations: loadCitations(db, r.id),
  };
}

/** The current card for a visit: the live one (draft/edited/approved/insufficient) or, failing that, the latest. */
export function getCurrentFeedback(db: Db, actor: Actor, visitId: string): FeedbackDraft | null {
  getAuthorizedVisit(db, actor, visitId, "content");
  return currentFeedbackInternal(db, visitId);
}

export function currentFeedbackInternal(db: Db, visitId: string): FeedbackDraft | null {
  const row =
    get<FeedbackRowRaw>(
      db,
      "SELECT * FROM feedback_drafts WHERE visit_id = ? AND status IN ('draft','edited','approved','insufficient_evidence')",
      visitId,
    ) ?? get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE visit_id = ? ORDER BY seq DESC LIMIT 1", visitId);
  return row ? mapFeedback(db, row) : null;
}

export function listFeedbackHistory(db: Db, actor: Actor, visitId: string): FeedbackDraft[] {
  getAuthorizedVisit(db, actor, visitId, "content");
  return all<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE visit_id = ? ORDER BY seq DESC", visitId).map((r) =>
    mapFeedback(db, r),
  );
}

// ---------------------------------------------------------------------------------------------
// Pure validation: this is what makes citations trustworthy, whatever the model says.
// ---------------------------------------------------------------------------------------------

/** Language that evaluates the teacher rather than describing practice. Output containing it is rejected. */
const EVALUATIVE = [
  /\b(poor|weak|bad|ineffective|incompetent|lazy)\s+(teacher|teaching|performance)\b/i,
  /\bteacher\s+(is|was)\s+(poor|weak|bad|ineffective|incompetent|lazy)\b/i,
  /\b\d+\s*(\/|out of)\s*(5|10|100)\b/i,
  /\b(rating|score[sd]?|ranking|ranked)\b.*\bteacher\b/i,
  /\bteacher\b.*\b(rating|score[sd]?|ranking|ranked)\b/i,
];
export const containsEvaluativeLanguage = (text: string) => EVALUATIVE.some((re) => re.test(text));

/**
 * Build a citation entirely from database records. For official-source cards the excerpt(s) that were retrieved are
 * attached (verbatim, with page numbers); a citation of such a card WITHOUT an approved excerpt is refused.
 */
export function buildCitation(card: PracticeCard, reason: string, rank: number | null, isPrimary: boolean, chunkIds: string[]): Citation {
  const chunks = (card.chunks ?? []).filter((c) => c.review_status === "approved" && chunkIds.includes(c.chunk_id));
  if (card.origin === "official_source" && chunks.length === 0) {
    throw new AppError(502, "invalid_citation", `Card ${card.id} is an official-source card but no approved source excerpt was retrieved for it. The draft was discarded.`);
  }
  return {
    practice_card_id: card.id, card_version: card.version, origin: card.origin,
    source_title: card.source_title, source_section: card.source_section, source_url: card.source_url,
    relevance_reason: reason, retrieved_rank: rank, is_primary: isPrimary,
    chunks: chunks.map((c) => ({ chunk_id: c.chunk_id, pdf_page: c.pdf_page, printed_page: c.printed_page, excerpt: c.text })),
  };
}

export interface ValidatedFeedback {
  output: FeedbackOutput;
  citations: Citation[];
}

/**
 * Validate a model response against what the server actually retrieved:
 *  - schema is checked by Zod,
 *  - every cited card id must be one of the retrieved candidates (so invented ids cannot pass),
 *  - citation metadata (title/section/url/version) is rebuilt from the database, never from the model,
 *  - evidence must reference real observations of THIS visit,
 *  - evaluative language about the teacher is rejected.
 * Throws `AppError(502, "invalid_model_output")` on any violation; nothing is saved in that case.
 */
export function validateFeedbackOutput(
  raw: unknown,
  candidates: RetrievalCandidate[],
  cardsById: Map<string, PracticeCard>,
  observationIds: Set<string>,
): ValidatedFeedback {
  const parsed = feedbackOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, "invalid_model_output", "The AI response did not match the required structure.", parsed.error.issues.map((i) => i.message));
  }
  const out = parsed.data;
  if (out.insufficient_evidence) return { output: out, citations: [] };

  const rank = new Map(candidates.map((c, i) => [c.card_id, { c, rank: i + 1 }]));
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const cit of out.citations) {
    const hit = rank.get(cit.practice_card_id);
    const card = cardsById.get(cit.practice_card_id);
    if (!hit || !card || card.approval_status !== "approved") {
      throw new AppError(502, "invalid_citation", `The AI cited "${cit.practice_card_id}", which is not an approved card retrieved for this visit. The draft was discarded.`);
    }
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    citations.push(buildCitation(card, hit.c.reasons.slice(0, 2).join(" · "), hit.rank, citations.length === 0, hit.c.chunk_ids));
  }
  for (const e of out.evidence) {
    if (!observationIds.has(e.observation_id)) {
      throw new AppError(502, "invalid_evidence", "The AI referenced an observation that does not belong to this visit. The draft was discarded.");
    }
  }
  const text = [out.strength, out.priority_practice, out.next_step, ...Object.values(out.coaching_questions)].join(" \n ");
  if (containsEvaluativeLanguage(text)) {
    throw new AppError(502, "unsafe_output", "The AI draft contained evaluative language about the teacher, which SAMVAAD does not allow. The draft was discarded.");
  }
  return { output: out, citations };
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

export interface NewDraft {
  visitId: string;
  actorId: string;
  status: Extract<FeedbackStatus, "draft" | "insufficient_evidence" | "approved">;
  language: Lang;
  output?: FeedbackOutput;
  citations?: Citation[];
  provider: string;
  model: string | null;
  simulated: boolean;
  trace: RetrievalTrace;
  approvedBy?: string;
  approvedAt?: string;
  createdAt?: string;
}

/** Persist one citation and the exact excerpt snapshot(s) shown with it. */
export function insertCitation(db: Db, feedbackId: string, c: Citation): void {
  const citationId = newId();
  run(
    db,
    `INSERT INTO feedback_citations (id, feedback_id, practice_card_id, card_version, source_title, source_section,
       source_url, relevance_reason, retrieved_rank, is_primary) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    citationId, feedbackId, c.practice_card_id, c.card_version, c.source_title, c.source_section, c.source_url,
    c.relevance_reason, c.retrieved_rank, c.is_primary ? 1 : 0,
  );
  for (const k of c.chunks) {
    run(db, "INSERT INTO feedback_citation_chunks (citation_id, chunk_id, pdf_page, printed_page, excerpt) VALUES (?,?,?,?,?)",
      citationId, k.chunk_id, k.pdf_page, k.printed_page, k.excerpt);
  }
}

/** Insert a draft (superseding any live non-approved one). Must run inside a transaction. */
export function insertFeedbackDraft(db: Db, d: NewDraft): string {
  run(db, "UPDATE feedback_drafts SET status = 'superseded', updated_at = ? WHERE visit_id = ? AND status IN ('draft','edited','insufficient_evidence')", nowIso(), d.visitId);
  const seq = (get<{ m: number | null }>(db, "SELECT max(seq) AS m FROM feedback_drafts WHERE visit_id = ?", d.visitId)?.m ?? 0) + 1;
  const id = newId();
  const ts = d.createdAt ?? nowIso();
  const o = d.output;
  run(
    db,
    `INSERT INTO feedback_drafts (id, visit_id, seq, status, language, strength, priority_practice, next_step,
       ask_question, describe_statement, ask_again_question, evidence, provider, model, is_simulated, retrieval_trace,
       mentor_edited, approved_by, approved_at, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    id, d.visitId, seq, d.status, d.language,
    o?.strength || null, o?.priority_practice || null, o?.next_step || null,
    o?.coaching_questions.ask || null, o?.coaching_questions.describe || null, o?.coaching_questions.ask_again || null,
    JSON.stringify(o?.evidence ?? []), d.provider, d.model, d.simulated ? 1 : 0, JSON.stringify(d.trace),
    d.approvedBy ?? null, d.approvedAt ?? null, d.actorId, ts, ts,
  );
  for (const c of d.citations ?? []) insertCitation(db, id, c);
  return id;
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

export function toCardContext(card: PracticeCard, score?: number): CardContext {
  return {
    id: card.id, version: card.version, title: card.title, description: card.description, steps: card.steps,
    example_prompts: card.example_prompts, example_dialogue: card.example_dialogue, next_step: card.next_step,
    variation: card.variation, tlm: card.tlm, hi: card.localized.hi, score,
    excerpts: (card.chunks ?? []).filter((c) => c.review_status === "approved").map((c) => ({ chunk_id: c.chunk_id, page: c.printed_page ?? c.pdf_page, text: c.text })),
    origin: card.origin,
  };
}

export function buildRetrievalQuery(db: Db, visit: VisitRow, observations: ObservationRow[]): RetrievalQuery {
  const confirmed = all<{ tag_code: string; domain: string }>(
    db,
    `SELECT t.tag_code, r.domain FROM observation_tags t JOIN rubric_tags r ON r.code = t.tag_code
      WHERE t.confirmed = 1 AND t.observation_id IN (SELECT id FROM observations WHERE visit_id = ?)`,
    visit.id,
  );
  const fields: { text: string; weight: number }[] = [];
  if (visit.coaching_focus) fields.push({ text: visit.coaching_focus, weight: 3 });
  for (const o of observations) {
    if (o.improvement_area) fields.push({ text: o.improvement_area, weight: 3 });
    fields.push({ text: o.practice_observed, weight: 2 }, { text: o.evidence, weight: 1 });
  }
  return {
    grade: visit.grade, subject: visit.subject, language: visit.language, fields,
    confirmedTagCodes: [...new Set(confirmed.map((c) => c.tag_code))],
    confirmedTagDomains: [...new Set(confirmed.map((c) => c.domain))],
  };
}

export const generateFeedbackSchema = z.object({
  language: z.enum(["en", "hi"]).optional(),
  /** Explicit mentor choice to use the simulated provider (e.g. after a real-provider failure). */
  use_demo_provider: z.boolean().optional(),
});

export function mapProviderError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof AiProviderError) {
    const status = err.code === "not_configured" ? 503 : err.code === "rate_limited" ? 429 : 502;
    return new AppError(status, `ai_${err.code}`, err.message);
  }
  return new AppError(500, "internal_error", "Something went wrong while generating the draft.");
}

export async function generateFeedback(
  db: Db,
  actor: Actor,
  visitId: string,
  input: unknown = {},
  deps: { provider?: AiProvider } = {},
): Promise<FeedbackDraft> {
  const opts = generateFeedbackSchema.parse(input ?? {});
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict("visit_not_ready", "Feedback can be drafted once the visit is in progress or pending review");
  }
  if (get(db, "SELECT 1 AS x FROM feedback_drafts WHERE visit_id = ? AND status = 'approved'", visitId)) {
    throw conflict("feedback_already_approved", "Feedback for this visit is already approved");
  }
  const observations = all<ObservationRow>(db, "SELECT * FROM observations WHERE visit_id = ? ORDER BY created_at", visitId);
  if (observations.length === 0) throw conflict("no_observations", "Add at least one observation first");

  const language = opts.language ?? visit.language;
  const cards = getApprovedCards(db);
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const { candidates, trace } = keywordRetriever(cards, buildRetrievalQuery(db, visit, observations));

  // No approved evidence: save an explicit "insufficient evidence" state, never a made-up source.
  if (candidates.length === 0) {
    const id = transaction(db, () => {
      const fid = insertFeedbackDraft(db, {
        visitId, actorId: actor.id, status: "insufficient_evidence", language,
        provider: "retrieval", model: null, simulated: false, trace,
      });
      audit(db, actor, "feedback.insufficient_evidence", "feedback", fid, { visit_id: visitId });
      return fid;
    });
    return mapFeedback(db, get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", id)!);
  }

  const task: FeedbackTaskInput = {
    language,
    visit: { grade: visit.grade, subject: visit.subject, purpose: visit.purpose, coaching_focus: visit.coaching_focus },
    observations: observations.map((o) => ({
      id: o.id, practice_observed: o.practice_observed, evidence: o.evidence,
      worked_well: o.worked_well, improvement_area: o.improvement_area,
    })),
    cards: candidates.map((c) => toCardContext(cardsById.get(c.card_id)!, c.score)),
  };
  const prompts = feedbackPrompts(task);

  let validated: ValidatedFeedback;
  let meta: { provider: string; model: string | null; simulated: boolean };
  try {
    const provider = deps.provider ?? getProvider(process.env, opts.use_demo_provider ? "demo" : undefined);
    const res = await provider.generate({ task: { task: "feedback", input: task }, ...prompts, timeoutMs: AI_TIMEOUT_MS });
    meta = { provider: res.provider, model: res.model, simulated: res.simulated };
    validated = validateFeedbackOutput(res.json, candidates, cardsById, new Set(observations.map((o) => o.id)));
  } catch (err) {
    const e = mapProviderError(err);
    audit(db, actor, "feedback.generation_failed", "visit", visitId, { code: e.code });
    throw e;
  }

  const status = validated.output.insufficient_evidence ? "insufficient_evidence" : "draft";
  const id = transaction(db, () => {
    const fid = insertFeedbackDraft(db, {
      visitId, actorId: actor.id, status, language, output: validated.output, citations: validated.citations,
      provider: meta.provider, model: meta.model, simulated: meta.simulated, trace,
    });
    audit(db, actor, status === "draft" ? "feedback.generated" : "feedback.insufficient_evidence", "feedback", fid, {
      visit_id: visitId, provider: meta.provider, simulated: meta.simulated,
      card_ids: validated.citations.map((c) => c.practice_card_id).join(","),
    });
    return fid;
  });
  return mapFeedback(db, get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", id)!);
}

// ---------------------------------------------------------------------------------------------
// Editing, approval, rejection
// ---------------------------------------------------------------------------------------------

export const feedbackEditSchema = z.object({
  expected_updated_at: z.string().max(40).optional(),
  strength: z.string().trim().min(3).max(600).optional(),
  priority_practice: z.string().trim().min(3).max(600).optional(),
  next_step: z.string().trim().min(3).max(500).optional(),
  ask_question: z.string().trim().min(3).max(400).optional(),
  describe_statement: z.string().trim().min(3).max(600).optional(),
  ask_again_question: z.string().trim().min(3).max(400).optional(),
  language: z.enum(["en", "hi"]).optional(),
  /** Replace the supporting sources. First id becomes the primary source. Must be approved cards. */
  citation_card_ids: z.array(z.string()).min(1).max(3).optional(),
});

function loadEditable(db: Db, actor: Actor, feedbackId: string) {
  const fb = get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", feedbackId);
  if (!fb) throw notFound("Feedback draft");
  const visit = getAuthorizedVisit(db, actor, fb.visit_id, "write");
  return { fb, visit };
}

export function editFeedback(db: Db, actor: Actor, feedbackId: string, input: unknown): FeedbackDraft {
  const { fb, visit } = loadEditable(db, actor, feedbackId);
  if (!["draft", "edited", "insufficient_evidence"].includes(fb.status)) {
    throw conflict("feedback_locked", `A ${fb.status} feedback card can no longer be edited`);
  }
  if (visit.status === "completed") throw conflict("visit_locked", "Completed visits are read-only");
  const d = feedbackEditSchema.parse(input);
  assertNotStale(fb.updated_at, d.expected_updated_at);
  const ts = nowIso();

  // Validate new sources BEFORE writing anything.
  let newCitations: Citation[] | undefined;
  if (d.citation_card_ids) {
    const prior = parseJson<RetrievalTrace>(fb.retrieval_trace, {}).candidates ?? [];
    newCitations = d.citation_card_ids.map((cid, idx) => {
      const card = getCardInternal(db, cid);
      if (!card || card.approval_status !== "approved") {
        throw invalid(`"${cid}" is not an approved practice card, so it cannot be cited`);
      }
      attachChunks(db, [card], true);
      if (card.origin === "official_source" && (card.chunks ?? []).length === 0) {
        throw invalid(`"${cid}" has no approved source excerpt, so it cannot be cited`);
      }
      const retrievedIdx = prior.findIndex((p) => p.card_id === cid);
      return buildCitation(
        card,
        retrievedIdx >= 0 ? prior[retrievedIdx].reasons.slice(0, 2).join(" · ") : "Selected by the mentor from the approved library",
        retrievedIdx >= 0 ? retrievedIdx + 1 : null,
        idx === 0,
        (card.chunks ?? []).slice(0, 2).map((c) => c.chunk_id),
      );
    });
  }

  transaction(db, () => {
    run(
      db,
      `UPDATE feedback_drafts SET status='edited', mentor_edited=1, language=COALESCE(?, language),
         strength=COALESCE(?, strength), priority_practice=COALESCE(?, priority_practice), next_step=COALESCE(?, next_step),
         ask_question=COALESCE(?, ask_question), describe_statement=COALESCE(?, describe_statement),
         ask_again_question=COALESCE(?, ask_again_question), updated_at=? WHERE id=?`,
      d.language ?? null, d.strength ?? null, d.priority_practice ?? null, d.next_step ?? null,
      d.ask_question ?? null, d.describe_statement ?? null, d.ask_again_question ?? null, ts, feedbackId,
    );
    if (newCitations) {
      run(db, "DELETE FROM feedback_citations WHERE feedback_id = ?", feedbackId);
      for (const c of newCitations) insertCitation(db, feedbackId, c);
    }
    // Field names only: the audit log never stores the mentor's text.
    audit(db, actor, "feedback.edited", "feedback", feedbackId, {
      visit_id: fb.visit_id, fields: Object.keys(d).filter((k) => k !== "expected_updated_at").join(","),
    });
  });
  return mapFeedback(db, get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", feedbackId)!);
}

export function approveFeedback(db: Db, actor: Actor, feedbackId: string): FeedbackDraft {
  const { fb, visit } = loadEditable(db, actor, feedbackId);
  if (fb.status === "approved") return mapFeedback(db, fb); // idempotent
  if (!["draft", "edited", "insufficient_evidence"].includes(fb.status)) {
    throw conflict("feedback_locked", `A ${fb.status} feedback card cannot be approved`);
  }
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict("visit_not_ready", "The visit must be in progress or pending review to approve feedback");
  }
  const missing = (["strength", "priority_practice", "next_step"] as const).filter((k) => !fb[k]);
  if (missing.length) {
    throw conflict("feedback_incomplete", `Complete these fields before approving: ${missing.join(", ")}`, { missing });
  }
  const cites = loadCitations(db, feedbackId);
  if (cites.length === 0) {
    throw conflict("citation_required", "Select at least one approved source card. SAMVAAD does not approve uncited coaching advice.");
  }
  for (const c of cites) {
    const card = getCardInternal(db, c.practice_card_id);
    if (!card || card.approval_status !== "approved") {
      throw conflict("source_not_approved", `Source card ${c.practice_card_id} is no longer approved. Choose another source.`);
    }
    for (const k of c.chunks) {
      const st = get<{ review_status: string }>(db, "SELECT review_status FROM kb_chunks WHERE chunk_id = ?", k.chunk_id);
      if (st?.review_status !== "approved") {
        throw conflict("source_not_approved", `Source excerpt ${k.chunk_id} is no longer approved. Choose another source.`);
      }
    }
  }
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE feedback_drafts SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?", actor.id, ts, ts, feedbackId);
    run(db, "UPDATE visits SET updated_at=? WHERE id=?", ts, fb.visit_id);
    audit(db, actor, "feedback.approved", "feedback", feedbackId, {
      visit_id: fb.visit_id, mentor_edited: !!fb.mentor_edited, simulated: !!fb.is_simulated,
      card_ids: cites.map((c) => c.practice_card_id).join(","),
    });
  });
  return mapFeedback(db, get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", feedbackId)!);
}

export const rejectSchema = z.object({ reason: z.string().trim().min(3, "Add a short reason").max(300) });

export function rejectFeedback(db: Db, actor: Actor, feedbackId: string, input: unknown): FeedbackDraft {
  const { fb } = loadEditable(db, actor, feedbackId);
  if (!["draft", "edited", "insufficient_evidence"].includes(fb.status)) {
    throw conflict("feedback_locked", `A ${fb.status} feedback card cannot be rejected`);
  }
  const { reason } = rejectSchema.parse(input);
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE feedback_drafts SET status='rejected', rejected_by=?, rejected_at=?, rejection_reason=?, updated_at=? WHERE id=?", actor.id, ts, reason, ts, feedbackId);
    audit(db, actor, "feedback.rejected", "feedback", feedbackId, { visit_id: fb.visit_id });
  });
  return mapFeedback(db, get<FeedbackRowRaw>(db, "SELECT * FROM feedback_drafts WHERE id = ?", feedbackId)!);
}
