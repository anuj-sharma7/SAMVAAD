"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { Button, Card, CardHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Field, Textarea } from "@/components/forms";

export function CuratorActions({ id, status }: { id: string; status: string }) {
  const { t } = useI18n();
  const { run, pending, error } = useAction();
  const [notes, setNotes] = useState("");
  const review = (decision: "approve" | "reject") => run(() => api("POST", `/practice-cards/${id}/review`, { decision, notes: notes || undefined }), { success: decision === "approve" ? t("library.curator.approvedToast") : t("library.curator.rejectedToast") });
  return (
    <Card>
      <CardHeader title={t("library.curator.title")} description={status === "approved" ? t("library.curator.descApproved") : t("library.curator.descOther")} />
      <div className="space-y-3 p-5">
        <Field label={t("library.curator.noteLabel")} htmlFor="rn" error={error?.fields?.notes} hint={t("library.curator.noteHint")}>
          <Textarea id="rn" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[72px]" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {status !== "approved" && <ConfirmButton variant="accent" label={t("library.curator.approveCard")} title={t("library.curator.approveTitle")} confirmLabel={t("common.approve")} description={t("library.curator.approveDesc")} disabled={pending} onConfirm={() => void review("approve")} />}
          {status !== "rejected" && <ConfirmButton variant="danger" label={t("common.reject")} title={t("library.curator.rejectTitle")} confirmLabel={t("common.reject")} description={t("library.curator.rejectDesc")} disabled={pending || !notes.trim()} onConfirm={() => void review("reject")} />}
          {status === "approved" && <Button variant="secondary" disabled>{t("library.curator.approvedBtn")}</Button>}
        </div>
      </div>
    </Card>
  );
}

/** Approve or reject ONE verbatim source excerpt. A card built on excerpts can only be approved after all of them are approved. */
export function ChunkReview({ chunkId, status }: { chunkId: string; status: string }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [note, setNote] = useState("");
  const review = (decision: "approve" | "reject") =>
    run(() => api("POST", `/knowledge/chunks/${chunkId}/review`, { decision, notes: note || undefined }), { success: decision === "approve" ? t("library.chunk.approvedToast") : t("library.chunk.rejectedToast") });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="sr-only" htmlFor={`note-${chunkId}`}>{t("library.chunk.noteLabel", { id: chunkId })}</label>
      <input id={`note-${chunkId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("library.chunk.notePlaceholder")} className="h-8 w-56 max-w-full rounded-lg border border-line-strong px-2 text-[13px]" />
      {status !== "approved" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => review("approve")}>{t("library.chunk.approve")}</Button>}
      {status !== "rejected" && <Button size="sm" variant="danger" disabled={pending || !note.trim()} onClick={() => review("reject")}>{t("common.reject")}</Button>}
    </div>
  );
}
