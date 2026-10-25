"use client";

import { Chip, DefinitionRow } from "./ui";
import { fmtDate, fmtDateTime, outcomeKey } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { ReportSnapshot } from "@/lib/services/reports";

// Tone is only decoration: every provenance chip carries its meaning in text, so the report reads in monochrome.
const PROV_TONE: Record<string, "teal" | "amber" | "neutral"> = {
  mentor_authored: "teal",
  ai_drafted_mentor_approved: "amber",
  ai_drafted_mentor_edited_approved: "amber",
  system_generated_from_records: "neutral",
};

function Section({ title, prov, children }: { title: string; prov?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="break-inside-avoid border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {prov && <Chip tone={PROV_TONE[prov] ?? "neutral"}>{prov in PROV_TONE ? t(`report.prov.${prov}`) : prov}</Chip>}
      </div>
      {children}
    </section>
  );
}

/** Print-friendly visit report built only from the frozen/stored snapshot. Labels follow the interface language. */
export function ReportDocument({
  snapshot: s, summary, status, finalizedAt, reviewer,
}: { snapshot: ReportSnapshot; summary: string; status: "draft" | "finalized"; finalizedAt: string | null; reviewer: string | null }) {
  const { t, tp, locale } = useI18n();
  const L = s.feedback?.language ?? "en";
  return (
    <article className="print-page space-y-5 rounded-xl border border-line bg-card p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-600">{t("report.doc.kicker")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{s.visit.school.name}</h1>
          <p className="text-sm text-ink-600">{s.visit.school.block} · {s.visit.school.district}, {s.visit.school.state} · <span className="font-mono">{s.visit.school.code}</span></p>
        </div>
        <div className="text-right">
          <Chip tone={status === "finalized" ? "teal" : "amber"}>{status === "finalized" ? t("report.doc.finalized") : t("report.doc.draftStatus")}</Chip>
          <p className="mt-1.5 text-[12px] text-ink-600">{t("report.doc.demoData")}</p>
        </div>
      </header>

      <Section title={t("report.doc.visitDetails")} prov="system_generated_from_records">
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <DefinitionRow label={t("report.doc.date")}>{fmtDateTime(s.visit.date, locale)}</DefinitionRow>
          <DefinitionRow label={t("report.doc.class")}>{t("report.doc.classValue", { grade: s.visit.grade, subject: s.visit.subject })}</DefinitionRow>
          <DefinitionRow label={t("report.doc.teacher")}>{s.visit.teacher_alias}</DefinitionRow>
          <DefinitionRow label={t("report.doc.mentor")}>{s.visit.mentor_name}</DefinitionRow>
          <DefinitionRow label={t("report.doc.purpose")}>{s.visit.purpose}</DefinitionRow>
          <DefinitionRow label={t("report.doc.focus")}>{s.visit.coaching_focus ?? "—"}</DefinitionRow>
        </dl>
      </Section>

      {s.previous_commitment_review && (
        <Section title={t("report.doc.prevFollowUp")} prov="mentor_authored">
          <p className="text-sm" lang={/[ऀ-ॿ]/.test(s.previous_commitment_review.action_text) ? "hi" : undefined}>{s.previous_commitment_review.action_text}</p>
          <p className="mt-1.5 text-sm"><Chip tone={s.previous_commitment_review.outcome === "tried_working" ? "teal" : "amber"}>{t(outcomeKey(s.previous_commitment_review.outcome))}</Chip></p>
          {s.previous_commitment_review.evidence && <p className="mt-1.5 text-sm"><span className="text-ink-600">{t("report.doc.evidence")}</span> {s.previous_commitment_review.evidence}</p>}
          {s.previous_commitment_review.barriers && <p className="mt-1 text-sm"><span className="text-ink-600">{t("report.doc.barriers")}</span> {s.previous_commitment_review.barriers}</p>}
        </Section>
      )}

      <Section title={t("report.doc.observations")} prov="mentor_authored">
        {s.observations.length === 0 ? <p className="text-sm text-ink-600">{t("report.doc.noObservations")}</p> : (
          <ol className="space-y-3">
            {s.observations.map((o, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{i + 1}. {o.practice_observed}</p>
                <p className="text-ink-700">{o.evidence}</p>
                {o.worked_well && <p><span className="text-teal-700">{t("report.doc.workedWell")}</span> {o.worked_well}</p>}
                {o.improvement_area && <p><span className="text-amber-800">{t("report.doc.areaToGrow")}</span> {o.improvement_area}</p>}
                {o.confirmed_tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{o.confirmed_tags.map((tag) => <Chip key={tag.code} tone="neutral">{tag.label}</Chip>)}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {s.feedback && (
        <Section title={t("report.doc.approvedFeedback")} prov={s.feedback.provenance}>
          <div className="space-y-2 text-sm" lang={L}>
            <p><strong className="text-teal-700">{t("report.doc.strength")}</strong> {s.feedback.strength}</p>
            <p><strong className="text-amber-800">{t("report.doc.priority")}</strong> {s.feedback.priority_practice}</p>
            <p><strong>{t("report.doc.nextStep")}</strong> {s.feedback.next_step}</p>
          </div>
          <p className="mt-2 text-[13px] text-ink-600">
            {s.feedback.approved_at
              ? t("report.doc.approvedByOn", { name: s.feedback.approved_by ?? t("report.doc.mentorFallback"), date: fmtDate(s.feedback.approved_at, locale) })
              : t("report.doc.approvedBy", { name: s.feedback.approved_by ?? t("report.doc.mentorFallback") })}
            {s.feedback.simulated ? ` ${t("report.doc.simulatedNote")}` : ""}
          </p>
          <h3 className="mt-3 text-[13px] font-semibold">{tp("report.doc.sources", s.feedback.citations.length)}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {s.feedback.citations.map((c) => (
              <li key={c.practice_card_id}>
                <span className="font-mono text-[13px]">{c.practice_card_id}</span> {t("report.doc.cardMeta", { version: c.card_version, origin: c.origin === "official_source" ? t("report.doc.originOfficial") : t("report.doc.originIllustrative") })} · {c.source_title}{c.source_section ? ` · ${c.source_section}` : ""}
                {c.chunks && c.chunks.length > 0 ? ` · ${tp("report.doc.excerpt", c.chunks.length, { pages: [...new Set(c.chunks.map((k) => k.printed_page ?? k.pdf_page))].join(", ") })}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.demonstration && (
        <Section title={t("report.doc.demonstration")} prov="ai_drafted_mentor_approved">
          <p className="text-sm">{s.demonstration.objective}</p>
          <p className="mt-1 text-[13px] text-ink-600">{t("report.doc.demoBasis", { card: s.demonstration.card_title })} {s.demonstration.simulated ? t("report.doc.demoSimulated") : t("report.doc.demoApproved")}</p>
        </Section>
      )}

      <Section title={t("report.doc.commitment")} prov="mentor_authored">
        {s.commitment ? (
          <dl>
            <DefinitionRow label={t("report.doc.cNextStep")}><span lang={/[ऀ-ॿ]/.test(s.commitment.action_text) ? "hi" : undefined}>{s.commitment.action_text}</span></DefinitionRow>
            <DefinitionRow label={t("report.doc.cOwner")}>{s.commitment.owner}</DefinitionRow>
            <DefinitionRow label={t("report.doc.cReviewBy")}>{fmtDate(s.commitment.target_date, locale)}</DefinitionRow>
            <DefinitionRow label={t("report.doc.cEvidence")}>{s.commitment.expected_evidence}</DefinitionRow>
          </dl>
        ) : <p className="text-sm text-ink-600">{t("report.doc.noCommitment")}</p>}
      </Section>

      <Section title={t("report.doc.summary")} prov="mentor_authored">
        <p className="whitespace-pre-line text-sm leading-relaxed">{summary}</p>
      </Section>

      <footer className="border-t border-line pt-4 text-[12px] text-ink-600">
        {status === "finalized"
          ? (finalizedAt
            ? t("report.doc.footerFinalByOn", { name: reviewer ?? t("report.doc.theMentor"), date: fmtDateTime(finalizedAt, locale) })
            : t("report.doc.footerFinalBy", { name: reviewer ?? t("report.doc.theMentor") }))
          : t("report.doc.footerDraft")}{" "}
        {t("report.doc.footerNote")}
      </footer>
    </article>
  );
}
