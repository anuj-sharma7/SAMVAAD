/**
 * npm run data:download
 * Attempts every source in sources.ts, validates the response, saves valid files to data/raw/ and writes the
 * true outcome of each attempt to data/metadata/download_log.json. Idempotent: an existing valid raw file is
 * re-hashed, not re-downloaded, unless --force is given. Raw files are never modified.
 */
import fs from "node:fs";
import path from "node:path";
import { SOURCES, type AccessStatus, type SourceDef } from "./sources";
import { RAW, META, sha256, writeJson, readJson, nowIso, sigOk } from "./lib";
import { safeFetch, allowedHosts, UnsafeFetchError } from "./safe-fetch";

// Only hosts that appear in the source registry may be contacted (also re-checked on every redirect hop).
const ALLOW = allowedHosts(SOURCES.flatMap((x) => [x.source_url, x.download_url].filter((u): u is string => !!u)));

export interface DownloadOutcome {
  source_id: string;
  attempted_at_utc: string;
  http_status: number | null;
  content_type: string | null;
  bytes: number | null;
  access_status: AccessStatus;
  detail: string;
  file_path: string | null; // relative to project root
  sha256: string | null;
  signature_ok: boolean | null;
  retrieved_at_utc: string | null;
}

const UA = "SAMVAAD-data-research/1.0 (education prototype; honest user agent; no CAPTCHA/login bypass)";
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const ext = (e: SourceDef["expect"]) => (e === "pdf" ? "pdf" : e === "csv" ? "csv" : "html");

async function attempt(s: SourceDef): Promise<DownloadOutcome> {
  const url = s.download_url ?? s.source_url;
  const base: DownloadOutcome = {
    source_id: s.source_id, attempted_at_utc: nowIso(), http_status: null, content_type: null, bytes: null,
    access_status: "unavailable", detail: "", file_path: null, sha256: null, signature_ok: null, retrieved_at_utc: null,
  };
  const rel = path.join("data", "raw", `${s.source_id}.${ext(s.expect)}`);
  const abs = path.resolve(RAW, "..", "..", rel);

  if (!force && s.keep_raw && fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    if (sigOk(s.expect, buf)) {
      return {
        ...base, http_status: 200, bytes: buf.length, access_status: "downloaded_and_validated", file_path: rel.replace(/\\/g, "/"),
        sha256: sha256(buf), signature_ok: true, retrieved_at_utc: fs.statSync(abs).mtime.toISOString(),
        detail: "Existing raw file re-verified (signature + checksum); not re-downloaded.",
      };
    }
  }

  let res: Response;
  let buf: Buffer;
  try {
    ({ res, body: buf } = await safeFetch(url, { allow: ALLOW, headers: { "user-agent": UA, accept: "*/*" }, timeoutMs: s.timeout_ms ?? 60_000 }));
  } catch (err) {
    if (err instanceof UnsafeFetchError) {
      return { ...base, access_status: s.constraint?.status ?? "unavailable", detail: `Refused by download guard (${err.reason}): ${err.message}` };
    }
    const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
    return { ...base, access_status: s.constraint?.status ?? "unavailable", detail: `Network error (${code}). ${s.constraint?.reason ?? ""}`.trim() };
  }
  const out: DownloadOutcome = { ...base, http_status: res.status, content_type: res.headers.get("content-type"), bytes: buf.length };

  if (!res.ok) {
    return { ...out, access_status: s.constraint?.status ?? (res.status === 403 || res.status === 401 ? "manual_download_needed" : "unavailable"), detail: `HTTP ${res.status}. ${s.constraint?.reason ?? ""}`.trim() };
  }
  const ok = sigOk(s.expect, buf);
  out.signature_ok = ok;
  const bodyText = s.expect === "html" ? buf.toString("utf8") : "";
  if (!ok || buf.length === 0) {
    return { ...out, access_status: s.constraint?.status ?? "unavailable", detail: `HTTP 200 but the body is not a valid ${s.expect.toUpperCase()} (wrong signature or empty). Not treated as a dataset.` };
  }

  // HTML pages are evidence of a public page, never a dataset.
  if (s.expect === "html") {
    const hasCaptcha = /captcha/i.test(bodyText);
    return {
      ...out, sha256: sha256(buf), retrieved_at_utc: nowIso(),
      access_status: s.constraint?.status ?? (hasCaptcha ? "captcha_or_interaction_blocked" : "public_page_only"),
      detail: `${s.constraint?.reason ?? "Public page reachable; no downloadable file used."} (page ${buf.length} bytes${hasCaptcha ? ", CAPTCHA present" : ""})`,
    };
  }

  // A signature-valid file that we expected to be blocked: record success honestly.
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (s.keep_raw) fs.writeFileSync(abs, buf, { flag: "wx" });
  return {
    ...out, access_status: "downloaded_and_validated", file_path: s.keep_raw ? rel.replace(/\\/g, "/") : null,
    sha256: sha256(buf), retrieved_at_utc: nowIso(), detail: "Downloaded; HTTP 200, expected signature present.",
  };
}

async function main() {
  const prev = readJson<DownloadOutcome[]>(path.join(META, "download_log.json"), []);
  const byId = new Map(prev.map((o) => [o.source_id, o]));
  for (const s of SOURCES.filter((x) => !only || x.source_id === only)) {
    // "wx" would throw if a stale file exists with a bad signature; remove only invalid leftovers.
    const stale = path.join(RAW, `${s.source_id}.${ext(s.expect)}`);
    if (fs.existsSync(stale) && !sigOk(s.expect, fs.readFileSync(stale))) fs.rmSync(stale);
    if (force && fs.existsSync(stale)) fs.rmSync(stale);
    const o = await attempt(s);
    byId.set(s.source_id, o);
    console.log(`${o.access_status.padEnd(34)} ${s.source_id}  ${o.http_status ?? "-"}  ${o.detail.slice(0, 90)}`);
  }
  writeJson(path.join(META, "download_log.json"), SOURCES.map((s) => byId.get(s.source_id)).filter(Boolean));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
