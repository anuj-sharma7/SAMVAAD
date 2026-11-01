"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, MessageCircleHeart, RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { checkCard, type CardText } from "@/lib/coach/checks";
import { Button, Card, CardHeader, Chip, SimulatedBadge } from "@/components/ui";
import type { CoachAdvice } from "@/lib/services/coaching";

/** Live wording check on the card the mentor is editing, plus on-demand advice for the conversation. Nothing here is saved or changes the card. */
export function CoachPanel({ feedbackId, card, lang }: { feedbackId: string; card: CardText; lang: "en" | "hi" }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const checks = checkCard(card);
  const weak = checks.filter((c) => !c.ok);

  async function ask() {
    const r = await run(() => api<CoachAdvice>("POST", `/feedback/${feedbackId}/coach-advice`, { ...card, language: lang }), { refresh: false });
    if (r) setAdvice(r);
  }

  return (
    <Card>
      <CardHeader title={t("feedback.coach.title")} description={t("feedback.coach.desc")} action={<MessageCircleHeart size={16} className="text-ink-500" aria-hidden />} />
      <div className="space-y-4 p-5">
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            {t("feedback.coach.checkTitle")}
            <Chip tone={weak.length === 0 ? "teal" : "amber"}>{weak.length === 0 ? t("feedback.coach.allClear") : t("feedback.coach.some", { n: weak.length, total: checks.length })}</Chip>
          </p>
          <ul className="space-y-1.5 text-[13px]" aria-live="polite">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {c.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-teal-700" aria-hidden /> : <CircleAlert size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />}
                <span className={c.ok ? "text-ink-600" : "text-ink-900"}>{c.ok ? t(`feedback.coach.ok.${c.id}`) : t(`feedback.coach.fix.${c.id}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <Button variant="secondary" size="sm" disabled={pending} onClick={() => void ask()}>
          {pending ? <><Loader2 size={14} className="animate-spin" aria-hidden /> {t("feedback.coach.getting")}</> : advice ? <><RefreshCw size={14} aria-hidden /> {t("feedback.coach.refresh")}</> : t("feedback.coach.get")}
        </Button>

        {advice && (
          <div className="space-y-3 rounded-lg bg-teal-50/60 p-4 text-sm" data-testid="coach-advice">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t("feedback.coach.adviceTitle")}</p>
              {advice.is_simulated && <SimulatedBadge />}
            </div>
            <Block title={t("feedback.coach.opening")} lang={lang}>{advice.opening_line}</Block>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("feedback.coach.tips")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5" lang={lang}>{advice.tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <Block title={t("feedback.coach.ifDisagrees")} lang={lang}>{advice.if_disagrees}</Block>
            <Block title={t("feedback.coach.closeWith")} lang={lang}>{advice.close_with}</Block>
            {advice.watch_outs.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("feedback.coach.watchOuts")}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5" lang={lang}>{advice.watch_outs.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            <p className="text-[12px] text-ink-600">{t("feedback.coach.note")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Block({ title, lang, children }: { title: string; lang: "en" | "hi"; children: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{title}</p>
      <p className="mt-1 leading-relaxed" lang={lang}>{children}</p>
    </div>
  );
}
