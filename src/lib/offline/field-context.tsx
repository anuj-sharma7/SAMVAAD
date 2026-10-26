"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { en as EN, hi as HI } from "@/lib/i18n/messages";
import { I18nProvider, useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { httpTransport, probeServer } from "./http-transport";
import { registry } from "./registry";
import { registerServiceWorker, type SwHandle } from "./sw-register";
import { LocalStore } from "./store";
import { runSync, type SyncReport } from "./sync-engine";
import { StorageError } from "./types";

export interface FieldAccount { id: string; displayName: string; role: string }
export type FieldPhase = "loading" | "ready" | "no_account" | "wrong_role" | "storage_error";
/** ok = the server accepted our session; expired = the server said 401; unknown = we could not ask (offline) */
export type SessionState = "ok" | "expired" | "unknown";
export type Reach = "online" | "offline" | "checking";
export type SyncSummary = Awaited<ReturnType<LocalStore["syncSummary"]>>;
export interface StorageInfo { persisted: boolean | null; usage: number | null; quota: number | null; supported: boolean }

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export interface FieldCtx {
  phase: FieldPhase;
  account: FieldAccount | null;
  store: LocalStore | null;
  reach: Reach;
  session: SessionState;
  syncing: boolean;
  lastReport: SyncReport | null;
  summary: SyncSummary | null;
  storage: StorageInfo;
  storageError: StorageError | null;
  /** bumps whenever local data changed; screens re-read through useLive */
  version: number;
  sw: { supported: boolean; updateReady: boolean; applyUpdate: () => void };
  install: { available: boolean; standalone: boolean; prompt: () => Promise<void> };
  /** Try to synchronise now. `manual` ignores retry delays (the user pressed the button). Resolves to null when the server is unreachable. */
  syncNow: (manual?: boolean) => Promise<SyncReport | null>;
  locale: Locale;
  setLocale: (l: Locale) => void;
  appVersion: string;
}

const Ctx = createContext<FieldCtx | null>(null);
export const APP_VERSION = "0.6.0";
const LANG_KEY = "samvaad.ui-lang"; // low-risk UI preference only
const AUTO_SYNC_MS = 30_000;

export function useField(): FieldCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useField must be used inside <FieldProvider>");
  return v;
}

/** Re-run a read from the local database whenever local data changes. */
export function useLive<T>(load: (store: LocalStore) => Promise<T>, deps: readonly unknown[] = []): { data: T | undefined; loading: boolean; error: unknown } {
  const { store, version } = useField();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: unknown }>({ data: undefined, loading: true, error: null });
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  const key = JSON.stringify(deps);
  useEffect(() => {
    if (!store) return;
    let alive = true;
    loadRef.current(store).then(
      (data) => { if (alive) setState({ data, loading: false, error: null }); },
      (error) => { if (alive) setState((s) => ({ ...s, loading: false, error })); },
    );
    return () => { alive = false; };
  }, [store, version, key]);
  return state;
}

async function whoAmI(): Promise<{ kind: "ok"; account: FieldAccount } | { kind: "expired" } | { kind: "unreachable" }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch("/api/v1/me", { credentials: "same-origin", cache: "no-store", signal: ctl.signal });
    if (res.status === 401) return { kind: "expired" };
    if (!res.ok) return { kind: "unreachable" };
    const j = (await res.json()) as { data?: { actor?: { id: string; displayName: string; role: string } } };
    const a = j.data?.actor;
    return a ? { kind: "ok", account: { id: a.id, displayName: a.displayName, role: a.role } } : { kind: "unreachable" };
  } catch {
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

export function FieldProvider({ children }: { children: React.ReactNode }) {
  const root = useI18n();
  const [locale, setLocaleState] = useState<Locale>(root.locale);
  const [phase, setPhase] = useState<FieldPhase>("loading");
  const [account, setAccount] = useState<FieldAccount | null>(null);
  const [store, setStore] = useState<LocalStore | null>(null);
  const [reach, setReach] = useState<Reach>("checking");
  const [session, setSession] = useState<SessionState>("unknown");
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [storage, setStorage] = useState<StorageInfo>({ persisted: null, usage: null, quota: null, supported: false });
  const [storageError, setStorageError] = useState<StorageError | null>(null);
  const [version, setVersion] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const swRef = useRef<SwHandle | null>(null);
  const [swSupported, setSwSupported] = useState(false);
  const applyUpdate = useCallback(() => swRef.current?.applyUpdate(), []);
  const syncingRef = useRef(false);
  const manualAgainRef = useRef(false);

  // The interface language can be changed offline: both dictionaries are bundled with field mode.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
    if (saved === "en" || saved === "hi") {
      const t = setTimeout(() => setLocaleState(saved as Locale), 0);
      return () => clearTimeout(t);
    }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
    void fetch("/api/v1/locale", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }), credentials: "same-origin" }).catch(() => undefined); // remembered on the server when online
  }, []);

  const refreshStorage = useCallback(async () => {
    const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!s) return;
    try {
      const est = s.estimate ? await s.estimate() : null;
      const persisted = s.persisted ? await s.persisted() : null;
      setStorage({ supported: true, persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
    } catch { /* leave as unknown */ }
  }, []);

  const syncNow = useCallback(async (manual = false): Promise<SyncReport | null> => {
    if (!store) return null;
    if (syncingRef.current) {
      // A background sync is running. A button press must not be lost: run again (ignoring retry delays) when it finishes.
      if (manual) manualAgainRef.current = true;
      return null;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const up = await probeServer();
      setReach(up ? "online" : "offline");
      if (!up) return null;
      const report = await runSync(store, httpTransport(), { manual });
      setLastReport(report);
      if (report.status === "auth_expired") setSession("expired");
      else if (report.status !== "offline") setSession("ok");
      return report;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      void refreshStorage();
      if (manualAgainRef.current) { manualAgainRef.current = false; setTimeout(() => void syncNowRef.current?.(true), 0); }
    }
  }, [store, refreshStorage]);
  const syncNowRef = useRef<typeof syncNow | null>(null);
  useEffect(() => { syncNowRef.current = syncNow; }, [syncNow]);

  // ---- start up: who is this, open their database, register the worker ----------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      setStandalone(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
      swRef.current = await registerServiceWorker();
      if (alive) setSwSupported(swRef.current.supported);
      swRef.current.onUpdateReady(() => alive && setUpdateReady(true));
      const me = await whoAmI();
      if (!alive) return;
      let acct: FieldAccount | null = null;
      if (me.kind === "ok") {
        setReach("online"); setSession("ok");
        acct = me.account;
        if (acct.role !== "mentor") { setAccount(acct); setPhase("wrong_role"); return; }
        await registry.setLast({ id: acct.id, displayName: acct.displayName, role: acct.role });
      } else {
        setReach(me.kind === "expired" ? "online" : "offline");
        setSession(me.kind === "expired" ? "expired" : "unknown");
        const last = await registry.getLast();
        acct = last ? { id: last.id, displayName: last.displayName, role: last.role } : null;
      }
      if (!acct) { setPhase("no_account"); return; }
      setAccount(acct);
      try {
        const s = await LocalStore.open(acct.id);
        if (!alive) { s.close(); return; }
        setStore(s);
        setPhase("ready");
        try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
        void refreshStorage();
      } catch (e) {
        setStorageError(e instanceof StorageError ? e : new StorageError("unavailable", "Local storage is not available.", e));
        setPhase("storage_error");
      }
    })();
    return () => { alive = false; };
  }, [refreshStorage]);

  // ---- keep React in step with the local database -------------------------------------------------------------------
  useEffect(() => {
    if (!store) return;
    let alive = true;
    const update = async () => {
      const s = await store.syncSummary();
      if (!alive) return;
      setSummary(s);
      setVersion((v) => v + 1);
      void registry.setPending(store.accountId, s.pendingOps);
    };
    void update();
    const unsub = store.subscribe(() => void update());
    return () => { alive = false; unsub(); };
  }, [store]);

  // ---- when to synchronise: start, network back, app visible again, a timer while something waits, and the button ---------
  useEffect(() => {
    if (!store) return;
    const go = () => void syncNow(false);
    const onOnline = () => go();
    const onOffline = () => setReach("offline");
    const onVisible = () => { if (document.visibilityState === "visible") go(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const first = setTimeout(go, 300);
    const timer = setInterval(() => { void store.syncSummary().then((s) => { if (s.pendingOps > 0) go(); }); }, AUTO_SYNC_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [store, syncNow]);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstallEvent(null); setStandalone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const value = useMemo<FieldCtx>(() => ({
    phase, account, store, reach, session, syncing, lastReport, summary, storage, storageError, version,
    sw: { supported: swSupported, updateReady, applyUpdate },
    install: { available: !!installEvent, standalone, prompt: async () => { await installEvent?.prompt(); setInstallEvent(null); } },
    syncNow, locale, setLocale, appVersion: APP_VERSION,
  }), [phase, account, store, reach, session, syncing, lastReport, summary, storage, storageError, version, swSupported, updateReady, applyUpdate, installEvent, standalone, syncNow, locale, setLocale]);

  return (
    <Ctx.Provider value={value}>
      <I18nProvider locale={locale} messages={locale === "hi" ? (HI as Record<string, string>) : (EN as Record<string, string>)}>{children}</I18nProvider>
    </Ctx.Provider>
  );
}
