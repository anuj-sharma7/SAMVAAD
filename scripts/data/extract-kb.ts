/**
 * npm run kb:extract
 * Extracts the curated excerpts named in data/knowledge/chunk_manifest.json from the downloaded source PDF.
 * The text is copied verbatim from the PDF (never retyped). If a start/end anchor cannot be found on its page,
 * or the excerpt is too long, the run fails instead of guessing.
 * Output: data/knowledge/kb_chunks.json (deterministic; includes a checksum of the source file and of each excerpt).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA, RAW, pdfPages, toLines, writeJson, sha256, nowIso } from "./lib";

interface ManifestChunk { id: string; pdf_page: number; start: string; end: string }
interface Manifest { source_id: string; chunks: ManifestChunk[] }

const MAX_CHARS = 900; // short excerpts only: this is a pointer to the source, not a copy of it
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA, "knowledge", "chunk_manifest.json"), "utf8")) as Manifest;
  const file = path.join(RAW, `${manifest.source_id}.pdf`);
  if (!fs.existsSync(file)) throw new Error(`${file} is missing. Run npm run data:download first.`);
  const pdfSha = sha256(fs.readFileSync(file));
  const pages = [...new Set(manifest.chunks.map((c) => c.pdf_page))];
  const text = new Map<number, { body: string; printed: number | null }>();
  for (const p of await pdfPages(file, pages)) {
    const lines = toLines(p.items).map((l) => l.cells.map((c) => c.str).join(" "));
    // The printed page number is in the footer: "74 NIPUN BHARAT: ..." or "Guidelines for Implementation 77".
    const footer = lines.slice(-3).join(" ");
    const m = footer.match(/^\s*(\d+)\s+NIPUN BHARAT/m) ?? footer.match(/(\d+)\s+NIPUN BHARAT/) ?? footer.match(/Guidelines for Implementation\s+(\d+)/);
    text.set(p.page, { body: norm(lines.join(" ")), printed: m ? Number(m[1]) : null });
  }

  const out = [];
  const problems: string[] = [];
  for (const c of manifest.chunks) {
    const page = text.get(c.pdf_page)!;
    const s = page.body.indexOf(norm(c.start));
    if (s < 0) { problems.push(`${c.id}: start anchor not found on PDF page ${c.pdf_page}`); continue; }
    const e = page.body.indexOf(norm(c.end), s);
    if (e < 0) { problems.push(`${c.id}: end anchor not found after the start anchor`); continue; }
    const excerpt = page.body.slice(s, e + norm(c.end).length);
    if (excerpt.length > MAX_CHARS) { problems.push(`${c.id}: excerpt is ${excerpt.length} chars (> ${MAX_CHARS}); narrow the anchors`); continue; }
    out.push({
      chunk_id: c.id, kb_source_id: manifest.source_id, pdf_page: c.pdf_page, printed_page: page.printed, text: excerpt,
      text_sha256: crypto.createHash("sha256").update(excerpt).digest("hex"), language: "en", review_status: "pending_review",
    });
  }
  if (problems.length) {
    problems.forEach((p) => console.error("FAIL", p));
    process.exit(1);
  }
  writeJson(path.join(DATA, "knowledge", "kb_chunks.json"), { source_id: manifest.source_id, source_sha256: pdfSha, extracted_at_utc: nowIso(), chunks: out });
  console.log(`Extracted ${out.length} excerpts from ${manifest.source_id} (source sha256 ${pdfSha.slice(0, 12)}…).`);
  for (const c of out) console.log(`  ${c.chunk_id.padEnd(30)} pdf p.${String(c.pdf_page).padEnd(3)} printed p.${String(c.printed_page ?? "?").padEnd(3)} ${c.text.length} chars`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
