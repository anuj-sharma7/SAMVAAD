"use client";

import { CheckCircle2 } from "lucide-react";
import { ZodError } from "zod";
import { Notice } from "@/components/ui";
import { SyncBadge } from "@/components/field/sync-badge";
import { useI18n } from "@/lib/i18n/client";
import { fmtTime } from "@/lib/format";
import { LocalConflictError, LocalRuleError } from "@/lib/offline/store";
import { StorageError, type SyncMeta } from "@/lib/offline/types";
import { fieldErrors } from "@/lib/offline/validation";
import { hrefTo } from "@/lib/offline/use-hash-route";

type T = (key: string, params?: Record<string, string | number>) => string;

const FIELD_CODES = new Set(["choose_school", "alias_required", "alias_chars", "date_invalid", "date_range", "purpose_required", "practice_required", "evidence_required", "action_required"]);
const RULE_CODES = new Set([
  "visit_not_observable", "visit_not_started", "invalid_transition", "no_observations", "commitment_exists", "target_before_visit",
  "target_too_far", "visit_locked", "unknown_school", "not_found", "commitment_locked",
]);
/** Rule errors that belong to one input rather than to the whole form. */
const RULE_FIELD: Record<string, string> = { target_before_visit: "target_date", target_too_far: "target_date", unknown_school: "school_id" };
const STORAGE_KINDS = new Set(["quota", "unavailable", "migration", "corrupt"]);
const SYNC_CODES = new Set(["network", "rate_limited", "bad_request", "server_error", "no_answer", "stale_edit", "rejected"]);

export interface Failure {
  /** input name → plain message */
  fields: Record<string, string>;
  message: string | null;
  conflict: boolean;
  storage: boolean;
}

/** Turns anything the local store can throw into plain words (never raw error text). */
export function describeFailure(t: T, err: unknown): Failure {
  const base: Failure = { fields: {}, message: null, conflict: false, storage: false };
  if (err instanceof ZodError || (err as { name?: string } | null)?.name === "ZodError") {
    const raw = fieldErrors(err as ZodError);
    for (const [k, code] of Object.entries(raw)) base.fields[k] = FIELD_CODES.has(code) ? t(`field.err.${code}`) : t("field.err.invalid");
    base.message = t("field.err.fixFields");
    return base;
  }
  if (err instanceof LocalConflictError) return { ...base, conflict: true, message: t("field.err.conflict") };
  if (err instanceof LocalRuleError) {
    const text = t(RULE_CODES.has(err.code) ? `field.rule.${err.code}` : "field.err.unknown");
    const f = RULE_FIELD[err.code];
    if (f) return { ...base, fields: { [f]: text }, message: t("field.err.fixFields") };
    return { ...base, message: text };
  }
  if (err instanceof StorageError) return { ...base, storage: true, message: t(STORAGE_KINDS.has(err.kind) ? `field.storage.${err.kind}` : "field.storage.unavailable") };
  return { ...base, message: t("field.err.unknown") };
}

/** The "Not saved" state. Role alert: it is announced at once. What the user typed is always kept. */
export function FailureNotice({ failure, id }: { failure: Failure | null; id?: string }) {
  const { t } = useI18n();
  if (!failure?.message) return null;
  return (
    <div id={id} role="alert" data-testid="not-saved" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <SyncBadge state="notSaved" />
      <p className="mt-2 font-medium">{failure.message}</p>
      <p className="mt-1">{failure.storage ? t("field.storage.keep") : t("field.err.keep")}</p>
      {failure.conflict && (
        <p className="mt-2"><a className="inline-flex min-h-11 items-center font-medium underline" href={hrefTo("/sync")}>{t("field.openSync")}</a></p>
      )}
    </div>
  );
}

/** Always-mounted polite live region: the note appears (and is announced) only after the local save promise resolved. */
export function SavedSlot({ at }: { at: Date | null }) {
  const { t, locale } = useI18n();
  return (
    <div aria-live="polite">
      {at && (
        <p key={at.getTime()} data-testid="local-save-note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t("field.saved.note", { time: fmtTime(at, locale) })}</span>
        </p>
      )}
    </div>
  );
}

/** Plain reason when the last attempt to send a record failed or it is in conflict, with a way to the Sync Center. */
export function SyncProblem({ sync, className }: { sync: SyncMeta; className?: string }) {
  const { t } = useI18n();
  if (sync.state !== "failed" && sync.state !== "conflict") return null;
  const code = sync.errorCode ?? "";
  const reason = sync.state === "conflict" ? t("field.syncProblem.conflict") : t(SYNC_CODES.has(code) ? `field.syncErr.${code}` : "field.syncErr.unknown");
  return (
    <Notice tone="warning" title={t(sync.state === "conflict" ? "sync.state.conflict" : "sync.state.failed")} className={className}>
      <p>{reason}</p>
      <p className="mt-1">{t("field.syncProblem.kept")}</p>
      <a className="mt-1 inline-flex min-h-11 items-center font-medium underline" href={hrefTo("/sync")}>{t("field.openSync")}</a>
    </Notice>
  );
}

/** aria-describedby for an input: its error, else its hint. */
export const describedBy = (id: string, hasError: boolean, hasHint: boolean) => (hasError ? `${id}-err` : hasHint ? `${id}-hint` : undefined);

// ---- dates (local calendar days) ------------------------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDateTimeInput = (d: Date) => `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Whole days from today (device calendar) to a YYYY-MM-DD date: negative = overdue. */
export function daysFromToday(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}
/** "today", "tomorrow", "in 3 days", "2 days ago" in the active language. */
export function dueText(tr: { t: T; tp: (key: string, n: number) => string }, days: number): string {
  if (days === 0) return tr.t("common.rel.today");
  if (days === 1) return tr.t("common.rel.tomorrow");
  if (days === -1) return tr.t("common.rel.yesterday");
  return days > 0 ? tr.tp("common.rel.in", days) : tr.tp("common.rel.ago", -days);
}
/** Visit dates only carry the calendar day for a next step: format YYYY-MM-DD without time zone shifts. */
export const dayOnly = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00+05:30`);
