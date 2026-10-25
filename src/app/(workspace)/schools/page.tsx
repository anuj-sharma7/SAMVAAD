import Link from "next/link";
import { School, Search } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { listBlocks, listSchools } from "@/lib/services/schools";
import { fmtDate, fmtNumber, relativeDaysT } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Button, Card, Chip, DemoTag, EmptyState, LinkButton, PageHeader, Pagination } from "@/components/ui";
import { Input, Select } from "@/components/forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("schools.meta.title") };
}

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const i = await getI18n();
  const { t, locale } = i;
  const sp = await searchParams;
  const { q, block, attention } = sp;
  const page = Number(sp.page ?? 1) || 1;
  const database = db();
  const result = listSchools(database, actor, {
    q, block, page, pageSize: 8,
    attention: attention === "overdue" || attention === "no_recent_visit" ? attention : undefined,
  });
  const blocks = listBlocks(database, actor);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (block) u.set("block", block);
    if (attention) u.set("attention", attention);
    u.set("page", String(p));
    return `/schools?${u}`;
  };

  return (
    <>
      <PageHeader
        title={t("schools.title")}
        description={actor.role === "mentor" ? t("schools.description.mentor") : t("schools.description.other")}
        actions={actor.role === "mentor" ? <LinkButton href="/visits/new">{t("schools.planVisit")}</LinkButton> : undefined}
      />

      <form className="mb-5 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-[1fr_12rem_13rem_auto]" role="search" aria-label={t("schools.filter.aria")}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-500" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("schools.filter.searchPlaceholder")} aria-label={t("schools.filter.searchAria")} className="pl-9" />
        </div>
        <Select name="block" defaultValue={block ?? ""} aria-label={t("schools.filter.blockAria")}>
          <option value="">{t("schools.filter.allBlocks")}</option>
          {blocks.map((b) => <option key={b}>{b}</option>)}
        </Select>
        <Select name="attention" defaultValue={attention ?? ""} aria-label={t("schools.filter.attentionAria")}>
          <option value="">{t("schools.filter.allSchools")}</option>
          <option value="overdue">{t("schools.filter.overdue")}</option>
          <option value="no_recent_visit">{t("schools.filter.noRecentVisit")}</option>
        </Select>
        <Button type="submit" variant="secondary">{t("common.apply")}</Button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={<School size={28} />} title={t("schools.empty.title")} description={t("schools.empty.description")} action={<LinkButton href="/schools" variant="secondary">{t("schools.empty.clear")}</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("schools.title")}</caption>
              <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">{t("schools.col.school")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("schools.col.block")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("schools.col.mentor")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("schools.col.lastVisit")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("schools.col.nextVisit")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("schools.col.followups")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((s) => (
                  <tr key={s.id} className="hover:bg-ink-50/60">
                    <td className="px-5 py-3.5">
                      <Link href={`/schools/${s.id}`} className="font-medium text-ink-900 hover:underline">{s.name}</Link>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-600"><span className="font-mono">{s.code}</span>{s.is_demo ? <DemoTag /> : null}</div>
                    </td>
                    <td className="px-4 py-3.5 text-ink-700">{s.block}<div className="text-[12px] text-ink-600">{s.cluster}</div></td>
                    <td className="px-4 py-3.5 text-ink-700">{s.mentors ?? <span className="text-ink-500">{t("schools.unassigned")}</span>}</td>
                    <td className="px-4 py-3.5">{s.last_visit_at ? <>{fmtDate(s.last_visit_at, locale)}<div className="text-[12px] text-ink-600">{relativeDaysT(s.last_visit_at, i)}</div></> : <span className="text-ink-600">{t("schools.noneYet")}</span>}</td>
                    <td className="px-4 py-3.5">{s.next_visit_at ? <>{fmtDate(s.next_visit_at, locale)}<div className="text-[12px] text-ink-600">{relativeDaysT(s.next_visit_at, i)}</div></> : <span className="text-ink-600">{t("schools.notScheduled")}</span>}</td>
                    <td className="px-4 py-3.5">
                      {s.overdue_followups > 0 ? <Chip tone="red">{t("schools.followups.overdue", { n: fmtNumber(s.overdue_followups, locale) })}</Chip> : s.open_followups > 0 ? <Chip tone="amber">{t("schools.followups.open", { n: fmtNumber(s.open_followups, locale) })}</Chip> : <Chip tone="teal">{t("schools.followups.none")}</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={qs} />
    </>
  );
}
