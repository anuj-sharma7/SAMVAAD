"use client";

import { useEffect } from "react";
import { BookOpen, CloudOff, Home, Languages, Loader2, PlusCircle, RefreshCw, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAME } from "@/lib/i18n/config";
import { fmtDateTime } from "@/lib/format";
import { useField } from "@/lib/offline/field-context";
import { hrefTo, useHashRoute } from "@/lib/offline/use-hash-route";
import { Banner } from "./sync/banner";
import { useSyncAction } from "./sync/use-sync-action";
import { usagePercent } from "./sync/helpers";

const LINK = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50";

/** Interface language toggle for field mode: works offline (both dictionaries are bundled), unlike the server-backed LanguageSwitcher. */
export function FieldLanguageToggle() {
  const { locale, setLocale } = useField();
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("sync.chrome.language")} className="flex items-center gap-1">
      <Languages size={15} aria-hidden className="text-ink-600" />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
          className={cn(
            "min-h-11 min-w-11 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            l === locale ? "bg-ink-900 text-white underline underline-offset-4" : "text-ink-700 hover:bg-ink-100",
          )}
        >
          {LOCALE_NAME[l]}
        </button>
      ))}
    </div>
  );
}

function navIndex(first: string | undefined, second: string | undefined): "home" | "new" | "cards" | "sync" {
  if (first === "sync") return "sync";
  if (first === "cards") return "cards";
  if (first === "visits" && second === "new") return "new";
  return "home";
}

export function FieldChrome({ children }: { children: React.ReactNode }) {
  const f = useField();
  const { t, tp, locale } = useI18n();
  const { segments } = useHashRoute();
  const sync = useSyncAction();
  const { summary, reach, session, storage, account, lastReport } = f;

  // The fixed bottom navigation must never hide the element that has keyboard focus.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.scrollPaddingBottom;
    el.style.scrollPaddingBottom = "6rem";
    return () => { el.style.scrollPaddingBottom = prev; };
  }, []);

  const current = navIndex(segments[0], segments[1]);
  const pendingRecords = summary?.pendingRecords ?? 0;
  const pct = usagePercent(storage.usage, storage.quota);

  const conn = {
    online: { Icon: Wifi, text: t("sync.conn.online") },
    offline: { Icon: WifiOff, text: t("sync.conn.offline") },
    checking: { Icon: CloudOff, text: t("sync.conn.checking") },
  }[reach];

  const items: { id: typeof current; href: string; label: string; Icon: LucideIcon; testId?: string }[] = [
    { id: "home", href: hrefTo("/"), label: t("sync.nav.home"), Icon: Home },
    { id: "new", href: hrefTo("/visits/new"), label: t("sync.nav.newVisit"), Icon: PlusCircle },
    { id: "cards", href: hrefTo("/cards"), label: t("sync.nav.cards"), Icon: BookOpen },
    { id: "sync", href: hrefTo("/sync"), label: t("sync.nav.sync"), Icon: RefreshCw, testId: "nav-sync" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
          <div className="min-w-0">
            <p className="text-base font-bold tracking-wide text-ink-900">SAMVAAD</p>
            {account && <p className="truncate text-[13px] text-ink-600">{t("sync.chrome.account", { name: account.displayName })}</p>}
          </div>
          <FieldLanguageToggle />
          {reach === "online" && (
            <a href="/dashboard" className="inline-flex min-h-11 items-center text-[13px] font-medium text-teal-700 underline underline-offset-2">{t("sync.chrome.openOnline")}</a>
          )}
        </div>
      </header>

      <div className="no-print border-b border-line bg-ink-50" data-testid="status-bar" role="region" aria-label={t("sync.bar.label")}>
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px] text-ink-800">
          <span className="inline-flex items-center gap-1.5 font-medium" data-testid="conn-state">
            <conn.Icon size={15} aria-hidden />
            <span className="sr-only">{t("sync.conn.label")}: </span>
            {conn.text}
          </span>
          <span data-testid="pending-count">
            {pendingRecords > 0 ? tp("sync.bar.waiting", pendingRecords) : t("sync.bar.allSent")}
          </span>
          <span data-testid="last-sync">
            {summary?.lastSyncAt ? t("sync.bar.lastSync", { time: fmtDateTime(summary.lastSyncAt, locale) }) : t("sync.bar.neverSynced")}
          </span>
          <Button
            variant="secondary"
            className="ml-auto h-auto! min-h-11 py-2"
            data-testid="sync-now"
            disabled={f.syncing}
            onClick={() => void sync.run()}
          >
            {f.syncing ? <Loader2 size={15} aria-hidden className="motion-safe:animate-spin" /> : <RefreshCw size={15} aria-hidden />}
            {f.syncing ? t("sync.bar.syncing") : t("sync.bar.syncNow")}
          </Button>
        </div>
        <div role="status" aria-live="polite" data-testid="sync-result" className="mx-auto w-full max-w-2xl px-4 text-[13px] text-ink-800 empty:hidden [&:not(:empty)]:pb-2">{sync.message}</div>
      </div>

      <div className="no-print mx-auto w-full max-w-2xl space-y-2 px-4 pt-3 empty:hidden">
        {f.sw.updateReady && (
          <Banner tone="info" role="status" testId="update-banner" title={t("sync.update.title")} action={<Button variant="primary" className="h-auto! min-h-11 py-2" onClick={f.sw.applyUpdate}>{t("sync.update.apply")}</Button>}>
            {t("sync.update.body")}
          </Banner>
        )}
        {session === "expired" && (
          <Banner tone="error" role="alert" testId="session-banner" title={t("sync.session.title")} action={<a className={LINK} href="/login?next=/field">{t("sync.session.link")}</a>}>
            {t("sync.session.body")}
          </Banner>
        )}
        {lastReport?.status === "account_mismatch" && (
          <Banner tone="error" role="alert" testId="mismatch-banner" title={t("sync.mismatch.title")} action={<a className={LINK} href="/login?next=/field">{t("sync.session.link")}</a>}>
            {t("sync.mismatch.body", { name: account?.displayName ?? "" })}
          </Banner>
        )}
        {(summary?.needsAttention ?? 0) > 0 && (
          <Banner tone="warning" role="status" testId="attention-banner" action={<a className={LINK} href={hrefTo("/sync")}>{t("sync.attn.link")}</a>}>
            {tp("sync.attn.body", summary?.needsAttention ?? 0)}
          </Banner>
        )}
        {pct !== null && pct > 80 && (
          <Banner tone="warning" role="status" testId="storage-quota-banner">{t("sync.storageWarn.quota", { pct })}</Banner>
        )}
        {storage.supported && storage.persisted === false && (
          <Banner tone="warning" role="status" testId="storage-persist-banner">{t("sync.storageWarn.notPersistent")}</Banner>
        )}
        {!storage.supported && (
          <Banner tone="warning" role="status" testId="storage-unsupported-banner">{t("sync.storageWarn.unsupported")}</Banner>
        )}
      </div>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-4 outline-none">
        {children}
      </main>

      <nav aria-label={t("sync.nav.label")} className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {items.map(({ id, href, label, Icon, testId }) => {
            const active = id === current;
            return (
              <li key={id}>
                <a
                  href={href}
                  data-testid={testId}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-4 px-1 py-1 text-[12px] leading-tight",
                    active ? "border-ink-900 bg-ink-50 font-bold text-ink-900 underline underline-offset-4" : "border-transparent text-ink-700 hover:bg-ink-50",
                  )}
                >
                  <Icon size={20} aria-hidden />
                  <span className="text-center">{label}</span>
                  {id === "sync" && pendingRecords > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">
                      <span aria-hidden>{pendingRecords}</span>
                      <span className="sr-only">{t("sync.nav.waiting", { n: pendingRecords })}</span>
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
