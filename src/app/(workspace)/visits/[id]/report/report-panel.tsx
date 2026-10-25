"use client";

import { useState } from "react";
import { Download, FileCheck2, Printer } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { Button, Card, CardHeader, LinkButton, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Field, Textarea } from "@/components/forms";
import { ReportDocument } from "@/components/report-document";
import { useI18n } from "@/lib/i18n/client";
import type { ReportView } from "@/lib/services/reports";

type PanelProps = { visitId: string; visitStatus: string; report: ReportView | null; reviewer: string | null; ready: { feedback: boolean; commitment: boolean } };

/** Remounts when the server sends a new report version so the summary editor never shows stale text. */
export function ReportPanel(props: PanelProps) {
  return <ReportPanelInner key={`${props.report?.id}:${props.report?.generated_at}:${props.report?.status}`} {...props} />;
}

function ReportPanelInner({ visitId, visitStatus, report, reviewer, ready }: PanelProps) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [summary, setSummary] = useState(report?.mentor_summary ?? "");
  const final = report?.status === "finalized";
  const started = !["draft", "planned"].includes(visitStatus);
  const blockers = [!ready.feedback && t("report.panel.blockApprove"), !ready.commitment && t("report.panel.blockCommit")].filter(Boolean) as string[];

  if (!report) {
    return (
      <Card className="no-print p-6">
        <h2 className="text-lg font-semibold tracking-tight">{t("report.panel.title")}</h2>
        <p className="mt-1.5 max-w-xl text-sm text-ink-600">{t("report.panel.intro")}</p>
        {!started && <Notice className="mt-4" tone="warning">{t("report.panel.startFirst")}</Notice>}
        <Button className="mt-4" variant="accent" disabled={pending || !started} onClick={() => run(() => api("POST", `/visits/${visitId}/report`), { success: t("report.toast.prepared") })}>{pending ? t("report.panel.preparing") : t("report.panel.prepare")}</Button>
      </Card>
    );
  }

  const dirty = summary !== report.mentor_summary;
  return (
    <div className="space-y-5">
      <Card className="no-print">
        <CardHeader
          title={final ? t("report.panel.titleFinal") : t("report.panel.titleReview")}
          description={final ? t("report.panel.descFinal") : t("report.panel.descReview")}
          action={
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="secondary" size="sm" href={`/visits/${report.visit_id}/summary`}>{t("brief.summary.meta.title")}</LinkButton>
              <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={15} aria-hidden /> {t("report.panel.print")}</Button>
              {/* Plain anchor on purpose: this is a file download from an API route, not a page navigation. */}
  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
  <a href="/api/v1/reports/export" className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-[13px] font-medium hover:bg-ink-50"><Download size={15} aria-hidden /> {t("report.panel.export")}</a>
            </div>
          }
        />
        {!final && (
          <div className="space-y-4 p-5">
            <Field label={t("report.panel.summary")} htmlFor="sum" required hint={t("report.panel.summaryHint")}>
              <Textarea id="sum" value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[150px]" maxLength={3000} />
            </Field>
            {blockers.length > 0 && <Notice tone="warning" title={t("report.panel.notReady")}>{t("report.panel.notReadyBody", { blockers: blockers.join(t("report.panel.blockJoin")) })}</Notice>}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => run(() => api("POST", `/visits/${visitId}/report`), { success: t("report.toast.refreshed") })}>{t("report.panel.refresh")}</Button>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={!dirty || pending} onClick={() => run(() => api("PATCH", `/visits/${visitId}/report`, { mentor_summary: summary, expected_updated_at: report.updated_at }), { success: t("report.toast.summarySaved") })}>{t("report.panel.saveSummary")}</Button>
                <ConfirmButton
                  variant="accent" label={<><FileCheck2 size={15} aria-hidden /> {t("report.panel.finalize.label")}</>} title={t("report.panel.finalize.title")} confirmLabel={t("report.panel.finalize.confirm")}
                  description={t("report.panel.finalize.description")}
                  disabled={pending || blockers.length > 0}
                  onConfirm={async () => { if (dirty) { const ok = await run(() => api("PATCH", `/visits/${visitId}/report`, { mentor_summary: summary, expected_updated_at: report.updated_at }), { refresh: false }); if (!ok) return; } await run(() => api("POST", `/visits/${visitId}/report/finalize`), { success: t("report.toast.finalized") }); }}
                />
              </div>
            </div>
          </div>
        )}
      </Card>
      <ReportDocument snapshot={report.snapshot} summary={final ? report.mentor_summary : summary || report.mentor_summary} status={report.status} finalizedAt={report.finalized_at} reviewer={reviewer} />
    </div>
  );
}
