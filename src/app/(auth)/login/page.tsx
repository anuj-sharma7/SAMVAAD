import { redirect } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { getActor } from "@/lib/server/context";
import { demoModeEnabled } from "@/lib/auth/session";
import { DEMO_USERS } from "@/lib/db/seed";
import { PersonaPicker } from "./persona-picker";
import { safeNext } from "@/lib/safe-next";
import { Notice } from "@/components/ui";
import { ToastProvider } from "@/components/toast";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/lib/i18n/server";
import { APP_RELEASE, apkSizeLabel } from "@/lib/app-release";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("login.metaTitle") };
}

const STEP_KEYS = ["common.step.plan", "common.step.observe", "common.step.coach", "common.step.demonstrate", "common.step.followup"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getActor()) redirect(next);
  const demo = demoModeEnabled();
  const { t, locale } = await getI18n();
  return (
    <ToastProvider>
      <main id="main" className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr]">
        <section className="relative order-last flex flex-col justify-between bg-ink-900 px-8 py-10 text-white sm:px-14 sm:py-14 lg:order-none">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <div>
              <p className="text-xl font-semibold leading-none tracking-tight">SAMVAAD</p>
              <p lang="hi" className="mt-1 text-xs text-ink-100/75">{t("login.tagline")}</p>
            </div>
          </div>
          <div className="my-8 max-w-xl lg:my-12">
            <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[34px] lg:text-[42px]">
              {t("login.hero")}
            </h1>
            <p className="mt-5 hidden text-[17px] leading-relaxed text-ink-100/85 lg:block">
              {t("login.intro")}
            </p>
            <ol className="mt-8 hidden flex-wrap gap-2 lg:flex" aria-label={t("login.workflowLabel")}>
              {STEP_KEYS.map((k, i) => (
                <li key={k} className="flex items-center gap-2 rounded-full border border-white/20 px-3.5 py-1.5 text-sm text-ink-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold">{i + 1}</span>
                  {t(k)}
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <a
                href={APP_RELEASE.url}
                download={APP_RELEASE.fileName}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Download size={18} aria-hidden />
                {t("login.downloadApp")}
              </a>
              <p className="mt-2 max-w-md text-[13px] text-ink-100/75">{t("login.downloadHint", { version: APP_RELEASE.version, size: apkSizeLabel() })}</p>
              <p className="mt-1 text-[13px]"><a href="/download" className="text-teal-100 underline hover:text-white">{t("login.downloadMore")}</a></p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-ink-100/75">
            {t("login.principle")}
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-12 sm:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-between gap-3">
              <a
                href={APP_RELEASE.url}
                download={APP_RELEASE.fileName}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                <Download size={16} aria-hidden />
                {t("login.downloadApp")}
              </a>
              <LanguageSwitcher tone="light" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h2>
            <p className="mt-1.5 text-ink-600">{t("login.subtitle")}</p>

            <Notice tone="warning" title={t("login.demoNoticeTitle")} className="mt-6">
              {t("login.demoNoticeBody")}
            </Notice>

            {demo ? (
              <PersonaPicker next={next} personas={DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, designation: u.designation }))} />
            ) : (
              <Notice tone="error" title={t("login.disabledTitle")} className="mt-6">
                {t("login.disabledBody")}
              </Notice>
            )}

            <p className="mt-8 flex items-start gap-2 text-[13px] text-ink-600">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
              {t("login.fictionalNote")}
            </p>
            {locale === "hi" && <p lang="hi" className="mt-3 text-[13px] text-ink-600">{t("common.language.draftNotice")}</p>}
          </div>
        </section>
      </main>
    </ToastProvider>
  );
}
