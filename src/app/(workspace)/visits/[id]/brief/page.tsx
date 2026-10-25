import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenCheck, ClipboardCheck } from "lucide-react";
import { db, requireActor, safe } from "@/lib/server/context";
import { getPreVisitBrief } from "@/lib/services/brief";
import { getI18n } from "@/lib/i18n/server";
import { commitmentStatusKey, fmtDate, fmtDateTime } from "@/lib/format";
import { Card, CardHeader, Chip, DefinitionRow, LinkButton, Notice, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("brief.meta.title") };
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const { t, locale } = await getI18n();
  const r = safe(() => getPreVisitBrief(db(), actor, id));
  if (!r.ok) {
    if (r.error.status === 404) notFound();
    return <Notice tone="error" title={t("brief.error.title")}>{r.error.message}</Notice>;
  }
  const b = r.value;
  const v = b.visit;
  return (
    <article className="space-y-5">
      <PageHeader
        crumbs={[{ href: "/visits", label: t("nav.visits") }, { href: `/visits/${id}`, label: v.school_name }, { label: t("brief.meta.title") }]}
        title={t("brief.title")}
        description={t("brief.intro")}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton label={t("brief.print")} />
            <LinkButton href={`/visits/${id}/observe`}><ClipboardCheck size={16} aria-hidden /> {t("brief.startObserving")}</LinkButton>
          </div>
        }
      />

      <Card>
        <CardHeader title={t("brief.visit.heading")} />
        <dl className="divide-y divide-line px-5">
          <DefinitionRow label={t("brief.visit.school")}>{v.school_name}</DefinitionRow>
          <DefinitionRow label={t("brief.visit.date")}>{fmtDateTime(v.scheduled_at, locale)}</DefinitionRow>
          <DefinitionRow label={t("brief.visit.class")}>{t("brief.visit.classValue", { grade: v.grade, subject: v.subject })}</DefinitionRow>
          <DefinitionRow label={t("brief.visit.teacher")}>{v.teacher_alias}</DefinitionRow>
          <DefinitionRow label={t("brief.visit.purpose")}>{v.purpose}</DefinitionRow>
          {v.coaching_focus && <DefinitionRow label={t("brief.visit.focus")}>{v.coaching_focus}</DefinitionRow>}
          {v.prep_notes && <DefinitionRow label={t("brief.visit.prep")}>{v.prep_notes}</DefinitionRow>}
        </dl>
      </Card>

      <Card>
        <CardHeader title={t("brief.prev.heading")} />
        <div className="space-y-2 p-5 text-sm">
          {b.previous ? (
            <>
              <p className="text-ink-600">{t("brief.prev.agreedOn", { date: fmtDate(b.previous.origin_visit_date, locale) })}</p>
              <p className="text-base font-medium text-ink-900">{b.previous.action_text}</p>
              <p className="flex flex-wrap items-center gap-2">
                <Chip tone={b.previous.display_status === "overdue" ? "amber" : "neutral"}>{t(commitmentStatusKey(b.previous.display_status))}</Chip>
                <span>{t("brief.prev.checkBy", { date: fmtDate(b.previous.target_date, locale) })}</span>
              </p>
              <p><span className="font-medium">{t("brief.prev.lookFor")}:</span> {b.previous.expected_evidence}</p>
            </>
          ) : (
            <p className="text-ink-600">{t("brief.prev.none")}</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("brief.card.heading")} />
        <div className="space-y-4 p-5 text-sm">
          {b.card ? (
            <>
              <div>
                <p className="text-base font-medium text-ink-900" lang={b.card.language_of_text}>{b.card.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-600">
                  <Chip tone={b.card.origin === "official_source" ? "teal" : "neutral"}>{t(`brief.card.origin.${b.card.origin}`)}</Chip>
                  <span>{t("brief.card.source")}: {b.card.source_title}</span>
                </p>
              </div>
              {b.card.reasons.length > 0 && (
                <div>
                  <h3 className="font-semibold">{t("brief.card.why")}</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{b.card.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              <div lang={b.card.language_of_text}>
                <h3 className="font-semibold">{t("brief.card.lookFor")}</h3>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">{b.card.look_for.map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
              {b.card.try_prompts.length > 0 && (
                <div lang={b.card.language_of_text}>
                  <h3 className="font-semibold">{t("brief.card.prompts")}</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{b.card.try_prompts.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              <Link className="no-print inline-flex items-center gap-1.5 font-medium text-teal-700 underline" href={`/practice-library/${b.card.id}`}>
                <BookOpenCheck size={15} aria-hidden /> {t("brief.card.openCard")}
              </Link>
            </>
          ) : (
            <Notice tone="info" title={t("brief.card.none.title")}>{t("brief.card.none.body")}</Notice>
          )}
        </div>
      </Card>
    </article>
  );
}
