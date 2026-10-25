"use client";

import { useId, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/forms";

export const GLOSSARY_IDS = [
  "observation", "nextstep", "followup", "card", "approved", "simulated", "demo", "refyear", "survey",
  "crp", "brp", "arp", "diet", "fln", "nipun", "tlm", "udise", "aser",
] as const;

/** Client-side search over the glossary in the active language. */
export function Glossary() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const hintId = useId();
  const items = useMemo(() => GLOSSARY_IDS.map((id) => ({ id, term: t(`help.glossary.${id}.term`), def: t(`help.glossary.${id}.def`) })), [t]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => `${i.term} ${i.def}`.toLowerCase().includes(needle)) : items;
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="glossary-q" className="mb-1 block text-sm font-medium">{t("help.glossary.search")}</label>
        <Input id="glossary-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby={hintId} placeholder={t("help.glossary.searchHint")} />
        <p id={hintId} className="sr-only">{t("help.glossary.searchHint")}</p>
      </div>
      <p role="status" className="sr-only">{shown.length === 0 ? t("help.glossary.none") : ""}</p>
      {shown.length === 0 ? (
        <p className="text-sm text-ink-600">{t("help.glossary.none")}</p>
      ) : (
        <dl className="divide-y divide-line rounded-lg border border-line bg-card">
          {shown.map((i) => (
            <div key={i.id} className="px-4 py-3">
              <dt className="font-semibold">{i.term}</dt>
              <dd className="mt-0.5 text-sm text-ink-700">{i.def}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
