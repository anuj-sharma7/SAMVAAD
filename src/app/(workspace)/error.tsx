"use client";

import { TriangleAlert } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<TriangleAlert size={28} />}
      title={t("errors.page.title")}
      description={
        <>
          {t("errors.page.description")}{" "}
          {error.digest ? <span className="font-mono text-xs">{t("errors.page.ref")} {error.digest}</span> : null}
        </>
      }
      action={<Button onClick={reset}>{t("common.retry")}</Button>}
    />
  );
}
