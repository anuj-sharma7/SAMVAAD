"use client";

import { useI18n } from "@/lib/i18n/client";
import { CHECK_SECTIONS, EXTRA, NO_ISSUE, problemCount, type CheckAnswers } from "@/lib/school-check";

/**
 * Read-only view of a school check, used in the report (server snapshot) and in the offline draft report. Only sections the mentor
 * filled are shown; labels follow the interface language. There is no score: the count is just how many problems were ticked.
 */
export function SchoolCheckSummary({ answers }: { answers: CheckAnswers }) {
  const { t } = useI18n();
  const filled = CHECK_SECTIONS.filter((s) => (answers[s.id]?.ids.length ?? 0) > 0 || answers[s.id]?.text);
  const note = answers[EXTRA]?.text;
  if (filled.length === 0 && !note) return <p className="text-sm text-ink-600">{t("check.report.none")}</p>;
  const n = problemCount(answers);
  return (
    <div className="space-y-3 text-sm" data-testid="school-check-summary">
      <p className="text-[13px] text-ink-600">{n > 0 ? t("check.report.counts", { n }) : t("check.report.countsNone")}</p>
      <dl className="space-y-2">
        {filled.map((s) => {
          const a = answers[s.id];
          const picked = s.options.filter((o) => a.ids.includes(o));
          const clear = a.ids.includes(NO_ISSUE) && picked.length === 0 && !a.text;
          return (
            <div key={s.id} className="break-inside-avoid">
              <dt className="font-medium text-ink-900">{t(`check.sec.${s.id}`)}</dt>
              <dd>
                {clear && <span className="text-ink-700">{t("check.report.noProblem")}</span>}
                {(picked.length > 0 || a.text) && (
                  <ul className="list-disc pl-5 text-ink-800">
                    {picked.map((o) => <li key={o}>{t(`check.s.${s.id}.o.${o}`)}</li>)}
                    {a.text && <li className="[overflow-wrap:anywhere]">{a.text}</li>}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {note && <p className="[overflow-wrap:anywhere]"><span className="font-medium text-ink-900">{t("check.report.note")}:</span> {note}</p>}
    </div>
  );
}

