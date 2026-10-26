"use client";

import { useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import { GitCompareArrows } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import type { ConflictRecord } from "@/lib/offline/types";
import { compareVersions } from "./helpers";
import { type RecordInfo, useRecordName } from "./records-panel";
import { BTN, Section } from "./section";

function Versions({ c }: { c: ConflictRecord }) {
  const { t, locale } = useI18n();
  const rows = compareVersions(c.entityType, c.local, c.server);
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? t("sync.conflict.empty") : c.entityType === "visit" && typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? fmtDateTime(v, locale) : String(v));
  if (rows.length === 0) return <p>{t("sync.conflict.noFields")}</p>;
  const cols = [
    { id: "local", title: t("sync.conflict.mine"), pick: (r: (typeof rows)[number]) => r.local },
    { id: "server", title: t("sync.conflict.server"), pick: (r: (typeof rows)[number]) => r.server },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cols.map((col) => (
        <div key={col.id} className="min-w-0 rounded-lg border border-line-strong p-3">
          <h4 className="text-sm font-semibold text-ink-900">{col.title}</h4>
          <dl className="mt-2 space-y-2">
            {rows.map((r) => (
              <div key={r.key} className={r.differs ? "rounded border-l-4 border-ink-900 bg-ink-50 pl-2" : "pl-2"}>
                <dt className="text-[13px] text-ink-600">
                  {t(`sync.field.${r.key}`)}
                  {r.differs && <strong className="ml-1.5 text-ink-900">— {t("sync.conflict.differs")}</strong>}
                </dt>
                <dd className="whitespace-pre-wrap break-words text-ink-900">{show(col.pick(r))}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function ConflictCard({ c, name }: { c: ConflictRecord; name: string }) {
  const { t, locale } = useI18n();
  const { store, syncNow } = useField();
  const [busy, setBusy] = useState(false);
  async function resolve(choice: "mine" | "server") {
    if (!store) return;
    setBusy(true);
    try {
      await store.resolveConflict(c.id, choice);
      await syncNow(true);
    } finally { setBusy(false); }
  }
  return (
    <li data-testid="conflict-card" className="space-y-3 rounded-lg border border-line bg-card p-3">
      <div>
        <p className="break-words font-medium text-ink-900">{name}</p>
        <p className="text-[13px] text-ink-700">{t("sync.conflict.detected", { time: fmtDateTime(c.detectedAt, locale) })}</p>
      </div>
      <Versions c={c} />
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-800">
        <li>{t("sync.conflict.mineHelp")}</li>
        <li>{t("sync.conflict.serverHelp")}</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className={BTN} data-testid="conflict-keep-mine" disabled={busy} onClick={() => void resolve("mine")}>{t("sync.conflict.keepMine")}</Button>
        <Button variant="secondary" className={BTN} data-testid="conflict-keep-server" disabled={busy} onClick={() => void resolve("server")}>{t("sync.conflict.keepServer")}</Button>
      </div>
    </li>
  );
}

export function ConflictsPanel({ conflicts, infos }: { conflicts: ConflictRecord[]; infos: Record<string, RecordInfo> }) {
  const { t, locale } = useI18n();
  const nameOf = useRecordName();
  const byNewest = (a: ConflictRecord, b: ConflictRecord) => b.detectedAt.localeCompare(a.detectedAt);
  const open = conflicts.filter((c) => !c.resolvedAt).sort(byNewest);
  const done = conflicts.filter((c) => c.resolvedAt).sort(byNewest);
  const name = (c: ConflictRecord) => nameOf(c.entityType, infos[`${c.entityType}:${c.entityId}`]);
  return (
    <Section title={t("sync.conflicts.title")} description={t("sync.conflicts.intro")} testId="conflicts-panel">
      {open.length === 0 ? (
        <EmptyState icon={<GitCompareArrows size={28} />} title={t("sync.conflicts.empty")} />
      ) : (
        <ul className="space-y-3">{open.map((c) => <ConflictCard key={c.id} c={c} name={name(c)} />)}</ul>
      )}
      {done.length > 0 && (
        <details className="rounded-lg border border-line" data-testid="resolved-conflicts">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-ink-900">{t("sync.conflict.resolvedTitle", { n: done.length })}</summary>
          <ul className="space-y-3 px-3 pb-3">
            {done.map((c) => (
              <li key={c.id} className="space-y-2 border-t border-line pt-3">
                <p className="break-words font-medium text-ink-900">{name(c)}</p>
                <p className="text-[13px] text-ink-700">
                  {c.resolution === "mine" ? t("sync.conflict.resolvedMine") : t("sync.conflict.resolvedServer")}{" "}
                  {c.resolvedAt && t("sync.conflict.resolvedAt", { time: fmtDateTime(c.resolvedAt, locale) })}
                </p>
                <Versions c={c} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
