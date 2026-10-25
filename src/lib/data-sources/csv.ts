/** Minimal RFC 4180 CSV parser: quoted cells, escaped quotes, CRLF, embedded newlines. Never evaluates content. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** Parse CSV text into objects keyed by the header row. Throws on ragged rows. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((r, i) => {
    if (r.length !== header.length) throw new Error(`CSV row ${i + 2} has ${r.length} cells, expected ${header.length}`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}
