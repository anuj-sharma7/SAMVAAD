// Developer helper: list pages whose text matches a regex. Usage: tsx scripts/data/_find.ts <file> <regex>
import { pdfPages } from "./lib";
async function main() {
  const [file, re] = process.argv.slice(2);
  const rx = new RegExp(re, "i");
  for (const p of await pdfPages(file)) {
    const text = p.items.map((i) => i.str).join(" ");
    const m = text.match(rx);
    if (m) console.log(`page ${p.page}: ${text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 160).replace(/\s+/g, " ")}`);
  }
}
main();
