import type { PracticeCard, RetrievalCandidate, RetrievalTrace, Lang } from "../types";

/**
 * Explainable keyword retrieval over APPROVED practice cards.
 *
 * Deliberately simple and deterministic: every score can be traced to the matched terms and
 * the confirmed rubric tags that produced it, and that trace is stored with the feedback draft
 * so a mentor can inspect *why* a card was suggested.
 *
 * Vector search is a replaceable extension: any function matching `Retriever` can be swapped in
 * (e.g. pgvector once Postgres + embeddings exist). Nothing here pretends embeddings exist.
 */
export interface RetrievalQuery {
  grade: number;
  subject: string;
  language: Lang;
  /** weighted free text from the visit and its observations */
  fields: { text: string; weight: number }[];
  /** rubric tags the mentor has CONFIRMED (suggestions never count) */
  confirmedTagCodes: string[];
  confirmedTagDomains: string[];
}

export type Retriever = (cards: PracticeCard[], q: RetrievalQuery) => { candidates: RetrievalCandidate[]; trace: RetrievalTrace };

export const MIN_SCORE = 5;
/** Extra relevance for cards backed by an official published source (applied only after the relevance threshold is met). */
export const OFFICIAL_SOURCE_BONUS = 2.5;
const MAX_CHUNKS_PER_CARD = 2;

/** "Language" cards apply to Hindi and English; "Any" applies to every subject. */
export function subjectMatches(cardSubject: string, visitSubject: string): boolean {
  return cardSubject === "Any" || cardSubject === visitSubject || (cardSubject === "Language" && (visitSubject === "Hindi" || visitSubject === "English"));
}
export const MAX_CANDIDATES = 3;

const STOP = new Set(
  "the a an and or of to in on at for with was were is are be been it its this that these those they them their there then than as by from into after before about over under not no few some many very more most each every one two three also have has had do does did can could should would will may might just only so if when while which who what why how".split(
    " ",
  ),
);

/** Very light stemming; enough to line up "questions"/"question", "reading"/"read". */
export function stem(w: string): string {
  if (!/^[a-z]+$/.test(w) || w.length <= 4) return w;
  return w.replace(/(ing|ed|es|s)$/, "");
}

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    const latin = /^[a-z0-9]+$/.test(t);
    if (STOP.has(t)) continue;
    if (latin && t.length < 3) continue;
    if (!latin && t.length < 2) continue;
    out.push(stem(t));
  }
  return out;
}

function fieldWeights(card: PracticeCard) {
  const lt = card.localized.hi;
  return [
    { name: "title/tags", weight: 2, tokens: new Set(tokenize([card.title, ...card.tags, lt?.title ?? ""].join(" "))) },
    { name: "domain", weight: 1.5, tokens: new Set(tokenize(card.domain)) },
    { name: "description", weight: 1, tokens: new Set(tokenize([card.description, lt?.summary ?? "", ...(card.chunks ?? []).map((c) => c.text)].join(" "))) },
    {
      name: "steps/prompts",
      weight: 0.5,
      tokens: new Set(tokenize([...card.steps, ...card.example_prompts, ...(lt?.prompts ?? [])].join(" "))),
    },
  ];
}

export const keywordRetriever: Retriever = (cards, q) => {
  // Query term -> weight (max across fields it appears in)
  const termWeight = new Map<string, number>();
  for (const f of q.fields) {
    for (const t of tokenize(f.text)) termWeight.set(t, Math.max(termWeight.get(t) ?? 0, f.weight));
  }

  const candidates: RetrievalCandidate[] = [];
  for (const card of cards) {
    // Hard eligibility filters (the caller already restricts to approved cards; re-checked here).
    if (card.approval_status !== "approved") continue;
    if (q.grade < card.grade_min || q.grade > card.grade_max) continue;
    if (!subjectMatches(card.subject, q.subject)) continue;
    if (card.teaching_language !== "any" && card.teaching_language !== q.language) continue;

    const fields = fieldWeights(card);
    let score = 0;
    const matched: string[] = [];
    for (const [term, qw] of termWeight) {
      const best = fields.reduce((acc, f) => (f.tokens.has(term) ? Math.max(acc, f.weight) : acc), 0);
      if (best > 0) {
        score += qw * best;
        matched.push(term);
      }
    }
    const reasons: string[] = [];
    const tagHits = q.confirmedTagCodes.filter((c) => card.tags.includes(c));
    if (tagHits.length) {
      score += 4 * tagHits.length;
      reasons.push(`Linked to confirmed rubric tag${tagHits.length > 1 ? "s" : ""} ${tagHits.join(", ")}`);
    }
    if (q.confirmedTagDomains.includes(card.domain)) {
      score += 1.5;
      reasons.push(`Same teaching domain as confirmed tags (${card.domain})`);
    }
    if (matched.length) reasons.push(`Matched observation terms: ${matched.slice(0, 8).join(", ")}`);
    reasons.push(
      `Applies to grade ${card.grade_min === card.grade_max ? card.grade_min : `${card.grade_min}–${card.grade_max}`}, ${card.subject === "Any" ? "any subject" : card.subject}`,
    );

    let chunkIds: string[] = [];
    if (card.origin === "official_source") {
      // Official-source cards may only be cited together with the excerpts that support them.
      const approved = (card.chunks ?? []).filter((c) => c.review_status === "approved");
      if (approved.length === 0) continue;
      const overlap = (text: string) => tokenize(text).filter((t, i, a) => a.indexOf(t) === i && termWeight.has(t)).length;
      chunkIds = [...approved]
        .sort((a, b) => overlap(b.text) - overlap(a.text) || (a.role === "primary" ? -1 : 1) - (b.role === "primary" ? -1 : 1))
        .slice(0, MAX_CHUNKS_PER_CARD)
        .map((c) => c.chunk_id);
    }
    if (score >= MIN_SCORE) {
      if (card.origin === "official_source") {
        score += OFFICIAL_SOURCE_BONUS;
        reasons.unshift(`Official-source card: cites excerpt(s) from ${card.source_title} (printed p. ${[...new Set((card.chunks ?? []).filter((c) => chunkIds.includes(c.chunk_id)).map((c) => c.printed_page ?? c.pdf_page))].join(", ")})`);
      }
      candidates.push({
        card_id: card.id,
        card_version: card.version,
        title: card.title,
        score: Number(score.toFixed(2)),
        matched_terms: matched,
        reasons,
        origin: card.origin,
        chunk_ids: chunkIds,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.card_id.localeCompare(b.card_id));
  const top = candidates.slice(0, MAX_CANDIDATES);
  return {
    candidates: top,
    trace: {
      query_terms: [...termWeight.keys()].slice(0, 40),
      candidates: top,
      min_score: MIN_SCORE,
      note: top.length ? undefined : "No approved card scored above the relevance threshold",
    },
  };
};
