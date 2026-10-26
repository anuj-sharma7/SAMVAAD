"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { useField, useLive } from "@/lib/offline/field-context";
import type { LocalStore } from "@/lib/offline/store";
import { ConflictsPanel } from "../sync/conflicts-panel";
import { DiagnosticsPanel, HistoryPanel, InstallPanel, LocalDataPanel, StoragePanel } from "../sync/device-panels";
import { RecordsPanel, type RecordInfo } from "../sync/records-panel";
import { BTN } from "../sync/section";
import { useSyncAction } from "../sync/use-sync-action";

/** Everything the screen shows from the device database, read in one go. Record text stays on the device and is only shown here. */
async function load(s: LocalStore) {
  const [ops, conflicts, log, visits, schools] = await Promise.all([s.listOutbox(), s.listConflicts(), s.listSyncLog(), s.listVisits(), s.listSchools()]);
  const schoolName = new Map(schools.map((x) => [x.id, x.name]));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const infos: Record<string, RecordInfo> = {};
  const obsCache = new Map<string, Awaited<ReturnType<LocalStore["listObservations"]>>>();
  const comCache = new Map<string, Awaited<ReturnType<LocalStore["listCommitments"]>>>();
  const targets = [
    ...ops.map((o) => ({ type: o.entityType, id: o.entityId, chain: o.chain })),
    ...conflicts.map((c) => ({ type: c.entityType, id: c.entityId, chain: String((c.local as { visit_id?: string }).visit_id ?? c.entityId) })),
  ];
  for (const x of targets) {
    const key = `${x.type}:${x.id}`;
    if (infos[key]) continue;
    if (x.type === "visit") {
      const v = visitById.get(x.id);
      if (v) infos[key] = { school: schoolName.get(v.school_id), teacher: v.teacher_alias, date: v.scheduled_at };
    } else if (x.type === "observation") {
      if (!obsCache.has(x.chain)) obsCache.set(x.chain, await s.listObservations(x.chain));
      const o = obsCache.get(x.chain)?.find((r) => r.id === x.id);
      if (o) infos[key] = { text: o.evidence || o.practice_observed };
    } else {
      if (!comCache.has(x.chain)) comCache.set(x.chain, await s.listCommitments(x.chain));
      const c = comCache.get(x.chain)?.find((r) => r.id === x.id);
      if (c) infos[key] = { text: c.action_text };
    }
  }
  return { ops, conflicts, log: log.slice(0, 20), infos };
}

function Tile({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3" data-testid={testId}>
      <dt className="text-[13px] text-ink-600">{label}</dt>
      <dd className="mt-0.5 break-words text-lg font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

export function SyncCenterScreen() {
  const { t, locale } = useI18n();
  const { summary, syncing } = useField();
  const sync = useSyncAction();
  const { data, error } = useLive(load, []);
  const when = (iso: string | null | undefined) => (iso ? fmtDateTime(iso, locale) : t("sync.tile.never"));

  return (
    <div className="space-y-4" data-testid="sync-center">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t("sync.center.title")}</h1>
        <p className="mt-1 text-sm text-ink-700">{t("sync.center.intro")}</p>
      </div>

      <section aria-label={t("sync.center.title")} className="space-y-3">
        <dl className="grid grid-cols-2 gap-3">
          <Tile testId="tile-waiting" label={t("sync.tile.waiting")} value={summary?.pendingRecords ?? 0} />
          <Tile testId="tile-attention" label={t("sync.tile.attention")} value={summary?.needsAttention ?? 0} />
          <Tile testId="tile-last-sync" label={t("sync.tile.lastSync")} value={when(summary?.lastSyncAt)} />
          <Tile testId="tile-last-pull" label={t("sync.tile.lastPull")} value={when(summary?.lastPullAt)} />
        </dl>
        <Button variant="primary" className={BTN} data-testid="sync-center-sync-now" disabled={syncing} onClick={() => void sync.run()}>
          {syncing ? <Loader2 size={16} aria-hidden className="motion-safe:animate-spin" /> : <RefreshCw size={16} aria-hidden />}
          {syncing ? t("sync.bar.syncing") : t("sync.bar.syncNow")}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-ink-800 empty:hidden">{sync.message}</p>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{t("sync.center.readError")}</p>
      ) : !data ? (
        <p role="status" className="text-sm text-ink-700">{t("common.loading")}</p>
      ) : (
        <>
          <RecordsPanel ops={data.ops} infos={data.infos} />
          <ConflictsPanel conflicts={data.conflicts} infos={data.infos} />
        </>
      )}

      <StoragePanel />
      <InstallPanel />
      <DiagnosticsPanel />
      {data && <HistoryPanel log={data.log} />}
      <LocalDataPanel />
    </div>
  );
}
