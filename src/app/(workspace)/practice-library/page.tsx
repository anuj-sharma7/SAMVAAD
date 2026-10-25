import Link from "next/link";
import { Library, Plus, Search } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { cardDomains, listCards } from "@/lib/services/practice-cards";
import { can } from "@/lib/auth/policy";
import { getI18n } from "@/lib/i18n/server";
import { Button, Card, Chip, EmptyState, LinkButton, Notice, OriginBadge, PageHeader } from "@/components/ui";
import { Input, Select } from "@/components/forms";
import { rich } from "@/components/public-data";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("library.meta.title") };
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const curator = can(actor, "card:read_all");
  const cards = listCards(db(), actor, { q: sp.q, subject: sp.subject, grade: sp.grade || undefined, domain: sp.domain, status: curator ? (sp.status as "draft" | "approved" | "rejected" | undefined) || undefined : undefined });
  const domains = cardDomains(db());
  const subjectLabel = (s: string) => (["Hindi", "English", "Mathematics", "EVS", "Any"].includes(s) ? t(`library.subject.${s}`) : s);
  const approval = (s: string) => (["approved", "draft", "rejected"].includes(s) ? t(`library.approval.${s}`) : s);

  return (
    <>
      <PageHeader
        title={t("library.title")}
        description={t("library.description")}
        actions={curator ? <LinkButton href="/practice-library/new"><Plus size={16} aria-hidden /> {t("library.newCard")}</LinkButton> : undefined}
      />
      <Notice tone="info" title={t("library.kinds.title")} className="mb-5">
        {rich(t("library.kinds.body"), {
          official: <strong>{t("library.kinds.official")}</strong>,
          illustrative: <strong>{t("library.kinds.illustrative")}</strong>,
        })}
      </Notice>
      <form className="mb-5 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1fr_9rem_8rem_12rem_auto]" role="search" aria-label={t("library.filter.aria")}>
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-500" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder={t("library.filter.searchPlaceholder")} aria-label={t("library.filter.searchAria")} className="pl-9" />
        </div>
        <Select name="subject" defaultValue={sp.subject ?? ""} aria-label={t("library.filter.subject")}><option value="">{t("library.filter.anySubject")}</option>{["Hindi", "English", "Mathematics", "EVS"].map((s) => <option key={s} value={s}>{subjectLabel(s)}</option>)}</Select>
        <Select name="grade" defaultValue={sp.grade ?? ""} aria-label={t("library.filter.grade")}><option value="">{t("library.filter.anyGrade")}</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{t("library.gradeLabel", { grade: g })}</option>)}</Select>
        <Select name="domain" defaultValue={sp.domain ?? ""} aria-label={t("library.filter.domain")}><option value="">{t("library.filter.allDomains")}</option>{domains.map((d) => <option key={d}>{d}</option>)}</Select>
        <div className="flex gap-2">
          {curator && <Select name="status" defaultValue={sp.status ?? ""} aria-label={t("library.filter.status")} className="w-32"><option value="">{t("library.filter.anyStatus")}</option><option value="approved">{t("library.filter.approved")}</option><option value="draft">{t("library.filter.draft")}</option><option value="rejected">{t("library.filter.rejected")}</option></Select>}
          <Button type="submit" variant="secondary">{t("common.apply")}</Button>
        </div>
      </form>

      {cards.length === 0 ? (
        <EmptyState icon={<Library size={28} />} title={t("library.empty.title")} description={t("library.empty.description")} action={<LinkButton variant="secondary" href="/practice-library">{t("library.empty.clear")}</LinkButton>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cards.map((c) => (
            <li key={c.id}>
              <Card className="h-full p-5 transition hover:border-ink-700">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[13px] text-ink-600">{t("library.versionShort", { id: c.id, version: c.version })}</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {curator && <Chip tone={c.approval_status === "approved" ? "teal" : c.approval_status === "draft" ? "amber" : "red"}>{approval(c.approval_status)}</Chip>}
                    <OriginBadge origin={c.origin} />
                  </div>
                </div>
                <h2 className="mt-1.5 text-[16px] font-semibold tracking-tight"><Link href={`/practice-library/${c.id}`} className="hover:underline">{locale === "hi" && c.localized.hi ? c.localized.hi.title : c.title}</Link></h2>
                <p className="mt-1.5 line-clamp-3 text-sm text-ink-700"><span lang={locale === "hi" && c.localized.hi ? "hi" : "en"}>{locale === "hi" && c.localized.hi ? c.localized.hi.summary : c.description}</span></p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip>{c.domain}</Chip><Chip>{t("library.gradeLabel", { grade: c.grade_min === c.grade_max ? c.grade_min : `${c.grade_min}–${c.grade_max}` })}</Chip><Chip>{subjectLabel(c.subject)}</Chip>
                </div>
                <p className="mt-3 text-[12px] text-ink-600">{t("library.source", { source: c.origin === "official_source" ? `${c.source_title} · ${c.source_section ?? ""}` : c.source_org })}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
