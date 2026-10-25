import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, get, run } from "@/lib/db/client";
import { asha, freshDb, ishaan } from "./helpers";
import { ingestKnowledgeBase } from "@/lib/data-sources/kb-ingest";
import { getApprovedCards, getCard, reviewCard, reviewChunk } from "@/lib/services/practice-cards";
import { approveFeedback, buildCitation, editFeedback, generateFeedback } from "@/lib/services/feedback";
import { generateDemonstration, approveDemonstration } from "@/lib/services/demonstrations";
import { transitionVisit, listVisits } from "@/lib/services/visits";
import { addObservation } from "@/lib/services/observations";
import { keywordRetriever } from "@/lib/engines/retrieval";
import { buildRetrievalQuery } from "@/lib/services/feedback";
import { pdfPages, toLines } from "../scripts/data/lib";
import type { AppError } from "@/lib/errors";

const REAL = path.join(process.cwd(), "data");
const hasKb = fs.existsSync(path.join(REAL, "knowledge", "kb_chunks.json")) && fs.existsSync(path.join(REAL, "source_registry.csv"));
const pdf = path.join(REAL, "raw", "kb_nipun_bharat_guidelines.pdf");

const codeOf = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return (e as AppError).code ?? (e as Error).message; }
  return "no-error";
};

function loaded() {
  const db = freshDb(true);
  const r = ingestKnowledgeBase(db, REAL);
  expect(r.status).toBe("imported");
  return db;
}
function approveCard(db: ReturnType<typeof freshDb>, cardId: string) {
  const ids = all<{ chunk_id: string }>(db, "SELECT chunk_id FROM practice_card_chunks WHERE card_id = ?", cardId).map((c) => c.chunk_id);
  for (const id of ids) reviewChunk(db, ishaan(db), id, { decision: "approve" });
  return reviewCard(db, ishaan(db), cardId, { decision: "approve", notes: "Checked against the source." });
}

describe.skipIf(!hasKb)("knowledge base: import and review gating", () => {
  it("imports excerpts and card drafts as PENDING REVIEW, idempotently, and none are usable yet", () => {
    const db = loaded();
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM kb_chunks WHERE review_status = 'pending_review'")!.n).toBe(19);
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM practice_cards WHERE origin = 'official_source' AND approval_status = 'draft'")!.n).toBe(9);
    expect(getApprovedCards(db).some((c) => c.origin === "official_source")).toBe(false);
    expect(ingestKnowledgeBase(db, REAL).status).toBe("unchanged");
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM kb_chunks")!.n).toBe(19);
    expect(all<{ action: string }>(db, "SELECT action FROM audit_logs").some((a) => a.action === "kb.imported")).toBe(true);
  });

  it("every official card has source metadata and at least one excerpt with a page number", () => {
    const db = loaded();
    const cards = all<{ id: string; source_url: string; source_section: string; source_type: string }>(db, "SELECT id, source_url, source_section, source_type FROM practice_cards WHERE origin = 'official_source'");
    expect(cards.length).toBe(9);
    for (const c of cards) {
      expect(c.source_url).toMatch(/^https:\/\//);
      expect(c.source_section).toMatch(/^Printed page/);
      expect(c.source_type).toBe("official_document");
      const n = get<{ n: number }>(db, "SELECT count(*) AS n FROM practice_card_chunks WHERE card_id = ?", c.id)!.n;
      expect(n).toBeGreaterThan(0);
    }
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM kb_chunks WHERE printed_page IS NULL OR pdf_page IS NULL")!.n).toBe(0);
  });

  it("a card cannot be approved until a curator has approved each excerpt; only curators may review", () => {
    const db = loaded();
    expect(codeOf(() => reviewCard(db, ishaan(db), "K-R01", { decision: "approve" }))).toBe("chunks_unreviewed");
    expect(codeOf(() => reviewChunk(db, asha(db), "NBG-p6-readaloud", { decision: "approve" }))).toBe("forbidden");
    expect(codeOf(() => reviewChunk(db, ishaan(db), "NBG-p6-readaloud", { decision: "reject" }))).toBe("validation_failed"); // note required
    const card = approveCard(db, "K-R01");
    expect(card.approval_status).toBe("approved");
    const approved = getApprovedCards(db).find((c) => c.id === "K-R01");
    expect(approved?.chunks?.length).toBe(4);
    expect(approved?.chunks?.every((c) => c.review_status === "approved")).toBe(true);
  });

  it("an approved card is withdrawn the moment one of its excerpts is rejected", () => {
    const db = loaded();
    approveCard(db, "K-R01");
    reviewChunk(db, ishaan(db), "NBG-p6-readaloud", { decision: "reject", notes: "Misquoted." });
    expect(get<{ approval_status: string }>(db, "SELECT approval_status FROM practice_cards WHERE id='K-R01'")!.approval_status).toBe("draft");
    expect(getApprovedCards(db).some((c) => c.id === "K-R01")).toBe(false);
  });

  it("re-extraction that changes an excerpt resets its review and returns the card to draft", () => {
    const db = loaded();
    approveCard(db, "K-N01");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-kb-"));
    for (const f of ["source_registry.csv", "knowledge/kb_chunks.json", "knowledge/kb_cards.json"]) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
    }
    const file = path.join(dir, "knowledge/kb_chunks.json");
    const k = JSON.parse(fs.readFileSync(file, "utf8"));
    const c = k.chunks.find((x: { chunk_id: string }) => x.chunk_id === "NBG-p89-estimation");
    c.text = c.text + " (edited)";
    c.text_sha256 = "0".repeat(63) + "1";
    fs.writeFileSync(file, JSON.stringify(k));
    const r = ingestKnowledgeBase(db, dir);
    expect(r.status).toBe("imported");
    expect(r.changedChunks).toBe(1);
    expect(get<{ review_status: string }>(db, "SELECT review_status FROM kb_chunks WHERE chunk_id='NBG-p89-estimation'")!.review_status).toBe("pending_review");
    expect(get<{ approval_status: string }>(db, "SELECT approval_status FROM practice_cards WHERE id='K-N01'")!.approval_status).toBe("draft");
  });

  it("rejects excerpts extracted from a different file than the registry recorded", () => {
    const db = freshDb(true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-kb-"));
    for (const f of ["source_registry.csv", "knowledge/kb_chunks.json", "knowledge/kb_cards.json"]) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
    }
    const file = path.join(dir, "knowledge/kb_chunks.json");
    const k = JSON.parse(fs.readFileSync(file, "utf8"));
    k.source_sha256 = "f".repeat(64);
    fs.writeFileSync(file, JSON.stringify(k));
    const r = ingestKnowledgeBase(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/checksum/);
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM kb_chunks")!.n).toBe(0);
  });
});

describe.skipIf(!hasKb || !fs.existsSync(pdf))("knowledge base: excerpts are verbatim from the real PDF", () => {
  it("every stored excerpt appears word-for-word on its recorded PDF page", async () => {
    const k = JSON.parse(fs.readFileSync(path.join(REAL, "knowledge", "kb_chunks.json"), "utf8")) as { chunks: { chunk_id: string; pdf_page: number; text: string }[] };
    const pages = [...new Set(k.chunks.map((c) => c.pdf_page))];
    const text = new Map<number, string>();
    for (const p of await pdfPages(pdf, pages)) text.set(p.page, toLines(p.items).map((l) => l.cells.map((c) => c.str).join(" ")).join(" ").replace(/\s+/g, " "));
    for (const c of k.chunks) expect(text.get(c.pdf_page)!.includes(c.text), c.chunk_id).toBe(true);
  }, 60_000);
});

describe.skipIf(!hasKb)("knowledge base: retrieval, citations and the feedback flow", () => {
  /** Disable the illustrative reading card so the official card is the clear match. */
  function officialOnlyDb() {
    const db = loaded();
    run(db, "UPDATE practice_cards SET approval_status = 'draft', last_reviewed_at = NULL, reviewed_by = NULL WHERE origin = 'illustrative'");
    approveCard(db, "K-R01");
    return db;
  }
  async function startedReadAloudVisit(db: ReturnType<typeof freshDb>) {
    const me = asha(db);
    const planned = listVisits(db, me, { status: "planned" }).items.find((v) => v.subject === "Hindi")!;
    transitionVisit(db, me, planned.id, "in_progress");
    addObservation(db, me, planned.id, {
      practice_observed: "Learners read the story aloud in pairs.",
      evidence: "Few questions checked whether learners understood the story.",
      worked_well: "Learners read the story aloud in pairs and stayed engaged.",
      improvement_area: "Few questions were asked about the meaning of the story after reading.",
    });
    return { me, id: planned.id };
  }

  it("official-source cards are retrieved with their approved excerpts and an explicit reason", () => {
    const db = officialOnlyDb();
    const cards = getApprovedCards(db);
    const q = { grade: 2, subject: "Hindi", language: "hi" as const, fields: [{ text: "few questions about the meaning of the story after reading aloud", weight: 3 }], confirmedTagCodes: ["RC-01"], confirmedTagDomains: ["Reading comprehension"] };
    const { candidates } = keywordRetriever(cards, q);
    const top = candidates[0];
    expect(top.card_id).toBe("K-R01");
    expect(top.origin).toBe("official_source");
    expect(top.chunk_ids.length).toBeGreaterThan(0);
    expect(top.reasons[0]).toMatch(/Official-source card/);
    expect(top.reasons[0]).toMatch(/printed p\./);
    void buildRetrievalQuery;
  });

  it("feedback cites the official card together with the verbatim excerpts, and approval keeps them", async () => {
    const db = officialOnlyDb();
    const { me, id } = await startedReadAloudVisit(db);
    const draft = await generateFeedback(db, me, id, { language: "en" });
    expect(draft.status).toBe("draft");
    const cit = draft.citations[0];
    expect(cit.practice_card_id).toBe("K-R01");
    expect(cit.origin).toBe("official_source");
    expect(cit.chunks.length).toBeGreaterThan(0);
    for (const k of cit.chunks) {
      const db_ = get<{ text: string; printed_page: number }>(db, "SELECT text, printed_page FROM kb_chunks WHERE chunk_id = ?", k.chunk_id)!;
      expect(k.excerpt).toBe(db_.text); // the excerpt shown is exactly the stored, approved text
      expect(k.printed_page).toBe(db_.printed_page);
    }
    expect(approveFeedback(db, me, draft.id).status).toBe("approved");
    // snapshot persisted
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM feedback_citation_chunks")!.n).toBeGreaterThan(0);

    // the demonstration is built from the same official card and still validates
    const demo = await generateDemonstration(db, me, id, {});
    expect(demo.practice_card_id).toBe("K-R01");
    expect(demo.example_interaction.length).toBeGreaterThan(9);
    expect(approveDemonstration(db, me, demo.id).status).toBe("approved");
  });

  it("an excerpt rejected after drafting blocks approval", async () => {
    const db = officialOnlyDb();
    const { me, id } = await startedReadAloudVisit(db);
    const draft = await generateFeedback(db, me, id, { language: "en" });
    const used = draft.citations[0].chunks[0].chunk_id;
    reviewChunk(db, ishaan(db), used, { decision: "reject", notes: "Not accurate." });
    expect(codeOf(() => approveFeedback(db, me, draft.id))).toBe("source_not_approved");
  });

  it("an official card can never be cited without an approved excerpt", () => {
    const db = officialOnlyDb();
    const card = getApprovedCards(db).find((c) => c.id === "K-R01")!;
    expect(() => buildCitation({ ...card, chunks: [] }, "reason", 1, true, [])).toThrow(/no approved source excerpt/);
    expect(() => buildCitation({ ...card, chunks: card.chunks!.map((c) => ({ ...c, review_status: "pending_review" as const })) }, "r", 1, true, card.chunks!.map((c) => c.chunk_id))).toThrow();
    const ok = buildCitation(card, "reason", 1, true, [card.chunks![0].chunk_id]);
    expect(ok.chunks).toHaveLength(1);
    // illustrative cards carry no excerpts and are labelled as such
    const ill = buildCitation({ ...card, origin: "illustrative", chunks: undefined }, "r", 1, true, []);
    expect(ill.origin).toBe("illustrative");
    expect(ill.chunks).toHaveLength(0);
  });

  it("mentors can only select an official card as a source when it has approved excerpts", async () => {
    const db = loaded(); // K-R01 is still a draft
    const { me, id } = await startedReadAloudVisit(db);
    const draft = await generateFeedback(db, me, id, {});
    expect(codeOf(() => editFeedback(db, me, draft.id, { citation_card_ids: ["K-R01"] }))).toBe("validation_failed");
    approveCard(db, "K-R01");
    const edited = editFeedback(db, me, draft.id, { citation_card_ids: ["K-R01"] });
    expect(edited.citations[0].origin).toBe("official_source");
    expect(edited.citations[0].chunks.length).toBeGreaterThan(0);
    expect(getCard(db, me, "K-R01").chunks!.every((c) => c.review_status === "approved")).toBe(true);
  });
});
