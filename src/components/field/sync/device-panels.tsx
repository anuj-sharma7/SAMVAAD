"use client";

import { useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { DB_VERSION } from "@/lib/offline/db";
import { useField } from "@/lib/offline/field-context";
import type { SyncLogEntry } from "@/lib/offline/types";
import { ConfirmDialog } from "./confirm-dialog";
import { formatBytes, logResultKey, safeCode, usagePercent } from "./helpers";
import { BTN, Fact, Section } from "./section";

export function StoragePanel() {
  const { t, locale } = useI18n();
  const { storage } = useField();
  const pct = usagePercent(storage.usage, storage.quota);
  const tag = locale === "hi" ? "hi-IN" : "en-IN";
  const usageText = pct !== null && storage.usage !== null && storage.quota !== null
    ? t("sync.storage.usage", { used: formatBytes(storage.usage, tag), total: formatBytes(storage.quota, tag), pct })
    : t("sync.storage.usageUnknown");
  const persist = storage.persisted === true ? "Yes" : storage.persisted === false ? "No" : "Unknown";
  return (
    <Section title={t("sync.storage.title")} testId="storage-panel">
      <div>
        <p>{usageText}</p>
        {pct !== null && (
          <progress className="mt-1.5 h-3 w-full accent-ink-900" value={pct} max={100} aria-label={`${t("sync.storage.progress")}: ${usageText}`}>{pct}%</progress>
        )}
      </div>
      <div>
        <p className="font-medium text-ink-900">{t("sync.storage.persistLabel")}</p>
        <p>{t(`sync.storage.persist${persist}`)}</p>
      </div>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-medium text-amber-900">{t("sync.storage.notEncrypted")}</p>
      <p>{t("sync.storage.limits")}</p>
      <p className="font-medium text-ink-900">{t("sync.storage.syncOften")}</p>
    </Section>
  );
}

export function InstallPanel() {
  const { t } = useI18n();
  const { install } = useField();
  return (
    <Section title={t("sync.install.title")} testId="install-panel">
      {install.standalone ? (
        <p>{t("sync.install.installed")}</p>
      ) : install.available ? (
        <Button variant="primary" className={BTN} onClick={() => void install.prompt()}><Download size={16} aria-hidden />{t("sync.install.button")}</Button>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t("sync.install.android")}</li>
          <li>{t("sync.install.ios")}</li>
        </ul>
      )}
      <p className="text-ink-700">{t("sync.install.optional")}</p>
    </Section>
  );
}

export function DiagnosticsPanel() {
  const { t, locale } = useI18n();
  const f = useField();
  const when = (iso: string | null | undefined) => (iso ? fmtDateTime(iso, locale) : t("sync.tile.never"));
  return (
    <Section title={t("sync.diag.title")} description={t("sync.diag.note")} testId="diag-panel">
      <dl className="divide-y divide-line">
        <Fact label={t("sync.diag.appVersion")}>{f.appVersion}</Fact>
        <Fact label={t("sync.diag.schema")}>{DB_VERSION}</Fact>
        <Fact label={t("sync.diag.connection")}>{t(`sync.conn.${f.reach}`)}</Fact>
        <Fact label={t("sync.diag.session")}>{t(`sync.diag.session.${f.session}`)}</Fact>
        <Fact label={t("sync.diag.pendingOps")}>{f.summary?.pendingOps ?? 0}</Fact>
        <Fact label={t("sync.diag.lastSync")}>{when(f.summary?.lastSyncAt)}</Fact>
        <Fact label={t("sync.diag.lastPull")}>{when(f.summary?.lastPullAt)}</Fact>
        <Fact label={t("sync.diag.sw")}>{f.sw.supported ? t("sync.diag.sw.yes") : t("sync.diag.sw.no")}</Fact>
        <Fact label={t("sync.diag.account")}><span className="font-mono text-[13px]">{f.account?.id ?? "—"}</span></Fact>
      </dl>
    </Section>
  );
}

export function HistoryPanel({ log }: { log: SyncLogEntry[] }) {
  const { t, locale } = useI18n();
  return (
    <Section title={t("sync.history.title")} testId="history-panel">
      {log.length === 0 ? (
        <p>{t("sync.history.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {log.map((e, i) => {
            const code = safeCode(e.code);
            return (
              <li key={e.id ?? i} className="py-2">
                <p className="font-medium text-ink-900">{t(logResultKey(e.result))}</p>
                <p className="text-[13px] text-ink-700">
                  {fmtDateTime(e.at, locale)} · {e.entityType ? t(`sync.entity.${e.entityType}`) : t("sync.history.none")}
                  {code && <> · {t("sync.rec.code", { code })}</>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function LocalDataPanel() {
  const { t, tp } = useI18n();
  const { store, summary } = useField();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const checkId = useId();
  const waiting = (summary?.pendingOps ?? 0) > 0;

  async function wipe(force: boolean) {
    if (!store) return;
    setBusy(true);
    setFailed(false);
    try {
      await store.wipe(force ? { force: true } : undefined);
      window.location.reload();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Section title={t("sync.local.title")} testId="local-data-panel">
      <p>{t("sync.local.body")}</p>
      {waiting ? (
        <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900" data-testid="wipe-warning">
          <p role="alert" className="font-semibold">{tp("sync.local.waitingWarn", summary?.pendingRecords ?? 0)}</p>
          <p>{t("sync.local.betterSync")}</p>
          <div className="flex items-start gap-2">
            <input id={checkId} type="checkbox" className="mt-0.5 size-6 shrink-0 accent-red-700" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="wipe-understand" />
            <label htmlFor={checkId} className="min-h-6 font-medium">{t("sync.local.understand")}</label>
          </div>
          <ConfirmDialog
            testId="wipe-force"
            label={t("sync.local.removeForce")}
            title={t("sync.local.removeTitle")}
            description={<><p className="font-semibold">{tp("sync.local.waitingWarn", summary?.pendingRecords ?? 0)}</p><p className="mt-2">{t("sync.local.removeBody")}</p></>}
            confirmLabel={t("sync.local.removeForce")}
            disabled={!understood || busy}
            onConfirm={() => wipe(true)}
          />
        </div>
      ) : (
        <ConfirmDialog
          testId="wipe-all"
          label={busy ? t("sync.local.removing") : t("sync.local.remove")}
          title={t("sync.local.removeTitle")}
          description={t("sync.local.removeBody")}
          confirmLabel={t("sync.local.removeConfirm")}
          disabled={busy}
          onConfirm={() => wipe(false)}
        />
      )}
      {failed && <p role="alert" className="font-medium text-red-800">{t("sync.local.error")}</p>}
    </Section>
  );
}
