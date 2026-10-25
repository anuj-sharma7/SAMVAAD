// Developer helper: print reading-order plain text of PDF pages. Usage: tsx scripts/data/_text.ts <file> <pages>
import { pdfPages, toLines } from "./lib";
async function main() {
  const [file, pagesArg] = process.argv.slice(2);
  for (const p of await pdfPages(file, pagesArg.split(",").map(Number))) {
    console.log(`=== PDF page ${p.page}`);
    console.log(toLines(p.items).map((l) => l.cells.map((c) => c.str).join(" ")).join("\n"));
  }
}
main();
