import { redirect } from "next/navigation";
import { BookOpenCheck, ShieldCheck } from "lucide-react";
import { getActor } from "@/lib/server/context";
import { demoModeEnabled } from "@/lib/auth/session";
import { DEMO_USERS } from "@/lib/db/seed";
import { PersonaPicker } from "./persona-picker";
import { Notice } from "@/components/ui";
import { ToastProvider } from "@/components/toast";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("login.metaTitle") };
}

const STEP_KEYS = ["common.step.plan", "common.step.observe", "common.step.coach", "common.step.demonstrate", "common.step.followup"];

export default async function LoginPage() {
  if (await getActor()) redirect("/dashboard");
  const demo = demoModeEnabled();
  const { t, locale } = await getI18n();
  return (
    <ToastProvider>
      <main id="main" className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr]">
        <section className="relative flex flex-col justify-between bg-ink-900 px-8 py-10 text-white sm:px-14 sm:py-14">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600"><BookOpenCheck size={22} aria-hidden /></span>
            <div>
              <p className="text-xl font-semibold leading-none tracking-tight">SAMVAAD</p>
              <p lang="hi" className="mt-1 text-xs text-ink-100/75">{t("login.tagline")}</p>
            </div>
          </div>
          <div className="my-12 max-w-xl">
            <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[42px]">
              {t("login.hero")}
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-100/85">
              {t("login.intro")}
            </p>
            <ol className="mt-8 flex flex-wrap gap-2" aria-label={t("login.workflowLabel")}>
              {STEP_KEYS.map((k, i) => (
                <li key={k} className="flex items-center gap-2 rounded-full border border-white/20 px-3.5 py-1.5 text-sm text-ink-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold">{i + 1}</span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
          <p className="max-w-xl text-sm text-ink-100/75">
            {t("login.principle")}
          </p>
        </section>

        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-6 flex justify-end"><LanguageSwitcher tone="light" /></div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h2>
            <p className="mt-1.5 text-ink-600">{t("login.subtitle")}</p>

            <Notice tone="warning" title={t("login.demoNoticeTitle")} className="mt-6">
              {t("login.demoNoticeBody")}
            </Notice>

            {demo ? (
              <PersonaPicker personas={DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, designation: u.designation }))} />
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
