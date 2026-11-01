"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cn } from "./ui";
import { useI18n } from "@/lib/i18n/client";

/** Only a harmless "already seen" flag is stored in the browser, never anything about the visitor. */
const KEY = "samvaad.welcome.v1";
export const WELCOME_EVENT = "samvaad:open-welcome";
const STEPS = ["w1", "w2", "w3", "w4"] as const;

/**
 * A one-minute welcome for someone opening the website for the first time (before signing in). It opens once on its own, can be
 * skipped, and can be replayed from the sign-in page. Uses the native <dialog>, so the browser handles focus trapping and Escape.
 */
export function WelcomeTour() {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  const open = useCallback(() => {
    setStep(0);
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, [setStep]);
  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "seen"; } catch { /* ignore */ }
    const timer = seen ? undefined : setTimeout(open, 0);
    window.addEventListener(WELCOME_EVENT, open);
    return () => { clearTimeout(timer); window.removeEventListener(WELCOME_EVENT, open); };
  }, [open]);

  const id = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep(step + 1);
        if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
      }}
      onClose={() => { try { localStorage.setItem(KEY, "seen"); } catch { /* private mode: it just shows again next time */ } }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
      data-testid="welcome-tour"
    >
      <div className="space-y-4 p-6">
        <p className="text-[13px] font-medium text-ink-600">{t("login.welcome.title")} · {t("help.tour.stepOf", { n: step + 1, total: STEPS.length })}</p>
        <ol className="flex flex-wrap gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s} className={cn("h-2.5 rounded-full border transition-all", i === step ? "w-6 border-teal-700 bg-teal-700" : i < step ? "w-2.5 border-teal-700 bg-teal-700/60" : "w-2.5 border-ink-500 bg-white")} />
          ))}
        </ol>
        <h2 id="welcome-title" className="text-xl font-semibold tracking-tight">{t(`login.welcome.${id}.title`)}</h2>
        <p className="text-base leading-relaxed">{t(`login.welcome.${id}.body`)}</p>
        {last && <p className="text-sm"><Link href="/download" className="font-medium text-teal-700 underline">{t("login.welcome.app")}</Link></p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>{t("help.tour.skip")}</Button>
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>{t("common.back")}</Button>}
            {last ? <Button type="button" onClick={close}>{t("login.welcome.start")}</Button> : <Button type="button" onClick={() => setStep(step + 1)}>{t("common.next")}</Button>}
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function ReplayWelcomeButton() {
  const { t } = useI18n();
  return (
    <button type="button" className="min-h-11 text-sm font-medium text-teal-700 underline" onClick={() => window.dispatchEvent(new Event(WELCOME_EVENT))}>
      {t("login.welcome.replay")}
    </button>
  );
}
