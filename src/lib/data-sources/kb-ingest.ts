import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { get, run, transaction, type Db } from "../db/client";
import { nowIso } from "../util";
import { audit } from "../services/audit";
import { parseCsvObjects } from "./csv";
import { dataDir } from "./ingest";

/**
 * Imports the teaching-practice knowledge base (official-source excerpts and source-backed card DRAFTS) from data/knowledge/.
 *
 * Rules:
 *  - the source PDF's checksum in the registry must equal the checksum the excerpts were extracted from,
 *  - imported excerpts start as `pending_review` and cards as `draft`: nothing is usable for coaching until a human curator approves,
 *  - existing cards and reviews are never overwritten; if an excerpt's TEXT changes, its review is reset and linked approved cards go back to draft,
 *  - idempotent (re-running changes nothing),
 *  - kept separate from the public statistics tables.
 */
export interface KbIngestResult {
  status: "imported" | "unchanged" | "rejected";
  newChunks: number;
  changedChunks: number;
  newCards: number;
  detail: string;
}

const chunkSchema = z.object({
  chunk_id: z.string().min(3), kb_source_id: z.string().min(3), pdf_page: z.number().int().min(1), printed_page: z.number().int().nullable(),
  text: z.string().min(20).max(900), text_sha256: z.string().length(64), language: z.string(),
});
const cardSchema = z.object({
  id: z.string().regex(/^K-[A-Z]\d{2}$/), title: z.string().min(3), domain: z.string().min(2), grade_min: z.number().int(), grade_max: z.number().int(),
  subject: z.string(), teaching_language: z.enum(["any", "en", "hi"]), description: z.string().min(20), steps: z.array(z.string()).min(1),
  example_prompts: z.array(z.string()), next_step: z.string().min(10), variation: z.string().nullable(), example_dialogue: z.array(z.string()),
  tlm: z.array(z.string()), tags: z.array(z.string()), chunks: z.array(z.tuple([z.string(), z.enum(["primary", "supporting"])])).min(1),
});

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function reject(detail: string): KbIngestResult {
  return { status: "rejected", newChunks: 0, changedChunks: 0, newCards: 0, detail };
}

export function ingestKnowledgeBase(db: Db, dir = dataDir()): KbIngestResult {
  const chunkFile = readJson<{ source_id: string; source_sha256: string; extracted_at_utc: string; chunks: unknown[] }>(path.join(dir, "knowledge", "kb_chunks.json"));
  const cardFile = readJson<{ source_ref: { source_org: string; source_title: string; source_url: string; source_type: string }; cards: unknown[] }>(path.join(dir, "knowledge", "kb_cards.json"));
  if (!chunkFile || !cardFile) return reject("Knowledge-base files are missing. Run `npm run kb:extract`.");

  let registry: Record<string, string>[] = [];
  try {
    registry = parseCsvObjects(fs.readFileSync(path.join(dir, "source_registry.csv"), "utf8"));
  } catch {
    return reject("source_registry.csv is missing or unreadable.");
  }
  const src = registry.find((r) => r.source_id === chunkFile.source_id);
  if (!src || src.access_status !== "downloaded_and_validated") return reject(`Source ${chunkFile.source_id} is not a validated, downloaded source in the registry.`);
  if (src.sha256 !== chunkFile.source_sha256) {
    return reject("The excerpts were extracted from a different file than the one recorded in the registry (checksum mismatch). Re-run `npm run kb:extract`.");
  }

  let chunks: z.infer<typeof chunkSchema>[];
  let cards: z.infer<typeof cardSchema>[];
  try {
    chunks = chunkFile.chunks.map((c) => chunkSchema.parse(c));
    cards = cardFile.cards.map((c) => cardSchema.parse(c));
  } catch (err) {
    return reject(`Knowledge-base files failed validation: ${(err as Error).message.slice(0, 200)}`);
  }
  const chunkIds = new Set(chunks.map((c) => c.chunk_id));
  const dangling = cards.flatMap((c) => c.chunks).find(([id]) => !chunkIds.has(id));
  if (dangling) return reject(`A card references the unknown excerpt ${dangling[0]}.`);

  let newChunks = 0, changedChunks = 0, newCards = 0;
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO kb_sources (kb_source_id, title, publisher, source_url, version_note, licence_note, language, file_sha256, retrieved_at_utc, extracted_at_utc, imported_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (kb_source_id) DO UPDATE SET file_sha256 = excluded.file_sha256, extracted_at_utc = excluded.extracted_at_utc, retrieved_at_utc = excluded.retrieved_at_utc`,
      chunkFile.source_id, src.source_name, src.publisher, src.source_url, src.reference_year_or_period, src.licence_or_terms, "en",
      src.sha256, src.retrieved_at_utc || null, chunkFile.extracted_at_utc, ts,
    );

    for (const c of chunks) {
      const existing = get<{ text_sha256: string }>(db, "SELECT text_sha256 FROM kb_chunks WHERE chunk_id = ?", c.chunk_id);
      if (!existing) {
        run(
          db,
          `INSERT INTO kb_chunks (chunk_id, kb_source_id, pdf_page, printed_page, text, text_sha256, language, review_status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?, 'pending_review', ?, ?)`,
          c.chunk_id, c.kb_source_id, c.pdf_page, c.printed_page, c.text, c.text_sha256, c.language, ts, ts,
        );
        newChunks++;
      } else if (existing.text_sha256 !== c.text_sha256) {
        // The excerpt's wording changed: the old approval no longer applies.
        run(
          db,
          `UPDATE kb_chunks SET pdf_page=?, printed_page=?, text=?, text_sha256=?, review_status='pending_review', reviewed_by=NULL, reviewed_at=NULL,
             review_notes='Excerpt text changed after re-extraction; needs review again.', updated_at=? WHERE chunk_id=?`,
          c.pdf_page, c.printed_page, c.text, c.text_sha256, ts, c.chunk_id,
        );
        run(
          db,
          `UPDATE practice_cards SET approval_status='draft', last_reviewed_at=NULL, reviewed_by=NULL, updated_at=?,
             review_notes='Returned to draft: a source excerpt changed.'
           WHERE approval_status='approved' AND id IN (SELECT card_id FROM practice_card_chunks WHERE chunk_id=?)`,
          ts, c.chunk_id,
        );
        audit(db, null, "kb_chunk.changed", "kb_chunk", c.chunk_id, {});
        changedChunks++;
      }
    }

    const ref = cardFile.source_ref;
    for (const card of cards) {
      if (get(db, "SELECT 1 AS x FROM practice_cards WHERE id = ?", card.id)) continue; // never overwrite an existing (possibly reviewed) card
      const pages = card.chunks.map(([id]) => chunks.find((c) => c.chunk_id === id)!).map((c) => c.printed_page ?? c.pdf_page);
      const section = `Printed page${new Set(pages).size > 1 ? "s" : ""} ${[...new Set(pages)].sort((a, b) => a - b).join(", ")}`;
      run(
        db,
        `INSERT INTO practice_cards (id, version, title, domain, grade_min, grade_max, subject, teaching_language, description, steps, example_prompts,
           next_step, variation, example_dialogue, tlm, tags, localized, source_org, source_title, source_section, source_url, source_type,
           approval_status, review_notes, is_demo, origin, created_at, updated_at)
         VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '{}', ?,?,?,?,?, 'draft', ?, 0, 'official_source', ?, ?)`,
        card.id, card.title, card.domain, card.grade_min, card.grade_max, card.subject, card.teaching_language, card.description,
        JSON.stringify(card.steps), JSON.stringify(card.example_prompts), card.next_step, card.variation, JSON.stringify(card.example_dialogue),
        JSON.stringify(card.tlm), JSON.stringify(card.tags), ref.source_org, ref.source_title, section, ref.source_url, ref.source_type,
        "Awaiting human content review. Steps and next-step wording were drafted by SAMVAAD from the cited excerpts; the curator must check them against the source.",
        ts, ts,
      );
      run(db, "INSERT INTO practice_card_versions (card_id, version, snapshot, changed_by, changed_at) VALUES (?,?,?,?,?)", card.id, 1, JSON.stringify({ id: card.id, title: card.title, imported: true }), null, ts);
      for (const [chunkId, role] of card.chunks) {
        run(db, "INSERT INTO practice_card_chunks (card_id, chunk_id, role) VALUES (?,?,?)", card.id, chunkId, role);
      }
      newCards++;
    }
    if (newChunks + changedChunks + newCards > 0) {
      audit(db, null, "kb.imported", "kb_source", chunkFile.source_id, { new_chunks: newChunks, changed_chunks: changedChunks, new_cards: newCards });
    }
  });
  if (newChunks + changedChunks + newCards === 0) return { status: "unchanged", newChunks, changedChunks, newCards, detail: "Knowledge base already imported; nothing changed." };
  return { status: "imported", newChunks, changedChunks, newCards, detail: `Imported ${newChunks} excerpt(s) and ${newCards} card draft(s) as pending review.` };
}

/** Called when the app database is opened. Never throws. */
export function autoKbIngest(db: Db): void {
  if (process.env.SAMVAAD_AUTO_PUBLIC_INGEST === "false") return;
  try {
    ingestKnowledgeBase(db);
  } catch (err) {
    console.error("[knowledge-base] auto-ingest failed:", err instanceof Error ? err.message : "unknown");
  }
}
