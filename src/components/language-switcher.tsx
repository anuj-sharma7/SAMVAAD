"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_NAME, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/client/api";
import { cn } from "./ui";

/** Interface-language toggle. Saves the choice (cookie, plus the profile when signed in) and re-renders in place. */
export function LanguageSwitcher({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<Locale | null>(null);
  async function choose(l: Locale) {
    if (l === locale || busy) return;
    setBusy(l);
    try {
      await api("PUT", "/locale", { locale: l });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div role="group" aria-label={t("common.language.switchTo")} className="flex items-center gap-1.5">
      <Languages size={15} aria-hidden className={tone === "dark" ? "text-ink-100/70" : "text-ink-600"} />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          disabled={busy !== null}
          onClick={() => void choose(l)}
          className={cn(
            "min-h-9 min-w-9 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            tone === "dark"
              ? l === locale ? "bg-white/20 text-white" : "text-ink-100/85 hover:bg-white/10"
              : l === locale ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100",
          )}
        >
          {LOCALE_NAME[l]}
        </button>
      ))}
    </div>
  );
}
