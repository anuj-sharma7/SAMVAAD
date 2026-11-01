"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { Notice } from "@/components/ui";
import { SchoolCheckWizard } from "@/components/school-check-wizard";
import type { CheckAnswers } from "@/lib/school-check";

/** Online page: saves the whole check to the server, then returns to the observations. */
export function SchoolCheckForm({ visitId, initial }: { visitId: string; initial: CheckAnswers }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending, error } = useAction();

  async function save(answers: CheckAnswers) {
    const res = await run(() => api("PUT", `/visits/${visitId}/school-check`, { answers }), { success: t("check.saved") });
    if (res) router.push(`/visits/${visitId}/observe`);
  }

  return (
    <SchoolCheckWizard
      initial={initial} onSave={(a) => void save(a)} pending={pending}
      notice={error && !error.fields ? <Notice tone="error">{error.message}</Notice> : null}
    />
  );
}
