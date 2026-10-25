import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { nowIso, parseJson } from "../util";
import { conflict, invalid, notFound } from "../errors";
import { requireRole, can } from "../auth/policy";
import { audit } from "./audit";
import type { Actor, CardChunk, PracticeCard, PracticeCardRow } from "../types";

export function rowToCard(r: PracticeCardRow): PracticeCard {
  return {
    ...r,
    steps: parseJson<string[]>(r.steps, []),
    example_prompts: parseJson<string[]>(r.example_prompts, []),
    example_dialogue: parseJson<string[]>(r.example_dialogue, []),
    tlm: parseJson<string[]>(r.tlm, []),
    tags: parseJson<string[]>(r.tags, []),
    localized: parseJson<PracticeCard["localized"]>(r.localized, {}),
  };
}

export function getCardInternal(db: Db, id: string): PracticeCard | undefined {
  const r = get<PracticeCardRow>(db, "SELECT * FROM practice_cards WHERE id = ?", id);
  return r ? rowToCard(r) : undefined;
}

/** Load the source excerpts of official-source cards. `approvedOnly` is used by retrieval; curators see every state. */
export function attachChunks(db: Db, cards: PracticeCard[], approvedOnly: boolean): PracticeCard[] {
  for (const c of cards) {
    if (c.origin !== "official_source") continue;
    c.chunks = all<CardChunk>(
      db,
      `SELECT k.chunk_id, pc.role, k.pdf_page, k.printed_page, k.text, k.review_status
         FROM practice_card_chunks pc JOIN kb_chunks k ON k.chunk_id = pc.chunk_id
        WHERE pc.card_id = ? ${approvedOnly ? "AND k.review_status = 'approved'" : ""}
        ORDER BY (pc.role = 'primary') DESC, k.pdf_page, k.chunk_id`,
      c.id,
    );
  }
  return cards;
}

/**
 * Cards eligible to support coaching: approved, and (for official-source cards) backed by at least one APPROVED excerpt.
 */
export function getApprovedCards(db: Db): PracticeCard[] {
  const cards = all<PracticeCardRow>(
    db,
    `SELECT * FROM practice_cards p WHERE p.approval_status = 'approved' AND (p.origin = 'illustrative' OR EXISTS (
         SELECT 1 FROM practice_card_chunks pc JOIN kb_chunks k ON k.chunk_id = pc.chunk_id
          WHERE pc.card_id = p.id AND k.review_status = 'approved'))`,
  ).map(rowToCard);
  return attachChunks(db, cards, true);
}

export const cardFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  subject: z.string().trim().max(40).optional(),
  grade: z.coerce.number().int().min(0).max(12).optional(),
  domain: z.string().trim().max(80).optional(),
  status: z.enum(["draft", "approved", "rejected"]).optional(),
});

export function listCards(db: Db, actor: Actor, rawFilter: unknown = {}): PracticeCard[] {
  requireRole(actor, "card:read_approved");
  const f = cardFilterSchema.parse(rawFilter);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!can(actor, "card:read_all")) {
    where.push("approval_status = 'approved'"); // only curators see drafts / rejected cards
  } else if (f.status) {
    where.push("approval_status = ?");
    params.push(f.status);
  }
  if (f.subject) { where.push("(subject = ? OR subject = 'Any' OR (subject = 'Language' AND ? IN ('Hindi', 'English')))"); params.push(f.subject, f.subject); }
  if (f.grade !== undefined) { where.push("grade_min <= ? AND grade_max >= ?"); params.push(f.grade, f.grade); }
  if (f.domain) { where.push("domain = ?"); params.push(f.domain); }
  if (f.q) {
    where.push("(title LIKE ? OR description LIKE ? OR tags LIKE ? OR id LIKE ?)");
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  return all<PracticeCardRow>(
    db,
    `SELECT * FROM practice_cards ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY domain, id`,
    ...params,
  ).map(rowToCard);
}

export function getCard(db: Db, actor: Actor, id: string): PracticeCard {
  requireRole(actor, "card:read_approved");
  const card = getCardInternal(db, id);
  if (!card || (card.approval_status !== "approved" && !can(actor, "card:read_all"))) throw notFound("Practice card");
  attachChunks(db, [card], !can(actor, "card:read_all"));
  return card;
}

export function cardDomains(db: Db): string[] {
  return all<{ domain: string }>(db, "SELECT DISTINCT domain FROM practice_cards ORDER BY domain").map((r) => r.domain);
}

const strList = (max: number) => z.array(z.string().trim().min(1).max(400)).max(max);

export const cardInputSchema = z.object({
  id: z.string().trim().regex(/^[A-Z]{1,3}-\d{2,3}$/, "Use an id like R-14").optional(),
  title: z.string().trim().min(3).max(160),
  domain: z.string().trim().min(2).max(80),
  grade_min: z.coerce.number().int().min(0).max(12),
  grade_max: z.coerce.number().int().min(0).max(12),
  subject: z.string().trim().min(2).max(40),
  teaching_language: z.enum(["any", "en", "hi"]).default("any"),
  description: z.string().trim().min(10).max(1500),
  steps: strList(12).min(1),
  example_prompts: strList(10).default([]),
  next_step: z.string().trim().min(10).max(400),
  variation: z.string().trim().max(600).optional().or(z.literal("")),
  example_dialogue: strList(12).default([]),
  tlm: strList(10).default([]),
  tags: strList(30).default([]),
  localized: z
    .object({
      hi: z
        .object({
          title: z.string(), summary: z.string(), next_step: z.string(),
          steps: z.array(z.string()), prompts: z.array(z.string()), dialogue: z.array(z.string()).default([]),
        })
        .optional(),
    })
    .default({}),
  source_org: z.string().trim().min(2).max(160),
  source_title: z.string().trim().min(2).max(240),
  source_section: z.string().trim().max(160).optional(),
  source_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  source_type: z.string().trim().max(40).default("illustrative"),
});
export type CardInput = z.infer<typeof cardInputSchema>;

function snapshot(db: Db, actor: Actor | null, cardId: string) {
  const row = get<PracticeCardRow>(db, "SELECT * FROM practice_cards WHERE id = ?", cardId)!;
  run(
    db,
    "INSERT OR REPLACE INTO practice_card_versions (card_id, version, snapshot, changed_by, changed_at) VALUES (?,?,?,?,?)",
    cardId, row.version, JSON.stringify(row), actor?.id ?? null, nowIso(),
  );
}

function nextCardId(db: Db, domain: string): string {
  const prefix = (domain.match(/[A-Za-z]/)?.[0] ?? "X").toUpperCase();
  for (let n = 1; n < 1000; n++) {
    const id = `${prefix}-${String(n).padStart(2, "0")}`;
    if (!get(db, "SELECT 1 AS x FROM practice_cards WHERE id = ?", id)) return id;
  }
  throw conflict("id_exhausted", "No free card id");
}

function writeCardFields(c: CardInput) {
  return [
    c.title, c.domain, c.grade_min, c.grade_max, c.subject, c.teaching_language, c.description,
    JSON.stringify(c.steps), JSON.stringify(c.example_prompts), c.next_step, c.variation || null, JSON.stringify(c.example_dialogue), JSON.stringify(c.tlm), JSON.stringify(c.tags),
    JSON.stringify(c.localized), c.source_org, c.source_title, c.source_section ?? null,
    c.source_url || null, c.source_type,
  ] as const;
}

export function createCard(db: Db, actor: Actor, input: unknown): PracticeCard {
  requireRole(actor, "card:write");
  const c = cardInputSchema.parse(input);
  if (c.grade_min > c.grade_max) throw invalid("Minimum grade cannot exceed maximum grade");
  const id = c.id ?? nextCardId(db, c.domain);
  if (get(db, "SELECT 1 AS x FROM practice_cards WHERE id = ?", id)) {
    throw conflict("duplicate_card_id", `A card with id ${id} already exists`);
  }
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO practice_cards (id, version, title, domain, grade_min, grade_max, subject, teaching_language,
         description, steps, example_prompts, next_step, variation, example_dialogue, tlm, tags, localized,
         source_org, source_title, source_section, source_url, source_type, approval_status, curator_id,
         is_demo, created_at, updated_at)
       VALUES (?, 1, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft', ?, 0, ?, ?)`,
      id, ...writeCardFields(c), actor.id, ts, ts,
    );
    snapshot(db, actor, id);
    audit(db, actor, "practice_card.created", "practice_card", id, { version: 1 });
  });
  return getCardInternal(db, id)!;
}

/** Editing a card bumps its version and sends it back to "draft": it must be re-approved before use. */
export function reviseCard(db: Db, actor: Actor, id: string, input: unknown): PracticeCard {
  requireRole(actor, "card:write");
  const existing = getCardInternal(db, id);
  if (!existing) throw notFound("Practice card");
  const merged = Object.fromEntries(Object.entries({ ...existing, ...(input as object), id: undefined }).map(([k, v]) => [k, v === null ? undefined : v]));
  const c = cardInputSchema.parse(merged);
  if (c.grade_min > c.grade_max) throw invalid("Minimum grade cannot exceed maximum grade");
  const version = existing.version + 1;
  transaction(db, () => {
    run(
      db,
      `UPDATE practice_cards SET version=?, title=?, domain=?, grade_min=?, grade_max=?, subject=?, teaching_language=?,
         description=?, steps=?, example_prompts=?, next_step=?, variation=?, example_dialogue=?, tlm=?, tags=?, localized=?, source_org=?, source_title=?,
         source_section=?, source_url=?, source_type=?, approval_status='draft', last_reviewed_at=NULL,
         reviewed_by=NULL, updated_at=? WHERE id=?`,
      version, ...writeCardFields(c), nowIso(), id,
    );
    snapshot(db, actor, id);
    audit(db, actor, "practice_card.revised", "practice_card", id, { version, was: existing.approval_status });
  });
  return getCardInternal(db, id)!;
}

export const cardReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(600).optional(),
});

export function reviewCard(db: Db, actor: Actor, id: string, input: unknown): PracticeCard {
  requireRole(actor, "card:review");
  const d = cardReviewSchema.parse(input);
  const card = getCardInternal(db, id);
  if (!card) throw notFound("Practice card");
  if (d.decision === "reject" && !d.notes) throw invalid("Add a short note explaining the rejection");
  if (d.decision === "approve" && card.origin === "official_source") {
    // A card built from an official document may only be approved once a human has approved every excerpt it relies on.
    const chunks = all<{ chunk_id: string; review_status: string }>(
      db,
      "SELECT k.chunk_id, k.review_status FROM practice_card_chunks pc JOIN kb_chunks k ON k.chunk_id = pc.chunk_id WHERE pc.card_id = ?",
      id,
    );
    const pending = chunks.filter((c) => c.review_status !== "approved");
    if (chunks.length === 0 || pending.length > 0) {
      throw conflict(
        "chunks_unreviewed",
        chunks.length === 0
          ? "This card has no source excerpts, so it cannot be approved as an official-source card."
          : `Review the source excerpts first. ${pending.length} of ${chunks.length} are not approved.`,
        { pending: pending.map((c) => c.chunk_id) },
      );
    }
  }
  const ts = nowIso();
  transaction(db, () => {
    if (d.decision === "approve") {
      run(
        db,
        "UPDATE practice_cards SET approval_status='approved', last_reviewed_at=?, reviewed_by=?, review_notes=?, updated_at=? WHERE id=?",
        ts, actor.id, d.notes ?? card.review_notes, ts, id,
      );
    } else {
      run(
        db,
        "UPDATE practice_cards SET approval_status='rejected', last_reviewed_at=?, reviewed_by=?, review_notes=?, updated_at=? WHERE id=?",
        ts, actor.id, d.notes ?? null, ts, id,
      );
    }
    audit(db, actor, d.decision === "approve" ? "practice_card.approved" : "practice_card.rejected", "practice_card", id, {
      version: card.version,
    });
  });
  return getCardInternal(db, id)!;
}

// ---- Source-excerpt (chunk) review ------------------------------------------------------------------------------------

export const chunkReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(600).optional(),
});

export interface ChunkView {
  chunk_id: string;
  kb_source_id: string;
  pdf_page: number;
  printed_page: number | null;
  text: string;
  review_status: "pending_review" | "approved" | "rejected";
  reviewed_at: string | null;
  review_notes: string | null;
  cards: string[];
}

export function getChunk(db: Db, actor: Actor, chunkId: string): ChunkView {
  requireRole(actor, "card:read_all");
  const k = get<Omit<ChunkView, "cards">>(
    db,
    "SELECT chunk_id, kb_source_id, pdf_page, printed_page, text, review_status, reviewed_at, review_notes FROM kb_chunks WHERE chunk_id = ?",
    chunkId,
  );
  if (!k) throw notFound("Source excerpt");
  const cards = all<{ card_id: string }>(db, "SELECT card_id FROM practice_card_chunks WHERE chunk_id = ?", chunkId).map((r) => r.card_id);
  return { ...k, cards };
}

/**
 * A curator approves or rejects one verbatim excerpt. Rejecting an excerpt immediately returns every approved card that
 * relied on it to "draft", so a revoked source can never keep supporting coaching advice.
 */
export function reviewChunk(db: Db, actor: Actor, chunkId: string, input: unknown): ChunkView {
  requireRole(actor, "card:review");
  const d = chunkReviewSchema.parse(input);
  const chunk = getChunk(db, actor, chunkId);
  if (d.decision === "reject" && !d.notes) throw invalid("Add a short note explaining the rejection");
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      "UPDATE kb_chunks SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?, updated_at = ? WHERE chunk_id = ?",
      d.decision === "approve" ? "approved" : "rejected", actor.id, ts, d.notes ?? null, ts, chunkId,
    );
    audit(db, actor, d.decision === "approve" ? "kb_chunk.approved" : "kb_chunk.rejected", "kb_chunk", chunkId, { page: chunk.printed_page ?? chunk.pdf_page });
    if (d.decision === "reject") {
      for (const cardId of chunk.cards) {
        const card = get<{ approval_status: string }>(db, "SELECT approval_status FROM practice_cards WHERE id = ?", cardId);
        if (card?.approval_status === "approved") {
          run(db, "UPDATE practice_cards SET approval_status='draft', last_reviewed_at=NULL, reviewed_by=NULL, review_notes=?, updated_at=? WHERE id=?",
            `Returned to draft: source excerpt ${chunkId} was rejected.`, ts, cardId);
          audit(db, actor, "practice_card.rejected", "practice_card", cardId, { reason: "source_excerpt_rejected", chunk: chunkId });
        }
      }
    }
  });
  return getChunk(db, actor, chunkId);
}
