/**
 * Guided questions: tap-to-answer prompts that fill the SAME fields the plain forms already use. They add no new stored data, no
 * scoring and no ranking: the mentor's chosen options are turned into ordinary text that they can still edit before saving.
 */

/** Id of the "something else" choice; selecting it reveals a text box (with voice) for the mentor's own words. */
export const OTHER = "__other";

export interface Answer { ids: string[]; text: string }
export const emptyAnswer = (): Answer => ({ ids: [], text: "" });

/**
 * Turns an answer into plain text: the labels of the chosen options (in the order the options are listed), then the mentor's own words.
 * `labels` maps option id -> display label in the mentor's language.
 */
export function composeAnswer(optionOrder: readonly string[], labels: Record<string, string>, a: Answer): string {
  const chosen = optionOrder.filter((id) => a.ids.includes(id) && id !== OTHER).map((id) => labels[id]).filter(Boolean);
  const own = a.text.trim();
  return [...chosen, ...(own ? [own] : [])].join("; ");
}

export const hasAnswer = (a: Answer): boolean => a.ids.some((i) => i !== OTHER) || a.text.trim().length > 0;

/** Toggles an option: single choice replaces the selection, multiple choice adds/removes it. */
export function toggleChoice(current: string[], id: string, multiple: boolean): string[] {
  if (!multiple) return current.length === 1 && current[0] === id ? [] : [id];
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}

// ---- Observation questions ------------------------------------------------------------------------------------------

export type ObservationField = "practice_observed" | "evidence" | "worked_well" | "improvement_area" | "context_note";

export interface Question {
  /** i18n stem: `observe.q.<id>.title`, `.hint`, and `observe.q.<id>.o.<option>` for each option. */
  id: string;
  field: ObservationField;
  options: readonly string[];
  multiple: boolean;
  /** "always": the text box is always shown (evidence needs a real example). "other": shown only when "something else" is chosen. */
  text: "always" | "other";
  required: boolean;
}

/**
 * One question per field. Evidence is the only one that cannot be answered by choosing alone: the options are sentence starters and the
 * mentor must still add a real example, in their own words or by voice.
 */
export const OBSERVATION_QUESTIONS: readonly Question[] = [
  { id: "practice", field: "practice_observed", options: ["storyRead", "pairsRead", "numberAct", "letterAct", "discussion", "writing"], multiple: false, text: "other", required: true },
  { id: "evidence", field: "evidence", options: ["turns", "waitTime", "chart", "teacherOnly", "learnersAnswered"], multiple: true, text: "always", required: true },
  { id: "well", field: "worked_well", options: ["askedQ", "gaveTime", "everyone", "material", "encouraged"], multiple: true, text: "other", required: false },
  { id: "grow", field: "improvement_area", options: ["moreVoices", "waitTime", "selfThink", "material", "levels"], multiple: false, text: "other", required: false },
  { id: "context", field: "context_note", options: ["whole", "groups", "pairs", "individual"], multiple: false, text: "other", required: false },
];

export type ObservationValues = Record<ObservationField, string>;

/** True when the question has enough to move on (optional questions can always be skipped). */
export function questionComplete(q: Question, a: Answer): boolean {
  return !q.required || hasAnswer(a);
}

export function composeObservation(labelOf: (q: Question, option: string) => string, answers: Record<string, Answer>): ObservationValues {
  const out = { practice_observed: "", evidence: "", worked_well: "", improvement_area: "", context_note: "" } as ObservationValues;
  for (const q of OBSERVATION_QUESTIONS) {
    const labels = Object.fromEntries(q.options.map((o) => [o, labelOf(q, o)]));
    out[q.field] = composeAnswer(q.options, labels, answers[q.id] ?? emptyAnswer());
  }
  return out;
}

// ---- Visit planning ---------------------------------------------------------------------------------------------------

/** Coaching-focus quick picks for the visit plan (i18n: `visits.q.focus.o.<id>`). The mentor can still type or speak their own. */
export const FOCUS_OPTIONS = ["comprehension", "letters", "numbers", "waitTime", "participation"] as const;
