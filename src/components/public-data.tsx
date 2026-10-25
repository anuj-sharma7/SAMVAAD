import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Database, ExternalLink, Globe2 } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { fmtDate, fmtNumber } from "@/lib/format";
import { geoLabel } from "@/lib/public-status";
import { cn } from "./ui";

/** Fills `{name}` markers in a translated sentence with React nodes (links, bold text), keeping word order translatable. */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((seg, i) => {
    const m = /^\{(\w+)\}$/.exec(seg);
    return <Fragment key={i}>{m && m[1] in parts ? parts[m[1]] : seg}</Fragment>;
  });
}

/**
 * Real public data uses an outlined ink style with a globe icon. Fictional demo records use the amber "Demo" tag and
 * simulated AI output uses the amber "Simulated" badge. The two treatments are intentionally never the same.
 */
export async function PublicDataBadge({ className, label }: { className?: string; label?: string }) {
  const { t } = await getI18n();
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border-[1.5px] border-ink-800 bg-card px-2 py-0.5 text-xs font-semibold text-ink-900", className)}>
      <Globe2 size={12} aria-hidden /> {label ?? t("publicdata.badge.real")}
    </span>
  );
}

export async function NotObservationsNotice() {
  const { t } = await getI18n();
  return (
    <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-800">
      <Database size={14} aria-hidden /> {t("publicdata.notObservations")}
    </p>
  );
}

export interface Cite {
  source_id: string;
  source_name?: string;
  reference_period: string;
  geography_level: string;
  locator?: string;
  retrieved?: string | null;
}

/** Source line shown beside every indicator, chart and table. */
export async function SourceCitation({ cite, className }: { cite: Cite; className?: string }) {
  const { t, locale } = await getI18n();
  return (
    <p className={cn("text-[12px] leading-relaxed text-ink-600", className)}>
      {t("publicdata.cite.source")}{" "}
      <Link href={`/public-data/sources/${cite.source_id}`} className="font-medium text-ink-800 underline">
        {cite.source_name ?? cite.source_id}
      </Link>{" "}
      · {cite.reference_period} · {t("publicdata.cite.level", { level: geoLabel(t, cite.geography_level) })}
      {cite.locator ? ` · ${cite.locator}` : ""}
      {cite.retrieved ? ` · ${t("publicdata.cite.retrieved", { date: fmtDate(cite.retrieved, locale) })}` : ""}
    </p>
  );
}

export interface BarRow {
  label: string;
  value: number | null;
  ci?: number | null;
  highlight?: boolean;
  note?: string;
  /** Set when rows come from different files, so each row can be attributed to its own source. */
  sourceId?: string;
  sourceName?: string;
}

/**
 * Accessible horizontal bar chart. The graphic is hidden from assistive tech (aria-hidden) and replaced by a real data table
 * in a <details> so every value, confidence interval and "not published" cell is available as text.
 */
export async function BarList({
  title, unit, geography, rows, max, source, caption,
}: { title: string; unit: string; geography: string; rows: BarRow[]; max?: number; source: Cite; caption?: string }) {
  const { t, locale } = await getI18n();
  const nf = (n: number) => fmtNumber(n, locale, { maximumFractionDigits: 1 });
  const present = rows.filter((r) => r.value !== null) as (BarRow & { value: number })[];
  const top = max ?? Math.max(1, ...present.map((r) => r.value + (r.ci ?? 0)));
  const hasCi = rows.some((r) => r.ci);
  const multi = new Map(rows.filter((r) => r.sourceId).map((r) => [r.sourceId!, r.sourceName ?? r.sourceId!]));
  return (
    <figure className="space-y-3" aria-label={t("publicdata.chart.aria", { title, geography, unit })}>
      <figcaption>
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-[12px] text-ink-600">{t("publicdata.chart.unitLine", { unit, geography })}{caption ? ` · ${caption}` : ""}</p>
      </figcaption>
      <ul className="space-y-1.5" aria-hidden>
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(7rem,12rem)_1fr_4.5rem] items-center gap-3 text-[13px]">
            <span className={cn("truncate", r.highlight ? "font-semibold text-ink-900" : "text-ink-700")}>{r.label}</span>
            <span className="relative h-3 rounded bg-ink-100">
              {r.value !== null && (
                <>
                  <span className={cn("absolute inset-y-0 left-0 rounded", r.highlight ? "bg-ink-900" : "bg-ink-600/70")} style={{ width: `${Math.max(0.5, (r.value / top) * 100)}%` }} />
                  {r.ci ? (
                    <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-amber-600" style={{ left: `${Math.max(0, ((r.value - r.ci) / top) * 100)}%`, width: `${((r.ci * 2) / top) * 100}%` }} />
                  ) : null}
                </>
              )}
            </span>
            <span className="text-right tabular-nums text-ink-800">{r.value === null ? t("publicdata.chart.notPublishedShort") : nf(r.value)}</span>
          </li>
        ))}
      </ul>
      {hasCi && <p className="text-[12px] text-ink-600">{t("publicdata.chart.ciNote")}</p>}
      <details className="text-[13px]">
        <summary className="cursor-pointer font-medium text-ink-800">{t("publicdata.chart.viewAsTable")}</summary>
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{t("publicdata.chart.caption", { title, unit, geography })}</caption>
            <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600">
              <tr><th scope="col" className="px-3 py-2 font-medium">{t("publicdata.chart.colArea")}</th><th scope="col" className="px-3 py-2 font-medium">{t("publicdata.chart.colValue", { unit })}</th>{hasCi && <th scope="col" className="px-3 py-2 font-medium">{t("publicdata.chart.colCi")}</th>}<th scope="col" className="px-3 py-2 font-medium">{t("publicdata.chart.colNote")}</th>{multi.size > 1 && <th scope="col" className="px-3 py-2 font-medium">{t("publicdata.chart.colSourceFile")}</th>}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-3 py-1.5 font-normal">{r.label}</th>
                  <td className="px-3 py-1.5 tabular-nums">{r.value === null ? t("publicdata.chart.notPublished") : nf(r.value)}</td>
                  {hasCi && <td className="px-3 py-1.5 tabular-nums">{r.ci ? `±${nf(r.ci)}` : "—"}</td>}
                  <td className="px-3 py-1.5 text-ink-600">{r.note ?? ""}</td>
                  {multi.size > 1 && <td className="px-3 py-1.5 text-[12px]">{r.sourceId ? <Link className="underline" href={`/public-data/sources/${r.sourceId}`}>{r.sourceName ?? r.sourceId}</Link> : ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {multi.size > 1 ? (
        <p className="text-[12px] leading-relaxed text-ink-600">
          {rich(t("publicdata.chart.multiSources", { n: multi.size, period: source.reference_period, level: geoLabel(t, source.geography_level) }), {
            link: <Link href="/public-data/sources" className="font-medium text-ink-800 underline">{t("publicdata.sourceCatalogue")}</Link>,
          })}
        </p>
      ) : (
        <SourceCitation cite={source} />
      )}
    </figure>
  );
}

export function ExternalLinkText({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
      {children} <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/** Segmented switch between the operational workflow and the public education context. */
export async function ViewToggle({ active }: { active: "operational" | "public" }) {
  const { t } = await getI18n();
  const item = (key: "operational" | "public", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium", active === key ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label={t("publicdata.toggle.aria")} className="inline-flex gap-1 rounded-lg border border-line-strong bg-card p-1">
      {item("operational", "/dashboard", t("publicdata.toggle.operational"))}
      {item("public", "/public-data", t("publicdata.toggle.public"))}
    </nav>
  );
}
