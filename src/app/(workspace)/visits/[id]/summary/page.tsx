import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getActionSummary } from "@/lib/services/brief";
import { getI18n } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/format";
import { Chip, LinkButton, Notice, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("brief.summary.meta.title") };
}

/** One-page, plain-language, monochrome-safe summary the mentor can hand to the teacher. */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const { t, locale } = await getI18n();
  const r = safe(() => getActionSummary(db(), actor, id));
  if (!r.ok) {
    if (r.error.status === 404) notFound();
    return (
      <div className="space-y-4">
        <PageHeader title={t("brief.summary.meta.title")} />
        <Notice tone="info" title={t("brief.summary.notReady.title")}>{t("brief.summary.notReady.hint")}</Notice>
        <LinkButton href={`/visits/${id}`} variant="secondary">{t("brief.backToVisit")}</LinkButton>
      </div>
    );
  }
  const s = r.value;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/visits/${id}/report`} variant="ghost">{t("brief.summary.backToReport")}</LinkButton>
        <PrintButton label={t("brief.summary.print")} />
      </div>
      <article className="print-page mx-auto max-w-2xl space-y-6 rounded-xl border border-line bg-card p-6 sm:p-10" lang={s.language}>
        <header className="border-b border-line pb-4">
          <p className="text-[13px] font-semibold tracking-wide text-ink-600">{s.school_name} · {fmtDate(s.visit_date, locale)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("brief.summary.title")}</h1>
          <p className="mt-1 text-ink-600">{t("brief.summary.intro")}</p>
        </header>
        {s.strength && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{t("brief.summary.strength")}</h2>
            <p className="mt-1 text-lg">{s.strength}</p>
          </section>
        )}
        <section className="rounded-lg border-2 border-ink-900 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{t("brief.summary.next")}</h2>
          <p className="mt-1 text-xl font-semibold leading-snug">{s.next_step}</p>
        </section>
        {s.how_to_try.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{t("brief.summary.howTo")}</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-base">{s.how_to_try.map((x) => <li key={x}>{x}</li>)}</ol>
          </section>
        )}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{t("brief.summary.lookFor")}</h2>
          <p className="mt-1 text-base">{s.look_for_next_time}</p>
          <p className="mt-2 font-medium">{t("brief.summary.reviewOn", { date: fmtDate(s.review_on, locale) })}</p>
        </section>
        <footer className="space-y-1 border-t border-line pt-4 text-[13px] text-ink-600" lang={locale}>
          {s.source && <p>{t("brief.summary.source")}: {s.source.card_title} ({s.source.source_title})</p>}
          <p>{t("brief.summary.approvedBy", { name: s.approved_by_mentor.name, date: fmtDate(s.approved_by_mentor.at, locale) })}</p>
          {s.simulated_draft && <p><Chip tone="amber">{t("brief.summary.simulated")}</Chip></p>}
          <p>{t("brief.summary.fictional")}</p>
        </footer>
      </article>
    </div>
  );
}
