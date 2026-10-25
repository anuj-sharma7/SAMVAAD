/**
 * E2 - Observation tagger (rules baseline).
 *
 * Suggests rubric tags by matching rubric keywords against the observation text. It is a
 * transparent baseline, NOT a trained classifier: there is no measured accuracy, and
 * `matchStrength` is simply "how many distinct rubric keywords were found", never a probability.
 * Suggestions are stored as unconfirmed and only become part of the record when the mentor
 * confirms them.
 *
 * A provider-backed (LLM) tagger and a supervised classifier are future work; both would have to
 * implement the same `TagSuggester` shape.
 */
export interface RubricTag {
  code: string;
  domain: string;
  label: string;
  description: string;
  keywords: string[];
}

export interface TagSuggestion {
  code: string;
  matchStrength: number;
  matchedTerms: string[];
}

export type TagSuggester = (text: string, rubric: RubricTag[]) => TagSuggestion[];

/** Suggestions weaker than this are not shown (low-confidence tags stay hidden). */
export const MIN_MATCH_STRENGTH = 0.34;

export const normalise = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ");

export const suggestTagsByRules: TagSuggester = (text, rubric) => {
  const haystack = normalise(text);
  const out: TagSuggestion[] = [];
  for (const tag of rubric) {
    const matched = tag.keywords.filter((k) => haystack.includes(normalise(k)));
    if (matched.length === 0) continue;
    // Saturates at three distinct keywords; purely a ranking aid.
    const strength = Math.min(1, matched.length / 3);
    if (strength < MIN_MATCH_STRENGTH) continue;
    out.push({ code: tag.code, matchStrength: Number(strength.toFixed(2)), matchedTerms: matched });
  }
  return out.sort((a, b) => b.matchStrength - a.matchStrength).slice(0, 4);
};
