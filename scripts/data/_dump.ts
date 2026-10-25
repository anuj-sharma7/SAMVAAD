// Developer helper: dump positioned text of PDF pages. Usage: tsx scripts/data/_dump.ts <file> [pages]
import { pdfPages, toLines } from "./lib";
async function main() {
  const [file, pagesArg] = process.argv.slice(2);
  const pages = pagesArg ? pagesArg.split(",").map(Number) : undefined;
  for (const p of await pdfPages(file, pages)) {
    console.log("=== page", p.page);
    for (const l of toLines(p.items)) console.log(l.cells.map((c) => `${c.str}@${c.x}`).join(" | "));
  }
}
main();
