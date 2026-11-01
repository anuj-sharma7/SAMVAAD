import { describe, expect, it } from "vitest";
import { TOUR_STEPS, stepsFor } from "@/lib/tour";
import { en, hi } from "@/lib/i18n/messages";

describe("first-run tour steps", () => {
  it("shows every step to mentors and only the general steps to other roles", () => {
    expect(stepsFor("mentor").map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
    expect(stepsFor("supervisor").map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(stepsFor("diet_admin").map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("has unique ids and valid menu targets", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) if (s.target) expect(s.target).toMatch(/^\/[a-z-]+$/);
  });

  it("has a title and body in both languages for every step", () => {
    for (const s of TOUR_STEPS) {
      for (const part of ["title", "body"]) {
        const key = `help.tour.${s.id}.${part}` as keyof typeof en;
        expect(en[key], `en ${key}`).toBeTruthy();
        expect(hi[key], `hi ${key}`).toBeTruthy();
      }
    }
  });
});
