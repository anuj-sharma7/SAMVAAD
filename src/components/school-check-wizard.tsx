"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import { ChoiceQuestion, QuestionWizard } from "@/components/choice-question";
import { VoiceHint } from "@/components/voice-input";
import { emptyAnswer } from "@/lib/guided";
import { CHECK_SECTIONS, EXTRA, NO_ISSUE, problemCount, sectionComplete, toggleCheckOption, type CheckAnswers } from "@/lib/school-check";

/**
 * The school check as one question per section: tap the problems seen (or "no problem"), add anything else in words or by voice,
 * then a closing free note. Shared by the online page and offline field mode; each supplies its own way of saving.
 */
export function SchoolCheckWizard({ initial, onSave, pending, notice }: {
  initial: CheckAnswers; onSave: (answers: CheckAnswers) => void; pending: boolean; notice?: ReactNode;
}) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<CheckAnswers>(initial);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  const answerOf = (id: string) => answers[id] ?? emptyAnswer();
  const change = (id: string, a: { ids: string[]; text: string }) => { setDirty(true); setAnswers((x) => ({ ...x, [id]: a })); };
  const n = problemCount(answers);

  const steps = [
    ...CHECK_SECTIONS.map((s) => ({
      key: s.id, required: true, canNext: sectionComplete(s.id, answers[s.id]),
      node: (
        <ChoiceQuestion
          name={`sc-${s.id}`} title={t(`check.s.${s.id}.title`)} hint={t(`check.s.${s.id}.hint`)}
          options={[{ id: NO_ISSUE, label: t("check.noIssue") }, ...s.options.map((o) => ({ id: o, label: t(`check.s.${s.id}.o.${o}`) }))]}
          multiple toggle={toggleCheckOption} value={answerOf(s.id)} onChange={(a) => change(s.id, a)}
          textMode="other" textLabel={t("check.otherText")}
        />
      ),
    })),
    {
      key: EXTRA, required: false, canNext: !pending,
      node: (
        <div className="space-y-4">
          <ChoiceQuestion
            name={`sc-${EXTRA}`} title={t("check.s.extra.title")} hint={t("check.s.extra.hint")} options={[]} multiple={false}
            value={answerOf(EXTRA)} onChange={(a) => change(EXTRA, { ids: [], text: a.text })}
            textMode="always" textLabel={t("check.s.extra.text")} textMax={600}
          />
          <p className="text-sm font-medium text-ink-700" data-testid="check-summary">
            {n > 0 ? t("check.summary", { n }) : t("check.summaryNone")}
          </p>
          {notice}
        </div>
      ),
    },
  ];

  return (
    <div className="p-5" data-testid="school-check">
      <QuestionWizard
        header={(
          <div className="space-y-2">
            <p className="text-sm text-ink-700">{t("check.intro")}</p>
            <VoiceHint />
          </div>
        )}
        steps={steps}
        finishLabel={pending ? t("common.saving") : t("check.finish")}
        onFinish={() => { setDirty(false); onSave(answers); }}
      />
    </div>
  );
}
