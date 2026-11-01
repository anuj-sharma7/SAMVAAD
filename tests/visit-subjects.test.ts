import { describe, expect, it } from "vitest";
import { ALL_SUBJECTS, coversAllSubjects, normalizeSubjects, splitSubjects, subjectsLabel, toggleSubject, visitSubjects } from "@/lib/visit-subjects";
import { SUBJECTS } from "@/lib/visit-labels";

const t = (key: string) => (key === "visits.subject.all" ? "All subjects" : key.replace("visits.subject.", ""));

describe("choosing several subjects", () => {
  it("toggles single subjects on and off", () => {
    let ids: string[] = [];
    ids = toggleSubject(ids, "Hindi");
    ids = toggleSubject(ids, "English");
    expect(ids).toEqual(["Hindi", "English"]);
    ids = toggleSubject(ids, "Hindi");
    expect(ids).toEqual(["English"]);
  });

  it("'all subjects' selects every subject and tapping it again clears them", () => {
    const all = toggleSubject([], ALL_SUBJECTS);
    expect(all).toContain(ALL_SUBJECTS);
    for (const s of SUBJECTS) expect(all).toContain(s);
    expect(toggleSubject(all, ALL_SUBJECTS)).toEqual([]);
  });

  it("drops the 'all' marker as soon as one subject is unticked, and adds it back when the last is ticked", () => {
    const all = toggleSubject([], ALL_SUBJECTS);
    const without = toggleSubject(all, "Sanskrit");
    expect(without).not.toContain(ALL_SUBJECTS);
    expect(without).toHaveLength(SUBJECTS.length - 1);
    expect(toggleSubject(without, "Sanskrit")).toContain(ALL_SUBJECTS);
  });

  it("ignores unknown ids and repeats", () => {
    expect(normalizeSubjects(["Hindi", "Hindi", "Klingon", ALL_SUBJECTS])).toEqual(["Hindi"]);
  });

  it("splits into a main subject (first chosen) and the others, defaulting to Hindi", () => {
    expect(splitSubjects(["Mathematics", "Science", "Hindi"])).toEqual({ subject: "Mathematics", extra: ["Science", "Hindi"] });
    expect(splitSubjects([])).toEqual({ subject: "Hindi", extra: [] });
    expect(splitSubjects(toggleSubject([], ALL_SUBJECTS)).extra).toHaveLength(SUBJECTS.length - 1);
  });

  it("reads a stored visit safely and labels it", () => {
    expect(visitSubjects("Hindi", '["English","Science"]')).toEqual(["Hindi", "English", "Science"]);
    expect(visitSubjects("Hindi", "not json")).toEqual(["Hindi"]);
    expect(visitSubjects("Hindi", null)).toEqual(["Hindi"]);
    expect(visitSubjects("Hindi", '["Hindi","Klingon"]')).toEqual(["Hindi"]);
    expect(subjectsLabel(t, "Hindi", '["English"]')).toBe("Hindi, English");
    expect(subjectsLabel(t, "Hindi", JSON.stringify(SUBJECTS.slice(1)))).toBe("All subjects");
    expect(coversAllSubjects(["Hindi"])).toBe(false);
  });
});
