/** Display helpers for stored English visit values. The stored value never changes; only the label is translated. */
type T = (key: string, params?: Record<string, string | number>) => string;

export const SUBJECTS = ["Hindi", "English", "Mathematics", "EVS"] as const;
export const PURPOSES = ["Routine academic support visit", "Follow-up on a previous coaching commitment", "FLN practice observation", "New teacher support"] as const;

const PURPOSE_KEY: Record<string, string> = {
  "Routine academic support visit": "visits.purpose.routine",
  "Follow-up on a previous coaching commitment": "visits.purpose.followup",
  "FLN practice observation": "visits.purpose.fln",
  "New teacher support": "visits.purpose.newTeacher",
};

export const subjectLabel = (t: T, subject: string) => ((SUBJECTS as readonly string[]).includes(subject) ? t(`visits.subject.${subject}`) : subject);
export const purposeLabel = (t: T, purpose: string) => (PURPOSE_KEY[purpose] ? t(PURPOSE_KEY[purpose]) : purpose);
/** "Grade 2 · Hindi" in the active language. */
export const classLabel = (t: T, grade: number | string, subject: string) => `${t("visits.grade", { grade })} · ${subjectLabel(t, subject)}`;
