"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonClass, Card, Chip, EmptyState, Notice } from "@/components/ui";
import { Field, Input } from "@/components/forms";
import { useI18n } from "@/lib/i18n/client";
import { useField, useLive } from "@/lib/offline/field-context";
import { hrefTo } from "@/lib/offline/use-hash-route";
import { fmtDate } from "@/lib/format";
import type { LocalCard } from "@/lib/offline/types";

/** Title and summary in the active language; Hindi only when the card has a Hindi version. */
function view(c: LocalCard, hi: boolean) {
  const h = hi ? c.localized_hi : null;
  return {
    title: h?.title ?? c.title, summary: h?.summary ?? c.description, nextStep: h?.next_step ?? c.next_step,
    steps: h?.steps ?? c.steps, prompts: h?.prompts ?? c.example_prompts, localized: !!h,
  };
}

export function CardsScreen({ cardId }: { cardId?: string }) {
  const { t, tp, locale } = useI18n();
  const { summary } = useField();
  const { data, loading } = useLive((s) => s.listCards());
  const [q, setQ] = useState("");
  const hi = locale === "hi";
  const refreshed = summary?.lastPullAt ? fmtDate(summary.lastPullAt, locale) : t("field.cards.never");

  if (loading && !data) return <p role="status" className="p-4 text-ink-600">{t("common.loading")}</p>;
  const cards = data ?? [];
  const back = (href: string, label: string) => (
    <a href={hrefTo(href)} className="no-print inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-700 underline"><ArrowLeft size={16} aria-hidden /> {label}</a>
  );
  const refreshNote = <p className="text-[13px] text-ink-600">{t("field.cards.copied", { date: refreshed })}</p>;

  if (cardId) {
    const c = cards.find((x) => x.id === cardId);
    if (!c) {
      return (
        <div className="space-y-4">
          {back("/cards", t("field.cards.backToList"))}
          <EmptyState title={t("field.cards.notFoundTitle")} description={t("field.cards.notFoundBody")} />
        </div>
      );
    }
    const v = view(c, hi);
    return (
      <article className="space-y-4" aria-labelledby="card-title">
        {back("/cards", t("field.cards.backToList"))}
        <header className="space-y-2">
          <h1 id="card-title" className="text-xl font-semibold tracking-tight text-ink-900 [overflow-wrap:anywhere]">{v.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{c.domain}</Chip>
            <Chip>{t("field.cards.grades", { min: c.grade_min, max: c.grade_max })}</Chip>
            <Chip tone={c.origin === "official_source" ? "ink" : "amber"}>{t(`brief.card.origin.${c.origin}`)}</Chip>
          </div>
          <p className="text-sm text-ink-700 [overflow-wrap:anywhere]">{v.summary}</p>
        </header>
        {hi && (
          <Notice tone="info">{t(v.localized ? "field.cards.hiDraft" : "field.cards.hiMissing")}</Notice>
        )}
        <Card>
          <div className="space-y-5 px-4 py-4 text-sm">
            <section aria-labelledby="card-steps">
              <h2 id="card-steps" className="mb-1 text-[15px] font-semibold text-ink-900">{t("field.cards.steps")}</h2>
              <ol className="list-decimal space-y-1 pl-5">{v.steps.map((s, i) => <li key={i} className="[overflow-wrap:anywhere]">{s}</li>)}</ol>
            </section>
            {v.prompts.length > 0 && (
              <section aria-labelledby="card-prompts">
                <h2 id="card-prompts" className="mb-1 text-[15px] font-semibold text-ink-900">{t("field.cards.prompts")}</h2>
                <ul className="list-disc space-y-1 pl-5">{v.prompts.map((s, i) => <li key={i} className="[overflow-wrap:anywhere]">{s}</li>)}</ul>
              </section>
            )}
            <section aria-labelledby="card-next">
              <h2 id="card-next" className="mb-1 text-[15px] font-semibold text-ink-900">{t("field.cards.nextStep")}</h2>
              <p className="[overflow-wrap:anywhere]">{v.nextStep}</p>
            </section>
            <section aria-labelledby="card-source">
              <h2 id="card-source" className="mb-1 text-[15px] font-semibold text-ink-900">{t("field.cards.source")}</h2>
              <p className="[overflow-wrap:anywhere]">{c.source_title}</p>
              <p className="text-ink-700 [overflow-wrap:anywhere]">{c.source_org}</p>
              <p className="mt-1 text-ink-700">{t(c.origin === "official_source" ? "field.cards.originOfficial" : "field.cards.originDemo")}</p>
            </section>
          </div>
        </Card>
        {refreshNote}
      </article>
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? cards.filter((c) => [c.title, c.domain, c.description, c.localized_hi?.title, c.localized_hi?.summary].some((x) => x?.toLowerCase().includes(needle)))
    : cards;

  return (
    <div className="space-y-4">
      {back("/", t("field.back"))}
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">{t("field.cards.title")}</h1>
      <p className="text-sm text-ink-700">{t("field.cards.desc")}</p>
      {cards.length === 0 ? (
        <EmptyState title={t("field.cards.emptyTitle")} description={t("field.cards.emptyBody")} />
      ) : (
        <>
          <Field label={t("field.cards.searchLabel")} htmlFor="cards-search">
            <Input id="cards-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11" data-testid="cards-search" autoComplete="off" />
          </Field>
          <p role="status" className="text-[13px] text-ink-600">{tp("field.cards.count", shown.length)}</p>
          {shown.length === 0 && <p className="text-sm text-ink-700">{t("field.cards.noMatch")}</p>}
          <ul className="space-y-2">
            {shown.map((c) => {
              const v = view(c, hi);
              return (
                <li key={c.id}>
                  <a href={hrefTo(`/cards/${c.id}`)} className={buttonClass("secondary", "lg", "!h-auto w-full flex-col items-start gap-1 !whitespace-normal py-3 text-left")}>
                    <span className="font-semibold [overflow-wrap:anywhere]">{v.title}</span>
                    <span className="text-[13px] font-normal text-ink-700">{c.domain} · {t("field.cards.grades", { min: c.grade_min, max: c.grade_max })}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {refreshNote}
    </div>
  );
}
