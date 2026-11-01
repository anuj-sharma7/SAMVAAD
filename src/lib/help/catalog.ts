/**
 * Mentor Help: fixed lists used by the question generator, the mid-day meal / ground checks and the academic-problem tracker.
 * Stored values are English slugs; labels live in the `mhelp` i18n namespace.
 */

export const HELP_GRADES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const HELP_SUBJECTS = ["Hindi", "English", "Mathematics", "Science", "SocialScience", "Sanskrit"] as const;
export type HelpSubject = (typeof HELP_SUBJECTS)[number];

/** Social Science and Sanskrit start in class 3; classes 1 and 2 use Hindi, English, Maths and Science (EVS-style). */
export function subjectsForGrade(grade: number): HelpSubject[] {
  return HELP_SUBJECTS.filter((s) => grade >= 3 || (s !== "SocialScience" && s !== "Sanskrit"));
}

export type Band = "1-2" | "3-5" | "6-8";
export const bandOf = (grade: number): Band => (grade <= 2 ? "1-2" : grade <= 5 ? "3-5" : "6-8");

export const MEAL_TOPICS = ["menu", "kitchen", "storage", "serving", "records", "community"] as const;
export const GROUND_TOPICS = ["building", "playground", "toilets", "water", "classrooms"] as const;
export type MealTopic = (typeof MEAL_TOPICS)[number];
export type GroundTopic = (typeof GROUND_TOPICS)[number];

export const SESSION_KINDS = ["subject", "meal", "ground"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** Who the mentor puts a question to. */
export const ASK_WHO = ["students", "cook", "teacher", "head", "smc"] as const;
export type AskWho = (typeof ASK_WHO)[number];

/** How a question went, tapped by the mentor. Describes the answers heard, never a score for a named child or teacher. */
export const OUTCOMES = ["good", "some", "weak"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ISSUE_CATEGORIES = ["reading", "writing", "numeracy", "attendance", "material", "teaching", "assessment", "language", "other"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export function validTopic(kind: SessionKind, topic: string | null | undefined): boolean {
  if (kind === "subject") return topic == null || topic === "";
  const list: readonly string[] = kind === "meal" ? MEAL_TOPICS : GROUND_TOPICS;
  return !!topic && list.includes(topic);
}
