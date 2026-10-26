"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { useField, type FieldPhase } from "@/lib/offline/field-context";
import { FieldLanguageToggle } from "./chrome";

const LINK = "inline-flex min-h-11 items-center justify-center rounded-lg bg-ink-900 px-5 py-2 text-sm font-medium text-white hover:bg-ink-700";
const CODES = { quota: "STORAGE-QUOTA", unavailable: "STORAGE-UNAVAILABLE", migration: "STORAGE-MIGRATION", corrupt: "STORAGE-CORRUPT" } as const;

/** Full-page states shown instead of field mode when it cannot be used. Always: an alert heading, a plain explanation, a retry button. */
export function FieldBlocker({ phase }: { phase: FieldPhase }) {
  const { t } = useI18n();
  const { storageError } = useField();

  let key: string = "noAccount";
  let code: string | null = null;
  let link: { href: string; label: string } = { href: "/login?next=/field", label: t("sync.block.signIn") };
  if (phase === "wrong_role") {
    key = "wrongRole";
    link = { href: "/dashboard", label: t("sync.block.openOnline") };
  } else if (phase === "storage_error") {
    const kind = storageError?.kind ?? "unavailable";
    key = kind;
    code = CODES[kind];
    link = { href: "/dashboard", label: t("sync.block.openOnline") };
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-8 outline-none">
      <div className="flex justify-end"><FieldLanguageToggle /></div>
      <p className="text-base font-bold tracking-wide text-ink-900">SAMVAAD</p>
      <div className="rounded-xl border border-line bg-card p-5">
        <h1 role="alert" className="flex items-start gap-2 text-lg font-semibold text-ink-900">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          {t(`sync.block.${key}.title`)}
        </h1>
        <p className="mt-3 text-sm text-ink-800">{t(`sync.block.${key}.body`)}</p>
        {code && <p className="mt-3 text-[13px] text-ink-700">{t("sync.block.code", { code })}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={link.href} className={LINK}>{link.label}</a>
          <Button variant="secondary" className="h-auto! min-h-11 py-2" onClick={() => window.location.reload()}>{t("sync.block.retry")}</Button>
        </div>
      </div>
    </main>
  );
}
