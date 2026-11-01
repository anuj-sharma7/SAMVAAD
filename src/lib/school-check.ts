/**
 * School check: tap-to-answer problem lists, one section per area of the school (children's learning, building, mid-day meal, toilets and
 * water, records, teachers, safety). Every section also takes "something else" in the mentor's own words, and the last step is a free
 * "anything else" note. These are the mentor's observations of conditions, not scores: nothing here is rated, ranked or compared.
 */
import { OTHER } from "./guided";

/** Option meaning "I checked this area and saw no problem". It is exclusive: choosing it clears the problems, and a problem clears it. */
export const NO_ISSUE = "ok";

/** Pseudo-section for the closing free-text note. */
export const EXTRA = "extra";

export interface CheckSection {
  /** i18n: `check.s.<id>.title`, `.hint`, and `check.s.<id>.o.<option>` for each option. */
  id: string;
  options: readonly string[];
}

export const CHECK_SECTIONS: readonly CheckSection[] = [
  { id: "learning", options: ["cantReadLetters", "cantReadWords", "cantReadParagraph", "cantDoNumbers", "cantDoSums", "cantWrite", "lowAttendance", "shy", "irregular"] },
  { id: "building", options: ["leakingRoof", "brokenWindows", "noFurniture", "noBoard", "darkRooms", "boundaryWall", "electricity", "noPlayground", "noLibrary"] },
  { id: "meal", options: ["notCooked", "lateServed", "quantityLow", "menuNotFollowed", "kitchenDirty", "noGas", "storageBad", "noHandwash", "noMenuBoard"] },
  { id: "toilets", options: ["noToilet", "toiletLocked", "toiletDirty", "noWaterToilet", "noGirlsToilet", "noDrinkingWater", "waterDirty", "noHandwashSoap", "noDustbin"] },
  { id: "records", options: ["attendanceNotUpdated", "noVisitRegister", "mealRegisterMissing", "stockRegisterMissing", "noStudentRecords", "noTeacherRegister", "udiseNotUpdated"] },
  { id: "teachers", options: ["teacherAbsent", "teacherLate", "notEnoughTeachers", "noTimetable", "notUsingTlm", "multigrade", "nonTeachingWork"] },
  { id: "safety", options: ["noFirstAid", "noFireSafety", "unsafeBuilding", "strayAnimals", "noSmcMeeting", "communityNotInvolved"] },
] as const;

export type CheckAnswers = Record<string, { ids: string[]; text: string }>;

/** All answerable section ids plus the closing note. */
export const CHECK_SECTION_IDS: readonly string[] = [...CHECK_SECTIONS.map((s) => s.id), EXTRA];

export function validOptionIds(sectionId: string): Set<string> {
  const s = CHECK_SECTIONS.find((x) => x.id === sectionId);
  return new Set(s ? [...s.options, NO_ISSUE, OTHER] : []);
}

/**
 * Toggling in a check section: "no problem" is exclusive. Picking it clears the problems; picking a problem clears it.
 * Everything else is multiple choice.
 */
export function toggleCheckOption(current: string[], id: string): string[] {
  if (id === NO_ISSUE) return current.includes(NO_ISSUE) ? [] : [NO_ISSUE];
  const without = current.filter((x) => x !== NO_ISSUE);
  return without.includes(id) ? without.filter((x) => x !== id) : [...without, id];
}

/** A section is done when the mentor chose something (even "no problem") or wrote something; the closing note is optional. */
export function sectionComplete(sectionId: string, a: { ids: string[]; text: string } | undefined): boolean {
  if (sectionId === EXTRA) return true;
  if (!a) return false;
  return a.ids.some((i) => i !== OTHER) || a.text.trim().length > 0;
}

/** Number of problem options chosen across all sections (the "no problem" option and free text are not counted). */
export function problemCount(answers: CheckAnswers): number {
  return CHECK_SECTIONS.reduce((n, s) => n + (answers[s.id]?.ids ?? []).filter((i) => i !== NO_ISSUE && i !== OTHER).length, 0);
}
