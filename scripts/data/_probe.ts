/** Dev probe (one guarded GET per URL, 60 s timeout). Usage: tsx scripts/data/_probe.ts <url> [--grep=regex] */
import { SOURCES } from "./sources";
import { safeFetch, allowedHosts } from "./safe-fetch";
import { sha256 } from "./lib";

const ALLOW = allowedHosts(SOURCES.flatMap((x) => [x.source_url, x.download_url].filter((u): u is string => !!u)));
const url = process.argv[2];
const grep = process.argv.find((a) => a.startsWith("--grep="))?.slice(7);

async function main() {
  try {
    const { res, body, finalUrl } = await safeFetch(url, {
      allow: ALLOW, timeoutMs: 60_000,
      headers: { "user-agent": "SAMVAAD-data-research/1.0 (education prototype; honest user agent; no CAPTCHA/login bypass)", accept: "*/*" },
    });
    console.log(JSON.stringify({ url, finalUrl, status: res.status, type: res.headers.get("content-type"), bytes: body.length, sha256: sha256(body), head: body.subarray(0, 8).toString("latin1") }));
    if (grep) {
      const t = body.toString("utf8");
      const re = new RegExp(grep, "gi");
      const seen = new Set<string>();
      for (const m of t.matchAll(re)) seen.add(t.slice(Math.max(0, m.index! - 80), m.index! + 160).replace(/\s+/g, " "));
      console.log([...seen].slice(0, 30).join("\n---\n"));
    } else if ((res.headers.get("content-type") ?? "").includes("html")) {
      console.log(body.toString("utf8").slice(0, 1500));
    }
  } catch (e) {
    console.log(JSON.stringify({ url, error: String((e as Error).message), cause: String((e as { cause?: { code?: string } }).cause?.code ?? "") }));
  }
}
main();
