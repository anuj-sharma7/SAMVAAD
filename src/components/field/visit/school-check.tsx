"use client";

import { useRef, useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { SyncBadge } from "@/components/field/sync-badge";
import { SchoolCheckWizard } from "@/components/school-check-wizard";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import { problemCount, type CheckAnswers } from "@/lib/school-check";
import type { LocalSchoolCheck } from "@/lib/offline/types";
import { describeFailure, FailureNotice, SavedSlot, SyncProblem, type Failure } from "./shared";

/** Offline field mode: the school check works with no internet. It is saved on this device first and sent when the connection returns. */
export function FieldSchoolCheck({ visitId, check }: { visitId: string; check: LocalSchoolCheck | undefined }) {
  const { t } = useI18n();
  const { store } = useField();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const busy = useRef(false); // a double-tap must not save twice

  async function save(answers: CheckAnswers) {
    if (busy.current || !store) return;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      await store.saveSchoolCheck(visitId, answers);
      setOpen(false);
      setSavedAt(new Date()); // only now: the local save resolved
    } catch (err) {
      setFailure(describeFailure(t, err)); // the answers stay in the wizard
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const n = check ? problemCount(check.answers) : 0;
  return (
    <Card data-testid="field-school-check">
      <CardHeader title={t("check.openCard.title")} description={t("check.openCard.body")} />
      <div className="space-y-3 px-1 py-2">
        {open ? (
          <>
            <SchoolCheckWizard initial={check?.answers ?? {}} onSave={(a) => void save(a)} pending={saving} notice={<FailureNotice failure={failure} />} />
            <div className="px-5 pb-3"><Button variant="secondary" size="lg" onClick={() => setOpen(false)}>{t("common.cancel")}</Button></div>
          </>
        ) : (
          <div className="space-y-3 px-3 py-2">
            {check && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <SyncBadge state={check.sync.state} short />
                <span className="font-medium text-teal-700" data-testid="school-check-state">{n > 0 ? t("check.openCard.done", { n }) : t("check.openCard.doneNone")}</span>
              </div>
            )}
            {check && <SyncProblem sync={check.sync} />}
            <Button size="lg" variant={check ? "secondary" : "accent"} onClick={() => setOpen(true)} data-testid="school-check-open">
              {check ? t("check.openCard.edit") : t("check.openCard.open")}
            </Button>
            <SavedSlot at={savedAt} />
          </div>
        )}
      </div>
    </Card>
  );
}
