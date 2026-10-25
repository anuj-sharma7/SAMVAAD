"use client";

import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/** The teacher reports the action as done. The mentor still verifies it at the next visit. */
export function MarkDoneButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  const { t } = useI18n();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => api("PATCH", `/commitments/${id}`, { status: "completed" }), { success: t("followups.markDoneSuccess") })}>
      {t("followups.markDone")}
    </Button>
  );
}
