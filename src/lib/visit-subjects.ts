/**
 * A visit can cover several subjects, or all of them ("survey all"). The first chosen subject stays the visit's main subject
 * (used for finding practice cards, reports and the offline app); the others are stored beside it.
 */
import { SUBJECTS, subjectLabel } from "./visit-labels";

type T = (key: string, params?: Record<string, string | number>) => string;

/** Marker option in a picker: "all subjects". It is only ever a UI value and is never stored. */
export const ALL_SUBJECTS = "__all";
const ALL: readonly string[] = SUBJECTS;

/** Keep only real subjects (no repeats) and make the "all" marker present exactly when every subject is chosen. */
export function normalizeSubjects(ids: readonly string[]): string[] {
  const real = [...new Set(ids.filter((i) => ALL.includes(i)))];
  return real.length === ALL.length ? [...real, ALL_SUBJECTS] : real;
}

/** Tapping a subject toggles it; tapping "all subjects" selects every subject, or clears them if all were already chosen. */
export function toggleSubject(current: readonly string[], id: string): string[] {
  if (id === ALL_SUBJECTS) return current.includes(ALL_SUBJECTS) ? [] : normalizeSubjects(ALL);
  const real = current.filter((i) => i !== ALL_SUBJECTS);
  return normalizeSubjects(real.includes(id) ? real.filter((i) => i !== id) : [...real, id]);
}

/** The main subject (first chosen) and the other chosen subjects. Falls back to Hindi when nothing is chosen. */
export function splitSubjects(ids: readonly string[]): { subject: string; extra: string[] } {
  const real = [...new Set(ids.filter((i) => ALL.includes(i)))];
  return real.length === 0 ? { subject: "Hindi", extra: [] } : { subject: real[0], extra: real.slice(1) };
}

/** Subjects of a stored visit: the main one first, then the extras. Tolerates a bad or missing JSON column. */
export function visitSubjects(subject: string, extraJson: string | null | undefined): string[] {
  let extra: unknown = [];
  try { extra = extraJson ? JSON.parse(extraJson) : []; } catch { extra = []; }
  const list = Array.isArray(extra) ? extra.filter((x): x is string => typeof x === "string" && ALL.includes(x)) : [];
  return [...new Set([subject, ...list])];
}

export const coversAllSubjects = (list: readonly string[]) => ALL.every((s) => list.includes(s));

/** "Hindi, English" for the chosen subjects, or "All subjects" when every subject is covered. */
export function subjectsLabel(t: T, subject: string, extraJson: string | null | undefined): string {
  const list = visitSubjects(subject, extraJson);
  return coversAllSubjects(list) ? t("visits.subject.all") : list.map((s) => subjectLabel(t, s)).join(", ");
}

/** "Grade 3 · Hindi, English" for a visit that covers several subjects. */
export const classSubjectsLabel = (t: T, grade: number | string, subject: string, extraJson: string | null | undefined) => `${t("visits.grade", { grade })} · ${subjectsLabel(t, subject, extraJson)}`;
