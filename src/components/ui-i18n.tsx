"use client";

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { commitmentStatusKey, feedbackStatusKey, fmtNumber, visitStatusKey } from "@/lib/format";
import { Chip, LinkButton, cn, type Tone } from "./ui-base";

// Small presentational pieces that carry text. They are client components so that both server and client
// pages can render them and still get the active interface language.

const VISIT_TONE: Record<string, Tone> = { draft: "neutral", planned: "ink", in_progress: "amber", pending_review: "amber", completed: "teal" };
export function VisitStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={VISIT_TONE[status] ?? "neutral"}>{VISIT_TONE[status] ? t(visitStatusKey(status)) : status}</Chip>;
}

const COMMIT_TONE: Record<string, Tone> = { open: "neutral", due_soon: "amber", overdue: "red", completed: "teal", reviewed: "teal", cancelled: "neutral" };
export function CommitmentChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={COMMIT_TONE[status] ?? "neutral"}>{COMMIT_TONE[status] ? t(commitmentStatusKey(status)) : status}</Chip>;
}

const FB_TONE: Record<string, Tone> = { draft: "amber", edited: "amber", approved: "teal", rejected: "red", superseded: "neutral", insufficient_evidence: "red" };
export function FeedbackChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={FB_TONE[status] ?? "neutral"}>{FB_TONE[status] ? t(feedbackStatusKey(status)) : status}</Chip>;
}

/** Shown on every piece of content produced by the deterministic demo provider. */
export function SimulatedBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Chip tone="amber" className={className} title={t("common.ui.simulatedTitle")}>
      <Sparkles size={12} aria-hidden /> {t("common.ui.simulatedBadge")}
    </Chip>
  );
}

export function AiDraftBadge({ model }: { model?: string | null }) {
  const { t } = useI18n();
  return <Chip tone="neutral"><Sparkles size={12} aria-hidden /> {t("common.ui.aiDraft")}{model ? ` · ${model}` : ""} · {t("common.ui.mentorReview")}</Chip>;
}

export function DemoTag({ className }: { className?: string }) {
  const { t } = useI18n();
  return <Chip tone="amber" className={className}>{t("common.ui.demoTag")}</Chip>;
}

/** Where a practice card's content comes from. Official = excerpts from a published document; illustrative = demo text with no external source. */
export function OriginBadge({ origin }: { origin: "illustrative" | "official_source" }) {
  const { t } = useI18n();
  return origin === "official_source" ? (
    <Chip tone="ink" title={t("common.ui.originOfficialTitle")}>{t("common.ui.originOfficial")}</Chip>
  ) : (
    <Chip tone="amber" title={t("common.ui.originIllustrativeTitle")}>{t("common.ui.originIllustrative")}</Chip>
  );
}

export function BreadcrumbNav({ crumbs }: { crumbs: { href?: string; label: string }[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("common.ui.breadcrumb")} className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-ink-600">
      {crumbs.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {c.href ? <Link href={c.href} className="hover:text-ink-900 hover:underline">{c.label}</Link> : <span aria-current="page" className="text-ink-900">{c.label}</span>}
          {i < crumbs.length - 1 && <ChevronRight size={13} aria-hidden className="text-ink-500" />}
        </span>
      ))}
    </nav>
  );
}

const STAGE_KEYS = [
  { key: "plan", i18n: "common.step.plan" },
  { key: "observe", i18n: "common.step.observe" },
  { key: "coach", i18n: "common.step.coach" },
  { key: "demonstrate", i18n: "common.step.demonstrate" },
  { key: "follow_up", i18n: "common.step.followup" },
] as const;

export function WorkflowStepper({ done, current, hrefs }: { done: Record<string, boolean>; current: string; hrefs?: Partial<Record<string, string>> }) {
  const { t } = useI18n();
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label={t("common.ui.workflowProgress")}>
      {STAGE_KEYS.map((s, i) => {
        const label = t(s.i18n);
        const isDone = done[s.key];
        const isCurrent = !isDone && current === s.key;
        const body = (
          <>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                isDone ? "border-teal-700 bg-teal-700 text-white" : isCurrent ? "border-ink-900 bg-ink-900 text-white" : "border-line-strong bg-card text-ink-500",
              )}
              aria-hidden
            >
              {isDone ? "✓" : i + 1}
            </span>
            <span className={cn("hidden truncate text-[13px] sm:inline", isCurrent || isDone ? "font-semibold text-ink-900" : "text-ink-600")}>{label}</span>
          </>
        );
        const cls = cn("flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 sm:flex-row sm:gap-2 sm:px-3", isCurrent ? "border-ink-900 bg-card" : "border-line bg-card/60", hrefs?.[s.key] && "hover:bg-card");
        return (
          <li key={s.key} aria-current={isCurrent ? "step" : undefined}>
            <span className="sr-only">{label}: {isDone ? t("common.ui.stepComplete") : isCurrent ? t("common.ui.stepCurrent") : t("common.ui.stepNotStarted")}</span>
            {hrefs?.[s.key] ? <Link href={hrefs[s.key]!} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function PaginationView({ page, pages, total, prevHref, nextHref }: { page: number; pages: number; total: number; prevHref?: string; nextHref?: string }) {
  const { t, tp, locale } = useI18n();
  return (
    <nav aria-label={t("common.ui.pagination")} className="mt-4 flex items-center justify-between text-sm text-ink-600">
      <span>{t("common.page", { page: fmtNumber(page, locale), pages: fmtNumber(pages, locale) })} · {tp("common.ui.results", total, { n: fmtNumber(total, locale) })}</span>
      <div className="flex gap-2">
        {prevHref && <LinkButton variant="secondary" size="sm" href={prevHref}>{t("common.previous")}</LinkButton>}
        {nextHref && <LinkButton variant="secondary" size="sm" href={nextHref}>{t("common.next")}</LinkButton>}
      </div>
    </nav>
  );
}
