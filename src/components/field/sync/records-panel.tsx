"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import type { EntityType, OutboxOp } from "@/lib/offline/types";
import { SyncBadge } from "../sync-badge";
import { ConfirmDialog } from "./confirm-dialog";
import { badgeFor, errorMessageKey, groupOps, safeCode, snippet, type RecordGroup } from "./helpers";
import { BTN, Section } from "./section";

/** Raw parts of a record's plain name; the words around them come from message keys. */
export interface RecordInfo { school?: string; teacher?: string; date?: string; text?: string }

export function useRecordName() {
  const { t, locale } = useI18n();
  return (type: EntityType, info: RecordInfo | undefined): string => {
    if (!info) return t("sync.name.unknown");
    if (type === "visit") {
      return t("sync.name.visit", { school: info.school ?? "—", teacher: info.teacher ?? "—", date: info.date ? fmtDate(info.date, locale) : "—" });
    }
    return t(type === "observation" ? "sync.name.observation" : "sync.name.commitment", { text: snippet(info.text, 40) || "—" });
  };
}

function Explanation({ op, status }: { op: OutboxOp; status: RecordGroup["status"] }) {
  const { t, tp, locale } = useI18n();
  const [now] = useState(() => Date.now());
  if (status === "queued") return <p>{t("sync.rec.queued")}</p>;
  if (status === "inflight") return <p>{t("sync.rec.inflight")}</p>;
  if (status === "conflict") return <p>{t("sync.rec.conflictNote")}</p>;
  const key = errorMessageKey(op.errorCode);
  const code = safeCode(op.errorCode);
  const future = op.nextAttemptAt && new Date(op.nextAttemptAt).getTime() > now;
  return (
    <div className="space-y-1">
      <p>{t(key ?? "sync.err.unknown")}</p>
      {status === "failed" && (
        <p className="text-ink-700">
          {future ? t("sync.rec.nextRetry", { time: fmtDateTime(op.nextAttemptAt as string, locale) }) : t("sync.rec.retryNext")}
          {op.retryCount > 0 && <> {tp("sync.rec.attempts", op.retryCount)}</>}
        </p>
      )}
      {code && <p className="text-[13px] text-ink-700">{t("sync.rec.code", { code })}</p>}
    </div>
  );
}

function RecordRow({ group, name }: { group: RecordGroup; name: string }) {
  const { t, tp } = useI18n();
  const { store, syncNow } = useField();
  const [busy, setBusy] = useState(false);
  const worst = group.ops.find((o) => o.status === group.status) ?? group.ops[0];
  const retryable = group.ops.filter((o) => o.status === "failed" || o.status === "rejected");
  const rejected = group.ops.find((o) => o.status === "rejected");

  async function retry() {
    if (!store) return;
    setBusy(true);
    try {
      for (const o of retryable) await store.retryOp(o.opId);
      await syncNow(true);
    } finally { setBusy(false); }
  }
  async function discard() {
    if (!store || !rejected) return;
    setBusy(true);
    try { await store.discardRejected(rejected.opId); } finally { setBusy(false); }
    document.getElementById("sync-records")?.focus();
  }

  return (
    <li data-testid="sync-record" className="space-y-2 rounded-lg border border-line bg-card p-3">
      <p className="break-words font-medium text-ink-900">{name}</p>
      <div className="flex flex-wrap items-center gap-2">
        <SyncBadge state={badgeFor(group.status)} />
        <span className="text-[13px] text-ink-700">{tp("sync.rec.changes", group.ops.length)}</span>
      </div>
      <Explanation op={worst} status={group.status} />
      {retryable.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" className={BTN} data-testid="sync-retry" disabled={busy} onClick={() => void retry()}>{t("sync.rec.retry")}</Button>
          {rejected && (
            <ConfirmDialog
              testId="sync-discard"
              label={t("sync.rec.discard")}
              title={t("sync.rec.discardTitle")}
              description={<><p className="font-medium">{name}</p><p className="mt-2">{t("sync.rec.discardBody")}</p></>}
              confirmLabel={t("sync.rec.discardConfirm")}
              disabled={busy}
              onConfirm={discard}
            />
          )}
        </div>
      )}
    </li>
  );
}

export function RecordsPanel({ ops, infos }: { ops: OutboxOp[]; infos: Record<string, RecordInfo> }) {
  const { t } = useI18n();
  const nameOf = useRecordName();
  const groups = groupOps(ops);
  return (
    <Section title={t("sync.records.title")} testId="records-panel" id="sync-records">
      {groups.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title={t("sync.records.emptyTitle")} description={t("sync.records.emptyBody")} />
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => <RecordRow key={g.key} group={g} name={nameOf(g.entityType, infos[g.key])} />)}
        </ul>
      )}
    </Section>
  );
}
