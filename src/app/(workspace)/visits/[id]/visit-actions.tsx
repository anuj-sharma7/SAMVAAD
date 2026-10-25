"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { Button, LinkButton } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";

export function VisitActions({ visitId, status, observationCount }: { visitId: string; status: string; observationCount: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const { run, pending } = useAction();
  const move = (to: string, success: string, then?: string) =>
    run(() => api("POST", `/visits/${visitId}/transition`, { to }), { success }).then((r) => { if (r && then) router.push(then); });

  if (status === "draft") {
    return (
      <>
        <LinkButton variant="secondary" href={`/visits/${visitId}/brief`}>{t("brief.meta.title")}</LinkButton>
        <Button variant="accent" disabled={pending} onClick={() => move("planned", t("visits.action.planned"))}>{t("visits.action.plan")}</Button>
      </>
    );
  }
  if (status === "planned") {
    return (
      <>
        <LinkButton variant="secondary" href={`/visits/${visitId}/brief`}>{t("brief.meta.title")}</LinkButton>
        <Button variant="secondary" disabled={pending} onClick={() => move("draft", t("visits.actions.backToDraft"))}>{t("visits.actions.moveDraft")}</Button>
        <Button variant="accent" disabled={pending} onClick={() => move("in_progress", t("visits.actions.started"), `/visits/${visitId}/observe`)}>{t("visits.actions.start")}</Button>
      </>
    );
  }
  if (status === "in_progress") {
    return (
      <>
        <LinkButton variant="secondary" href={`/visits/${visitId}/observe`}>{t("visits.actions.addObservation")}</LinkButton>
        <ConfirmButton
          label={t("visits.actions.sendReview")} variant="accent" title={t("visits.actions.sendReviewTitle")} confirmLabel={t("visits.actions.sendReview")}
          description={t("visits.actions.sendReviewDesc")}
          disabled={observationCount === 0 || pending}
          onConfirm={() => void move("pending_review", t("visits.actions.sentReview"))}
        />
      </>
    );
  }
  if (status === "pending_review") {
    return (
      <>
        <Button variant="secondary" disabled={pending} onClick={() => move("in_progress", t("visits.actions.reopened"))}>{t("visits.actions.reopen")}</Button>
        <LinkButton variant="accent" href={`/visits/${visitId}/feedback`}>{t("visits.actions.reviewFeedback")}</LinkButton>
      </>
    );
  }
  return <LinkButton variant="secondary" href={`/visits/${visitId}/report`}>{t("visits.actions.openReport")}</LinkButton>;
}
