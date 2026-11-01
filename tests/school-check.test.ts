import { describe, expect, it } from "vitest";
import { all } from "@/lib/db/client";
import { asha, freshDb, rakesh } from "./helpers";
import { listVisits, transitionVisit } from "@/lib/services/visits";
import { getSchoolCheck, saveSchoolCheck } from "@/lib/services/school-check";
import { CHECK_SECTIONS, NO_ISSUE, problemCount, sectionComplete, toggleCheckOption, validOptionIds } from "@/lib/school-check";
import { OTHER } from "@/lib/guided";
import { en, hi } from "@/lib/i18n/messages";

function startedVisit() {
  const db = freshDb();
  const me = asha(db);
  const planned = listVisits(db, me, { status: "planned" }).items[0];
  transitionVisit(db, me, planned.id, "in_progress");
  return { db, me, visitId: planned.id };
}

describe("school check options", () => {
  it("every option has an English and a Hindi label, and every section a title and hint", () => {
    for (const s of CHECK_SECTIONS) {
      for (const k of [`check.s.${s.id}.title`, `check.s.${s.id}.hint`, ...s.options.map((o) => `check.s.${s.id}.o.${o}`)]) {
        expect((en as Record<string, string>)[k], `en ${k}`).toBeTruthy();
        expect((hi as Record<string, string>)[k], `hi ${k}`).toBeTruthy();
      }
    }
  });

  it("has the areas the mentor asked for", () => {
    expect(CHECK_SECTIONS.map((s) => s.id)).toEqual(["learning", "building", "meal", "toilets", "records", "teachers", "safety"]);
  });

  it("'no problem' is exclusive in both directions", () => {
    expect(toggleCheckOption(["cantWrite", "shy"], NO_ISSUE)).toEqual([NO_ISSUE]);
    expect(toggleCheckOption([NO_ISSUE], "shy")).toEqual(["shy"]);
    expect(toggleCheckOption(["shy"], "shy")).toEqual([]);
    expect(toggleCheckOption([NO_ISSUE], NO_ISSUE)).toEqual([]);
  });

  it("a section is complete with a choice (even 'no problem') or own words; the closing note is optional", () => {
    expect(sectionComplete("meal", undefined)).toBe(false);
    expect(sectionComplete("meal", { ids: [], text: "" })).toBe(false);
    expect(sectionComplete("meal", { ids: [OTHER], text: "" })).toBe(false); // "something else" chosen but nothing written
    expect(sectionComplete("meal", { ids: [OTHER], text: "Gas cylinder empty" })).toBe(true);
    expect(sectionComplete("meal", { ids: [NO_ISSUE], text: "" })).toBe(true);
    expect(sectionComplete("extra", undefined)).toBe(true);
  });

  it("counts problems only, not 'no problem' or free text", () => {
    expect(problemCount({ meal: { ids: ["notCooked", "noGas"], text: "x" }, toilets: { ids: [NO_ISSUE], text: "" } })).toBe(2);
  });
});

describe("school check service", () => {
  it("saves answers per section, returns them, and replaces the previous check", () => {
    const { db, me, visitId } = startedVisit();
    expect(getSchoolCheck(db, me, visitId)).toEqual({ answers: {}, updated_at: null });
    const saved = saveSchoolCheck(db, me, visitId, {
      answers: {
        learning: { ids: ["cantReadWords", "shy"], text: "" },
        meal: { ids: ["notCooked", OTHER], text: "Cook on leave" },
        toilets: { ids: [NO_ISSUE], text: "" },
        extra: { ids: [], text: "SMC wants a new fan." },
      },
    });
    expect(saved.answers.learning.ids).toEqual(["cantReadWords", "shy"]);
    expect(saved.answers.meal.text).toBe("Cook on leave");
    expect(saved.answers.extra.text).toBe("SMC wants a new fan.");
    expect(saved.updated_at).toBeTruthy();

    const again = saveSchoolCheck(db, me, visitId, { answers: { building: { ids: ["leakingRoof"], text: "" } } });
    expect(Object.keys(again.answers)).toEqual(["building"]);
  });

  it("refuses unknown sections, unknown options, options from another section, and options in the closing note", () => {
    const { db, me, visitId } = startedVisit();
    expect(() => saveSchoolCheck(db, me, visitId, { answers: { nonsense: { ids: [], text: "x" } } })).toThrow();
    expect(() => saveSchoolCheck(db, me, visitId, { answers: { meal: { ids: ["madeUp"], text: "" } } })).toThrow();
    expect(() => saveSchoolCheck(db, me, visitId, { answers: { meal: { ids: ["leakingRoof"], text: "" } } })).toThrow();
    expect(() => saveSchoolCheck(db, me, visitId, { answers: { extra: { ids: ["shy"], text: "x" } } })).toThrow();
    expect(validOptionIds("meal").has("notCooked")).toBe(true);
    expect(all(db, "SELECT 1 FROM school_checks WHERE visit_id = ?", visitId)).toHaveLength(0);
  });

  it("is refused before the visit is started and after it is completed", () => {
    const db = freshDb();
    const me = asha(db);
    const planned = listVisits(db, me, { status: "planned" }).items[0];
    expect(() => saveSchoolCheck(db, me, planned.id, { answers: { meal: { ids: [NO_ISSUE], text: "" } } })).toThrow(/Start the visit/);
  });

  it("belongs to the visit's own mentor only", () => {
    const { db, me, visitId } = startedVisit();
    saveSchoolCheck(db, me, visitId, { answers: { meal: { ids: ["noGas"], text: "" } } });
    expect(() => getSchoolCheck(db, rakesh(db), visitId)).toThrow();
    expect(() => saveSchoolCheck(db, rakesh(db), visitId, { answers: {} })).toThrow();
  });

  it("audits which sections were filled, never the mentor's words", () => {
    const { db, me, visitId } = startedVisit();
    saveSchoolCheck(db, me, visitId, { answers: { meal: { ids: [OTHER], text: "SECRET-WORDS-123" } } });
    const rows = all<{ metadata: string }>(db, "SELECT metadata FROM audit_logs WHERE action = 'school_check.saved'");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toContain("meal");
    expect(rows[0].metadata).not.toContain("SECRET-WORDS-123");
  });
});
