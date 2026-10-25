import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const DATA = path.join(ROOT, "data");
export const RAW = path.join(DATA, "raw");
export const PROCESSED = path.join(DATA, "processed");
export const REPORTS = path.join(DATA, "reports");
export const META = path.join(DATA, "metadata");

for (const d of [RAW, PROCESSED, REPORTS, META]) fs.mkdirSync(d, { recursive: true });

export const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
export function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/** RFC 4180 CSV cell. Neutralises spreadsheet formula injection for any text that starts with = + - @. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(file: string, columns: string[], rows: Record<string, unknown>[]) {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

export { parseCsv } from "../../src/lib/data-sources/csv";

export interface PdfPageText {
  page: number;
  /** Text items with their positions, used to rebuild table rows. */
  items: { str: string; x: number; y: number }[];
}

/** Extract text items with coordinates from a PDF using pdfjs-dist (pure JS; no external tools needed). */
export async function pdfPages(file: string, pages?: number[]): Promise<PdfPageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const out: PdfPageText[] = [];
  const list = pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1);
  for (const p of list) {
    if (p < 1 || p > doc.numPages) continue;
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i && i.str.trim() !== "")
      .map((i) => ({ str: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));
    out.push({ page: p, items });
  }
  await (doc as unknown as { cleanup?: () => Promise<void> }).cleanup?.();
  return out;
}

/** Group text items into visual lines (same y within `tol`), left-to-right. */
export function toLines(items: PdfPageText["items"], tol = 3): { y: number; cells: { str: string; x: number }[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; cells: { str: string; x: number }[] }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.cells.push({ str: it.str, x: it.x });
    else lines.push({ y: it.y, cells: [{ str: it.str, x: it.x }] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  return lines;
}

export const nowIso = () => new Date().toISOString();

/**
 * A downloaded body only counts as a dataset if it really is the expected kind of file. HTML error pages, login or CAPTCHA
 * pages and empty responses are rejected, whatever the HTTP status or file extension said.
 */
export function sigOk(expect: "pdf" | "csv" | "html", buf: Buffer): boolean {
  if (buf.length === 0) return false;
  if (expect === "pdf") return buf.slice(0, 5).toString("latin1") === "%PDF-";
  const head = buf.slice(0, 400).toString("utf8").toLowerCase();
  if (expect === "csv") return !head.includes("<html") && !head.includes("<!doctype") && head.includes(",");
  return head.includes("<html") || head.includes("<!doctype");
}
