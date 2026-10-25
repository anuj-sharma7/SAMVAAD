"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { Button, Card, CardHeader, CommitmentChip, Notice } from "@/components/ui";
import { Field, Input, Select, Textarea } from "@/components/forms";
import { fmtDate, relativeDaysT } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

interface Suggestion { action_text: string; owner_role: string; owner_alias: string; target_date: string; expected_evidence: string; target_basis: string }
interface Commitment { id: string; action_text: string; owner_alias: string; target_date: string; expected_evidence: string; display_status: string; status: string }

type FollowProps = { visitId: string; locked: boolean; feedbackApproved: boolean; commitment: Commitment | null; suggestion: Suggestion | null };

/** Remounts when the suggestion or commitment changes so form defaults are never stale. */
export function FollowUpPanel(props: FollowProps) {
  return <FollowUpInner key={`${props.commitment?.id}:${props.commitment?.status}:${props.suggestion?.action_text}`} {...props} />;
}

function FollowUpInner({ visitId, locked, feedbackApproved, commitment, suggestion }: FollowProps) {
  const tr = useI18n();
  const { t, locale } = tr;
  const { run, pending, error } = useAction();
  const [v, setV] = useState({
    action_text: suggestion?.action_text ?? "", owner_role: suggestion?.owner_role ?? "teacher", target_date: suggestion?.target_date ?? "",
    expected_evidence: suggestion?.expected_evidence ?? "",
  });
  const f = error?.fields ?? {};

  if (commitment) {
    return (
      <Card>
        <CardHeader title={t("report.fu.title")} description={t("report.fu.description")} action={<CommitmentChip status={commitment.display_status} />} />
        <div className="space-y-2 p-5 text-sm">
          <p className="text-[15px] font-medium" lang={/[ऀ-ॿ]/.test(commitment.action_text) ? "hi" : undefined}>{commitment.action_text}</p>
          <p className="text-ink-600">{t("report.fu.ownerLine", { owner: commitment.owner_alias, date: fmtDate(commitment.target_date, locale), rel: relativeDaysT(commitment.target_date, tr) })}</p>
          <p className="text-ink-700"><span className="text-ink-600">{t("report.fu.evidenceLabel")}</span> {commitment.expected_evidence}</p>
          <div className="flex gap-2 pt-2">
            {commitment.status === "open" && !locked && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => api("PATCH", `/commitments/${commitment.id}`, { status: "completed" }), { success: t("report.fu.toastDone") })}>{t("report.fu.teacherDone")}</Button>
            )}
            <Link className="self-center text-[13px] underline" href="/follow-ups">{t("report.fu.openFollowUps")}</Link>
          </div>
        </div>
      </Card>
    );
  }

  if (!feedbackApproved) {
    return <Notice tone="info" title={t("report.fu.gateTitle")}>{t("report.fu.gateBody")} <Link className="underline" href={`/visits/${visitId}/feedback`}>{t("report.fu.gateLink")}</Link>.</Notice>;
  }

  return (
    <Card>
      <CardHeader title={t("report.fu.formTitle")} description={t("report.fu.formDescription")} />
      <form noValidate className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void run(() => api("POST", "/commitments", { visit_id: visitId, ...v }), { success: t("report.fu.toastSaved") }); }}>
        <Notice tone="info">{t("report.fu.suggested", { basis: suggestion?.target_basis ?? t("report.fu.defaultWindow") })}</Notice>
        <Field label={t("report.fu.nextStep")} htmlFor="ct" required error={f.action_text}><Textarea id="ct" lang={/[ऀ-ॿ]/.test(v.action_text) ? "hi" : undefined} value={v.action_text} onChange={(e) => setV({ ...v, action_text: e.target.value })} error={f.action_text} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("report.fu.owner")} htmlFor="co"><Select id="co" value={v.owner_role} onChange={(e) => setV({ ...v, owner_role: e.target.value })}><option value="teacher">{t("report.fu.ownerTeacher")}</option><option value="head_teacher">{t("report.fu.ownerHead")}</option><option value="mentor">{t("report.fu.ownerMentor")}</option></Select></Field>
          <Field label={t("report.fu.checkBy")} htmlFor="cd" required error={f.target_date}><Input id="cd" type="date" value={v.target_date} onChange={(e) => setV({ ...v, target_date: e.target.value })} error={f.target_date} /></Field>
        </div>
        <Field label={t("report.fu.evidence")} htmlFor="ce" required error={f.expected_evidence} hint={t("report.fu.evidenceHint")}><Textarea id="ce" value={v.expected_evidence} onChange={(e) => setV({ ...v, expected_evidence: e.target.value })} className="min-h-[64px]" error={f.expected_evidence} /></Field>
        {error && !error.fields && <Notice tone="error">{error.message}</Notice>}
        <div className="flex justify-end"><Button type="submit" variant="accent" disabled={pending || locked}>{pending ? t("report.fu.saving") : t("report.fu.save")}</Button></div>
      </form>
    </Card>
  );
}
