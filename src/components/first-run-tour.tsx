"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { useI18n } from "@/lib/i18n/client";
import { stepsFor } from "@/lib/tour";
import type { Role } from "@/lib/types";

/** Only a harmless "already seen" flag is stored in the browser, never any visit or school data. */
const KEY = "samvaad.tour.v1";
export const TOUR_EVENT = "samvaad:open-tour";

/**
 * Short, skippable walkthrough shown once to a new user and replayable from Help. Uses the native <dialog> element, so the
 * browser provides the focus trap, Escape handling and focus return.
 */
export function FirstRunTour({ role }: { role: Role }) {
  const { t } = useI18n();
  const steps = stepsFor(role);
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setStep(0);
    setIsOpen(true);
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, [setStep, setIsOpen]);
  const close = useCallback(() => {
    try { localStorage.setItem(KEY, "seen"); } catch { /* private mode: the tour just shows again next time */ }
    ref.current?.close();
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "seen"; } catch { /* ignore */ }
    const timer = seen ? undefined : setTimeout(open, 0); // deferred: state is set from a callback, not synchronously in the effect
    window.addEventListener(TOUR_EVENT, open);
    return () => { clearTimeout(timer); window.removeEventListener(TOUR_EVENT, open); };
  }, [open]);

  // When a step talks about a menu item, ring that item (on a wide screen where the menu is visible; on a phone it is in a closed drawer).
  const target = steps[step].target;
  useEffect(() => {
    if (!isOpen || !target) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find((e) => e.offsetParent !== null);
    if (!el) return;
    el.setAttribute("data-tour-active", "true");
    el.scrollIntoView({ block: "nearest" });
    return () => el.removeAttribute("data-tour-active");
  }, [isOpen, target]);

  const id = steps[step].id;
  const last = step === steps.length - 1;
  return (
    <dialog
      ref={ref}
      aria-labelledby="tour-title"
      onClose={() => { setIsOpen(false); try { localStorage.setItem(KEY, "seen"); } catch { /* ignore */ } }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
    >
      <div className="space-y-4 p-6">
        <p className="text-[13px] font-medium text-ink-600">{t("help.tour.title")} · {t("help.tour.stepOf", { n: step + 1, total: steps.length })}</p>
        <h2 id="tour-title" className="text-xl font-semibold tracking-tight">{t(`help.tour.${id}.title`)}</h2>
        <p className="text-base leading-relaxed">{t(`help.tour.${id}.body`)}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>{t("help.tour.skip")}</Button>
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>{t("common.back")}</Button>}
            {last ? <Button type="button" onClick={close}>{t("help.tour.start")}</Button> : <Button type="button" onClick={() => setStep(step + 1)}>{t("common.next")}</Button>}
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function ReplayTourButton() {
  const { t } = useI18n();
  return (
    <Button type="button" variant="secondary" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
      {t("help.tour.replay")}
    </Button>
  );
}
