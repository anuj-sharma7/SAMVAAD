import { requireActor } from "@/lib/server/context";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ReplayTourButton } from "@/components/first-run-tour";
import { Glossary } from "./glossary";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("help.meta.title") };
}

const STEPS = ["plan", "observe", "coach", "demonstrate", "followup"] as const;
const FAQ = ["noSource", "why", "save", "voice", "demo", "lang"] as const;

export default async function HelpPage() {
  await requireActor();
  const { t } = await getI18n();
  return (
    <div className="space-y-6">
      <PageHeader title={t("help.title")} description={t("help.intro")} actions={<ReplayTourButton />} />
      <p className="-mt-3 text-[13px] text-ink-600">{t("help.tour.replayHint")}</p>

      <Card>
        <CardHeader title={t("help.steps.heading")} />
        <ol className="divide-y divide-line">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 px-5 py-3.5">
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[13px] font-semibold text-white">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{t(`common.step.${s}`)}</h3>
                <p className="text-sm text-ink-700">{t(`help.steps.${s}`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title={t("help.faq.heading")} />
        <div className="divide-y divide-line">
          {FAQ.map((f) => (
            <details key={f} className="group px-5 py-3.5">
              <summary className="cursor-pointer font-medium marker:text-ink-600">{t(`help.faq.${f}.q`)}</summary>
              <p className="mt-2 text-sm text-ink-700">{t(`help.faq.${f}.a`)}</p>
            </details>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("help.glossary.heading")} />
        <div className="p-5"><Glossary /></div>
      </Card>
    </div>
  );
}
