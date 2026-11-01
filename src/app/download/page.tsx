import Link from "next/link";
import { CheckCircle2, Download, Globe2, Info, ShieldAlert, Smartphone } from "lucide-react";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider } from "@/components/toast";
import { Card, Chip, Notice } from "@/components/ui";
import { APP_RELEASE, apkSizeLabel } from "@/lib/app-release";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("download.metaTitle") };
}

/** Public page: the latest Android build, its checksum and install steps. No sign-in needed. */
export default async function DownloadPage() {
  const { t, locale } = await getI18n();
  const date = new Date(APP_RELEASE.builtOn + "T00:00:00Z").toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const steps = ["download.step1", "download.step2", "download.step3", "download.step4"];
  return (
    <ToastProvider>
      <main id="main" className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/login" className="flex items-center gap-3">
            <Logo size={44} />
            <span className="text-xl font-semibold tracking-tight">SAMVAAD</span>
          </Link>
          <LanguageSwitcher tone="light" />
        </header>

        <h1 className="text-[28px] font-semibold tracking-tight">{t("download.title")}</h1>
        <p className="mt-1.5 text-ink-600">{t("download.subtitle", { android: APP_RELEASE.minAndroid })}</p>

        <Card className="mt-6 space-y-4 p-6" data-testid="latest-release">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="teal"><CheckCircle2 size={12} aria-hidden /> {t("download.latest")}</Chip>
            <Chip>{t("download.version", { version: APP_RELEASE.version })}</Chip>
            <Chip tone="amber">{t("download.channel." + APP_RELEASE.channel)}</Chip>
          </div>
          <p className="text-sm text-ink-600">{t("download.builtOn", { date })} · {t("download.size", { size: apkSizeLabel() })}</p>
          <a
            href={APP_RELEASE.url}
            download={APP_RELEASE.fileName}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-700 px-6 text-base font-semibold text-white hover:bg-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <Download size={20} aria-hidden /> {t("download.button", { version: APP_RELEASE.version })}
          </a>
          <div>
            <p className="text-sm font-medium">{t("download.checksum")}</p>
            <code className="mt-1 block break-all rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-800" data-testid="release-sha">{APP_RELEASE.sha256}</code>
            <p className="mt-1 text-[13px] text-ink-600">{t("download.checksumHint")}</p>
          </div>
        </Card>

        <section className="mt-8" aria-labelledby="install-title">
          <h2 id="install-title" className="flex items-center gap-2 text-lg font-semibold"><Smartphone size={18} aria-hidden /> {t("download.installTitle")}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-[15px]">
            {steps.map((k) => <li key={k}>{t(k)}</li>)}
          </ol>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{t("download.inTitle")}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              {["download.in1", "download.in2", "download.in3"].map((k) => <li key={k}>{t(k)}</li>)}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{t("download.notTitle")}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              {["download.not1", "download.not2"].map((k) => <li key={k}>{t(k)}</li>)}
            </ul>
          </Card>
        </div>

        <Notice tone="warning" title={t("download.honestTitle")} className="mt-6">
          <span className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {t("download.honest")}</span>
        </Notice>

        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
            <div>
              <h2 className="text-[15px] font-semibold">{t("download.webTitle")}</h2>
              <p className="text-sm text-ink-600">{t("download.web")}</p>
            </div>
          </div>
          <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-sm font-medium hover:bg-ink-50">
            <Globe2 size={16} aria-hidden /> {t("download.openWeb")}
          </Link>
        </Card>

        <p className="mt-8 text-sm"><Link href="/login" className="underline">{t("download.back")}</Link></p>
      </main>
    </ToastProvider>
  );
}
