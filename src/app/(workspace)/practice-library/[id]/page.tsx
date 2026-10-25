import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getCard } from "@/lib/services/practice-cards";
import { all } from "@/lib/db/client";
import { can } from "@/lib/auth/policy";
import { fmtDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, Chip, DefinitionRow, LinkButton, Notice, OriginBadge, PageHeader } from "@/components/ui";
import { CuratorActions, ChunkReview } from "./curator-actions";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const { t, locale } = await getI18n();
  const r = safe(() => getCard(db(), actor, id));
  if (!r.ok) notFound();
  const c = r.value;
  const curator = can(actor, "card:write");
  const versions = curator ? all<{ version: number; changed_at: string }>(db(), "SELECT version, changed_at FROM practice_card_versions WHERE card_id = ? ORDER BY version DESC", id) : [];
  const hi = c.localized.hi;
  const approval = (s: string) => (["approved", "draft", "rejected"].includes(s) ? t(`library.approval.${s}`) : s);
  const chunkStatus = (s: string) => (["pending_review", "approved", "rejected"].includes(s) ? t(`library.chunk.${s}`) : s.replace("_", " "));
  const subjectLabel = (s: string) => (["Hindi", "English", "Mathematics", "EVS", "Any"].includes(s) ? t(`library.subject.${s}`) : s);
  const langLabel = (l: string) => (["any", "hi", "en"].includes(l) ? t(`library.lang.${l}`) : l);
  const h3 = "mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-600";

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/practice-library", label: t("library.title") }, { label: c.id }]}
        title={c.title}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[13px]">{t("library.versionLong", { id: c.id, version: c.version })}</span><Chip tone={c.approval_status === "approved" ? "teal" : c.approval_status === "draft" ? "amber" : "red"}>{approval(c.approval_status)}</Chip><OriginBadge origin={c.origin} /></span>}
        actions={curator ? <LinkButton variant="secondary" href={`/practice-library/${c.id}/edit`}>{t("library.detail.edit")}</LinkButton> : undefined}
      />
      {c.origin === "illustrative" && <Notice tone="info" title={t("library.detail.illustrative.title")} className="mb-5">{t("library.detail.illustrative.body")}</Notice>}
      {c.origin === "official_source" && <Notice tone="info" title={t("library.detail.official.title")} className="mb-5">{t("library.detail.official.body")}</Notice>}
      {c.approval_status !== "approved" && <Notice tone="warning" title={t("library.detail.notApproved.title")} className="mb-5">{t("library.detail.notApproved.body")}{c.review_notes ? ` ${t("library.detail.notApproved.note", { note: c.review_notes })}` : ""}</Notice>}
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("library.detail.practice")} />
            <div className="space-y-5 p-5 text-sm">
              <p className="text-[15px] leading-relaxed">{c.description}</p>
              <div><h3 className={h3}>{t("library.detail.steps")}</h3><ol className="list-decimal space-y-1.5 pl-5">{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
              <div><h3 className={h3}>{t("library.detail.prompts")}</h3><ul className="list-disc space-y-1 pl-5">{c.example_prompts.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              <div><h3 className={h3}>{t("library.detail.nextStep")}</h3><p>{c.next_step}</p></div>
              {c.variation && <div><h3 className={h3}>{t("library.detail.variation")}</h3><p>{c.variation}</p></div>}
              {c.example_dialogue.length > 0 && <div><h3 className={h3}>{t("library.detail.dialogue")}</h3><p className="whitespace-pre-line rounded-lg bg-ink-50 p-3.5">{c.example_dialogue.join("\n")}</p></div>}
            </div>
          </Card>
          {c.origin === "official_source" && (
            <Card>
              <CardHeader title={t("library.excerpts.title")} description={t("library.excerpts.description", { title: c.source_title })} />
              <p className="border-b border-line px-5 py-2.5 text-[12px] text-ink-600">{t("library.excerpts.originalText")}</p>
              <ul className="divide-y divide-line">
                {(c.chunks ?? []).map((k) => (
                  <li key={k.chunk_id} className="space-y-2 px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-ink-600">{t("library.excerpts.meta", { id: k.chunk_id, printed: k.printed_page ?? "?", pdf: k.pdf_page, role: k.role })}</span>
                      <Chip tone={k.review_status === "approved" ? "teal" : k.review_status === "rejected" ? "red" : "amber"}>{chunkStatus(k.review_status)}</Chip>
                    </div>
                    <blockquote lang="en" className="border-l-2 border-ink-600 pl-3 italic text-ink-800">“{k.text}”</blockquote>
                    {curator && <ChunkReview chunkId={k.chunk_id} status={k.review_status} />}
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-5 py-3 text-[12px] text-ink-600">{t("library.excerpts.footer")} <a className="underline" href={c.source_url ?? "#"} target="_blank" rel="noopener noreferrer">{t("library.excerpts.openSource")}</a>{t("library.excerpts.end")}</p>
            </Card>
          )}
          {hi && (
            <Card>
              <CardHeader title={t("library.hindi.title")} description={t("library.hindi.description")} />
              <div className="space-y-4 p-5 text-sm" lang="hi">
                <h3 className="text-[16px] font-semibold">{hi.title}</h3>
                <p>{hi.summary}</p>
                <ol className="list-decimal space-y-1.5 pl-5">{hi.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <p><strong>अगला कदम:</strong> {hi.next_step}</p>
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("library.applic.title")} />
            <dl className="divide-y divide-line px-5">
              <DefinitionRow label={t("library.applic.domain")}>{c.domain}</DefinitionRow>
              <DefinitionRow label={t("library.applic.grades")}>{c.grade_min === c.grade_max ? c.grade_min : `${c.grade_min}–${c.grade_max}`}</DefinitionRow>
              <DefinitionRow label={t("library.applic.subject")}>{subjectLabel(c.subject)}</DefinitionRow>
              <DefinitionRow label={t("library.applic.language")}>{c.teaching_language === "any" ? t("library.applic.languageAny") : langLabel(c.teaching_language)}</DefinitionRow>
              <DefinitionRow label={t("library.applic.materials")}>{c.tlm.length ? c.tlm.join(", ") : t("library.applic.noMaterials")}</DefinitionRow>
              <DefinitionRow label={t("library.applic.sourceOrg")}>{c.source_org}</DefinitionRow>
              <DefinitionRow label={t("library.applic.sourceTitle")}>{c.source_title}</DefinitionRow>
              <DefinitionRow label={t("library.applic.section")}>{c.source_section ?? "—"}</DefinitionRow>
              <DefinitionRow label={t("library.applic.url")}>{c.source_url ? <a className="underline" href={c.source_url} rel="noreferrer noopener" target="_blank">{c.source_url}</a> : t("library.applic.noUrl")}</DefinitionRow>
              <DefinitionRow label={t("library.applic.lastReviewed")}>{c.last_reviewed_at ? fmtDate(c.last_reviewed_at, locale) : t("library.applic.notReviewed")}</DefinitionRow>
              <DefinitionRow label={t("library.applic.tags")}><span className="flex flex-wrap gap-1">{c.tags.slice(0, 14).map((tag) => <Chip key={tag}>{tag}</Chip>)}</span></DefinitionRow>
            </dl>
          </Card>
          {curator && (
            <>
              <CuratorActions id={c.id} status={c.approval_status} />
              <Card><CardHeader title={t("library.versions.title")} /><ul className="divide-y divide-line px-5 text-sm">{versions.map((v) => <li key={v.version} className="flex justify-between py-2.5"><span>{t("library.versions.item", { version: v.version })}</span><span className="text-ink-600">{fmtDate(v.changed_at, locale)}</span></li>)}</ul></Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
