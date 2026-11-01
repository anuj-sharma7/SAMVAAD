import { describe, expect, it } from "vitest";
import { en, hi } from "@/lib/i18n/messages";
import {
  FOCUS_OPTIONS, OBSERVATION_QUESTIONS, OTHER, composeAnswer, composeObservation, emptyAnswer, hasAnswer, questionComplete, toggleChoice,
} from "@/lib/guided";
import { appendSpoken } from "@/components/voice-input";

const EN = en as Record<string, string>;
const HI = hi as Record<string, string>;

describe("composeAnswer", () => {
  const labels = { a: "Alpha", b: "Beta", c: "Gamma" };
  it("joins chosen labels in the order the options are listed, then the mentor's own words", () => {
    expect(composeAnswer(["a", "b", "c"], labels, { ids: ["c", "a"], text: " my own words " })).toBe("Alpha; Gamma; my own words");
  });
  it("ignores the 'something else' marker and empty text", () => {
    expect(composeAnswer(["a", "b"], labels, { ids: [OTHER, "b"], text: "  " })).toBe("Beta");
    expect(composeAnswer(["a", "b"], labels, emptyAnswer())).toBe("");
  });
  it("keeps typed text even when only 'something else' was chosen", () => {
    expect(composeAnswer(["a"], labels, { ids: [OTHER], text: "Group reading" })).toBe("Group reading");
  });
});

describe("toggleChoice", () => {
  it("single choice replaces, and tapping the chosen one again clears it", () => {
    expect(toggleChoice([], "a", false)).toEqual(["a"]);
    expect(toggleChoice(["a"], "b", false)).toEqual(["b"]);
    expect(toggleChoice(["a"], "a", false)).toEqual([]);
  });
  it("multiple choice adds and removes", () => {
    expect(toggleChoice(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleChoice(["a", "b"], "a", true)).toEqual(["b"]);
  });
});

describe("hasAnswer / questionComplete", () => {
  it("'something else' alone is not an answer until text is typed", () => {
    expect(hasAnswer({ ids: [OTHER], text: "" })).toBe(false);
    expect(hasAnswer({ ids: [OTHER], text: "x" })).toBe(true);
  });
  const evidence = OBSERVATION_QUESTIONS.find((q) => q.id === "evidence")!;
  const context = OBSERVATION_QUESTIONS.find((q) => q.id === "context")!;
  it("required questions need an answer; optional ones can be skipped", () => {
    expect(questionComplete(evidence, emptyAnswer())).toBe(false);
    expect(questionComplete(evidence, { ids: ["turns"], text: "" })).toBe(true);
    expect(questionComplete(context, emptyAnswer())).toBe(true);
  });
});

describe("observation questions", () => {
  it("fill exactly the five existing observation fields, once each", () => {
    expect(OBSERVATION_QUESTIONS.map((q) => q.field).sort()).toEqual(["context_note", "evidence", "improvement_area", "practice_observed", "worked_well"]);
  });
  it("practice and evidence are required (the server needs both); the rest are optional", () => {
    expect(OBSERVATION_QUESTIONS.filter((q) => q.required).map((q) => q.field).sort()).toEqual(["evidence", "practice_observed"]);
  });
  it("evidence always offers a text box, because choosing a starter is not a concrete example", () => {
    expect(OBSERVATION_QUESTIONS.find((q) => q.id === "evidence")!.text).toBe("always");
  });
  it("composes answers into the observation fields", () => {
    const labelOf = (q: { id: string }, o: string) => `${q.id}:${o}`;
    const out = composeObservation(labelOf, {
      practice: { ids: ["storyRead"], text: "" },
      evidence: { ids: ["turns", "waitTime"], text: "Asked why twice." },
      well: { ids: ["askedQ", "everyone"], text: "" },
      grow: { ids: [OTHER], text: "Use the chart" },
    });
    expect(out.practice_observed).toBe("practice:storyRead");
    expect(out.evidence).toBe("evidence:turns; evidence:waitTime; Asked why twice.");
    expect(out.worked_well).toBe("well:askedQ; well:everyone");
    expect(out.improvement_area).toBe("Use the chart");
    expect(out.context_note).toBe("");
  });

  const JUDGING = /\b(lazy|weak|bad|poor|incompetent|useless|careless|failed|fail)\b/i;
  const JUDGING_HI = /(आलसी|निकम्मा|नकारा|कमज़ोर|कमजोर|लापरवाह|अयोग्य|बेकार|खराब|ख़राब)/;
  for (const q of OBSERVATION_QUESTIONS) {
    for (const o of q.options) {
      const key = `observe.q.${q.id}.o.${o}`;
      it(`${key} exists in English and Hindi and describes practice without judging the person`, () => {
        expect(EN[key], `en ${key}`).toBeTruthy();
        expect(HI[key], `hi ${key}`).toBeTruthy();
        expect(EN[key]).not.toMatch(JUDGING);
        expect(HI[key]).not.toMatch(JUDGING_HI);
      });
    }
    it(`observe.q.${q.id} has a title, hint and text label in both languages`, () => {
      for (const part of ["title", "hint", "text"]) {
        expect(EN[`observe.q.${q.id}.${part}`], `en ${part}`).toBeTruthy();
        expect(HI[`observe.q.${q.id}.${part}`], `hi ${part}`).toBeTruthy();
      }
    });
  }
});

describe("visit focus options", () => {
  it("every option has English and Hindi text", () => {
    for (const o of FOCUS_OPTIONS) {
      expect(EN[`visits.q.focus.o.${o}`], o).toBeTruthy();
      expect(HI[`visits.q.focus.o.${o}`], o).toBeTruthy();
    }
  });
});

describe("appendSpoken", () => {
  it("adds speech after existing text with one space, or starts the field", () => {
    expect(appendSpoken("", "hello")).toBe("hello");
    expect(appendSpoken("Learners read  ", "in pairs")).toBe("Learners read in pairs");
  });
});
