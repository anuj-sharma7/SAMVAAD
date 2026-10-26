"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import { reportMessage } from "./helpers";

/** "Sync now" pressed by the user: runs a manual sync and words the result in plain language (for an aria-live region). */
export function useSyncAction() {
  const { syncNow, syncing } = useField();
  const { t, tp } = useI18n();
  const [message, setMessage] = useState("");
  const run = useCallback(async () => {
    setMessage("");
    const report = await syncNow(true);
    const m = reportMessage(report);
    setMessage(m.n !== undefined ? tp(m.key, m.n) : t(m.key));
    return report;
  }, [syncNow, t, tp]);
  return { run, syncing, message };
}
