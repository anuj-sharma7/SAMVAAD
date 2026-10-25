"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Honest save indicator: shown text always matches what really happened (announced politely to screen readers). */
export function SaveStatus({ state }: { state: SaveState }) {
  const { t } = useI18n();
  return (
    <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[13px] text-ink-600">
      {state === "saving" && <><Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> {t("common.saving")}</>}
      {state === "saved" && <><Check size={14} className="text-teal-700" aria-hidden /> {t("common.saved")}</>}
      {state === "error" && <><AlertCircle size={14} className="text-red-700" aria-hidden /> {t("common.notSaved")}</>}
    </p>
  );
}
