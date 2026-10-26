import { requireActor } from "@/lib/server/context";
import { Sidebar } from "@/components/sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { ToastProvider } from "@/components/toast";
import { getI18n } from "@/lib/i18n/server";
import { FirstRunTour } from "@/components/first-run-tour";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const { t, locale } = await getI18n();
  return (
    <ToastProvider>
      <FirstRunTour />
      <Sidebar name={actor.displayName} role={actor.role} accountId={actor.id} />
      <div className="lg:pl-60">
        <DemoBanner />
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 py-6 outline-none sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="no-print mx-auto max-w-[1200px] px-4 pb-8 text-xs text-ink-600 sm:px-6">
          {t("common.footer")}
          {locale === "hi" && <p lang="hi" className="mt-1">{t("common.language.draftNotice")}</p>}
        </footer>
      </div>
    </ToastProvider>
  );
}
