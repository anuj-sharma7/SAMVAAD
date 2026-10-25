import { INTL_TAG, type Locale } from "./i18n/config";
import type { Translator } from "./i18n/translate";

type Kind = "date" | "time" | "day" | "num";
const OPTS: Record<Kind, Intl.DateTimeFormatOptions | Intl.NumberFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" },
  time: { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" },
  day: { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" },
  num: {},
};
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function dt(kind: Exclude<Kind, "num">, locale: Locale): Intl.DateTimeFormat {
  const k = kind + locale;
  if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(INTL_TAG[locale], OPTS[kind] as Intl.DateTimeFormatOptions));
  return cache.get(k) as Intl.DateTimeFormat;
}

/** Dates are stored as UTC ISO strings and shown in India time in the active interface language. */
export const fmtDate = (d: string | Date | null | undefined, locale: Locale = "en") => (d ? dt("date", locale).format(new Date(d)) : "—");
export const fmtTime = (d: string | Date, locale: Locale = "en") => dt("time", locale).format(new Date(d));
export const fmtDay = (d: string | Date, locale: Locale = "en") => dt("day", locale).format(new Date(d));
export const fmtDateTime = (d: string | Date, locale: Locale = "en") => `${fmtDate(d, locale)}, ${fmtTime(d, locale)}`;
export function fmtNumber(n: number, locale: Locale = "en", opts?: Intl.NumberFormatOptions): string {
  const k = `num${locale}${JSON.stringify(opts ?? {})}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(INTL_TAG[locale], opts));
  return (cache.get(k) as Intl.NumberFormat).format(n);
}

/** "3 days ago", "in 2 days", "today" (English only; prefer relativeDaysT in UI code). */
export function relativeDays(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return "never";
  const days = Math.round((new Date(d).getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Same as relativeDays but translated and pluralised for the active language. */
export function relativeDaysT(d: string | Date | null | undefined, tr: Translator, now = new Date()): string {
  if (!d) return tr.t("common.rel.never");
  const days = Math.round((new Date(d).getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return tr.t("common.rel.today");
  if (days === 1) return tr.t("common.rel.tomorrow");
  if (days === -1) return tr.t("common.rel.yesterday");
  return days > 0 ? tr.tp("common.rel.in", days) : tr.tp("common.rel.ago", -days);
}

/** Translation keys for status/outcome/role/audit labels (see messages/en/common.ts). */
export const visitStatusKey = (s: string) => `common.status.visit.${s}`;
export const commitmentStatusKey = (s: string) => `common.status.commitment.${s}`;
export const feedbackStatusKey = (s: string) => `common.status.feedback.${s}`;
export const outcomeKey = (s: string) => `common.outcome.${s}`;
export const roleKey = (s: string) => `common.role.${s}`;
export const auditKey = (a: string) => (a in AUDIT_LABEL ? `common.audit.${a}` : "common.audit.unknown");

export const VISIT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In progress",
  pending_review: "Pending review",
  completed: "Completed",
};

export const COMMITMENT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  due_soon: "Due soon",
  overdue: "Overdue",
  completed: "Marked done",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
};

export const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  draft: "Draft · needs your review",
  edited: "Edited · needs approval",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Replaced",
  insufficient_evidence: "Insufficient approved evidence",
};

export const OUTCOME_LABEL: Record<string, string> = {
  tried_working: "Tried, and working",
  tried_needs_support: "Tried, needs more support",
  not_tried: "Not yet tried",
};

export const ROLE_LABEL: Record<string, string> = {
  mentor: "Mentor",
  supervisor: "Supervisor",
  diet_admin: "DIET library administrator",
};

/** Human wording for audit actions in the activity timeline. */
export const AUDIT_LABEL: Record<string, string> = {
  "visit.created": "Visit created",
  "visit.updated": "Visit updated",
  "visit.transitioned": "Visit status changed",
  "observation.added": "Observation added",
  "observation.updated": "Observation edited",
  "observation_tag.confirmed": "Tag confirmed",
  "observation_tag.suggested": "Tags suggested",
  "feedback.generated": "Feedback drafted",
  "feedback.edited": "Feedback edited",
  "feedback.approved": "Feedback approved",
  "feedback.rejected": "Feedback rejected",
  "feedback.insufficient_evidence": "No approved source found",
  "demonstration.generated": "Demonstration drafted",
  "demonstration.approved": "Demonstration approved",
  "commitment.created": "Commitment agreed",
  "commitment.updated": "Commitment updated",
  "commitment.reviewed": "Commitment reviewed",
  "report.generated": "Report prepared",
  "report.finalized": "Report finalized",
  "session.sign_in": "Signed in",
};
