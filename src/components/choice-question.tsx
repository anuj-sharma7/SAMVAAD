"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { OTHER, toggleChoice, type Answer } from "@/lib/guided";
import { Textarea } from "./forms";
import { Button, cn } from "./ui";
import { VoiceButton, appendSpoken } from "./voice-input";

/**
 * One basic question with big tap-to-choose answers. Choosing is a real radio group (single) or checkbox group (multiple), so it works
 * with keyboard and screen readers. Whatever the options do not cover can be typed or spoken in the text box.
 */
export function ChoiceQuestion({
  name, title, hint, options, multiple, value, onChange, textMode, textLabel, textPlaceholder, textMax = 600, toggle,
}: {
  name: string; title: string; hint?: string; options: { id: string; label: string }[]; multiple: boolean;
  value: Answer; onChange: (a: Answer) => void;
  /** "always": text box always visible; "other": appears when "Something else" is chosen; "none": choices only (school, class, subject…). */
  textMode: "always" | "other" | "none"; textLabel?: string; textPlaceholder?: string; textMax?: number;
  /** Optional custom toggle rule (for example an exclusive "no problem" option). Default: toggleChoice. */
  toggle?: (current: string[], id: string) => string[];
}) {
  const { t } = useI18n();
  const all = textMode === "other" ? [...options, { id: OTHER, label: t("common.guided.other") }] : options;
  const showText = textMode === "always" || (textMode === "other" && value.ids.includes(OTHER));
  const type = multiple ? "checkbox" : "radio";
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold leading-snug text-ink-900">{title}</legend>
      {hint && <p className="text-sm text-ink-600">{hint}</p>}
      <div className="grid gap-2.5">
        {all.map((o) => {
          const checked = value.ids.includes(o.id);
          return (
            <label key={o.id} className="block cursor-pointer">
              <input
                type={type} name={name} value={o.id} checked={checked} className="peer sr-only"
                onChange={() => onChange({ ...value, ids: toggle ? toggle(value.ids, o.id) : toggleChoice(value.ids, o.id, multiple) })}
              />
              <span className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-base text-ink-900 transition-colors",
                "hover:bg-ink-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700",
                "peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:font-medium",
              )}>
                <span aria-hidden className={cn("flex h-6 w-6 shrink-0 items-center justify-center border-2", multiple ? "rounded-md" : "rounded-full", checked ? "border-teal-700 bg-teal-700 text-white" : "border-ink-500")}>
                  {checked && <Check size={15} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">{o.label}</span>
              </span>
            </label>
          );
        })}
      </div>
      {showText && (
        <div className="space-y-2 pt-1">
          <label htmlFor={`${name}-text`} className="block text-sm font-medium text-ink-900">{textLabel ?? t("common.guided.other")}</label>
          <Textarea id={`${name}-text`} value={value.text} maxLength={textMax} placeholder={textPlaceholder} className="min-h-[96px] text-base"
            onChange={(e) => onChange({ ...value, text: e.target.value })} />
          <VoiceButton onText={(s) => onChange({ ...value, text: appendSpoken(value.text, s) })} />
        </div>
      )}
    </fieldset>
  );
}

export interface WizardStep { key: string; node: ReactNode; canNext: boolean; required: boolean }

/** Shows one question at a time with progress, Back and Next. The last step's button runs `onFinish`. */
export function QuestionWizard({ steps, onFinish, finishLabel, header }: { steps: WizardStep[]; onFinish: () => void; finishLabel: string; header?: ReactNode }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => { if (moved.current) box.current?.focus({ preventScroll: false }); }, [i]); // move focus to the new question for screen-reader and keyboard users

  function go(n: number) { moved.current = true; setI(n); }
  return (
    <div className="space-y-5">
      {header}
      <div>
        <div className="flex items-center justify-between text-sm font-medium text-ink-700">
          <span data-testid="wizard-progress">{t("common.guided.progress", { n: i + 1, total: steps.length })}</span>
          {!step.required && <span className="text-ink-600">{t("common.optional")}</span>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={t("common.guided.progressLabel")}>
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <div ref={box} tabIndex={-1} className="outline-none" aria-live="polite">{step.node}</div>
      <div className="flex items-center justify-between gap-3 pt-1">
        {i > 0 ? <Button variant="secondary" size="lg" onClick={() => go(i - 1)}><ArrowLeft size={17} aria-hidden /> {t("common.back")}</Button> : <span />}
        <Button variant="accent" size="lg" disabled={!step.canNext} onClick={() => (last ? onFinish() : go(i + 1))}>
          {last ? finishLabel : t("common.next")} <ArrowRight size={17} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
