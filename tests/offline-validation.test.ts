import { describe, expect, it } from "vitest";
import { createVisitSchema } from "@/lib/services/visits";
import { observationSchema } from "@/lib/services/observations";
import { createCommitmentSchema } from "@/lib/services/commitments";
import { commitmentInput, observationInput, visitInput } from "@/lib/offline/validation";

/**
 * The device validates before saving so the mentor hears about a mistake while still offline. These tests keep the client rules
 * and the server rules from drifting apart: anything the device accepts the server must accept, and the obvious bad inputs must be
 * refused by both.
 */
const when = (d = 2) => new Date(Date.now() + d * 86_400_000).toISOString();
const base = { school_id: "s1", teacher_alias: "T-101", scheduled_at: when(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit" };

describe("visit input: client and server rules agree", () => {
  const cases: [string, object, boolean][] = [
    ["a normal visit", {}, true],
    ["alias with letters, digits, space, dash", { teacher_alias: "Teacher A-2" }, true],
    ["Devanagari alias", { teacher_alias: "शिक्षक-1" }, true],
    ["alias with markup", { teacher_alias: "<b>x</b>" }, false],
    ["alias too long", { teacher_alias: "a".repeat(61) }, false],
    ["empty alias", { teacher_alias: "   " }, false],
    ["grade 0", { grade: 0 }, false],
    ["grade 9", { grade: 9 }, false],
    ["unknown subject", { subject: "Art" }, false],
    ["purpose too short", { purpose: "ab" }, false],
    ["not a date", { scheduled_at: "tomorrow" }, false],
    ["optional fields blank", { coaching_focus: "", prep_notes: "" }, true],
    ["focus too long", { coaching_focus: "x".repeat(301) }, false],
  ];
  it.each(cases)("%s", (_name, patch, ok) => {
    const input = { ...base, ...patch };
    expect(visitInput.safeParse(input).success, "client").toBe(ok);
    expect(createVisitSchema.safeParse({ ...input, save_as: "planned" }).success, "server").toBe(ok);
  });
});

it("a visit date far in the future is refused on the device (the server refuses it in createVisit, not in the schema)", () => {
  expect(visitInput.safeParse({ ...base, scheduled_at: when(900) }).success).toBe(false);
});

describe("observation input", () => {
  const cases: [string, object, boolean][] = [
    ["normal", { practice_observed: "Pairs read aloud", evidence: "Learners took turns" }, true],
    ["too short practice", { practice_observed: "ab", evidence: "Learners took turns" }, false],
    ["too short evidence", { practice_observed: "Pairs read aloud", evidence: "ab" }, false],
    ["optional fields present", { practice_observed: "Pairs read aloud", evidence: "Turns", worked_well: "x".repeat(1500) }, true],
    ["optional too long", { practice_observed: "Pairs read aloud", evidence: "Turns", improvement_area: "x".repeat(1501) }, false],
    ["context too long", { practice_observed: "Pairs read aloud", evidence: "Turns", context_note: "x".repeat(501) }, false],
  ];
  it.each(cases)("%s", (_n, input, ok) => {
    expect(observationInput.safeParse(input).success, "client").toBe(ok);
    expect(observationSchema.safeParse(input).success, "server").toBe(ok);
  });
});

describe("commitment input", () => {
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const cases: [string, object, boolean][] = [
    ["normal", { action_text: "Ask three questions", target_date: day, expected_evidence: "Questions asked" }, true],
    ["action too short", { action_text: "Ask", target_date: day, expected_evidence: "Questions asked" }, false],
    ["bad date format", { action_text: "Ask three questions", target_date: "5/3/2026", expected_evidence: "Questions asked" }, false],
    ["evidence too short", { action_text: "Ask three questions", target_date: day, expected_evidence: "ab" }, false],
    ["owner mentor", { action_text: "Ask three questions", target_date: day, expected_evidence: "Questions", owner_role: "mentor" }, true],
    ["unknown owner", { action_text: "Ask three questions", target_date: day, expected_evidence: "Questions", owner_role: "principal" }, false],
  ];
  it.each(cases)("%s", (_n, input, ok) => {
    expect(commitmentInput.safeParse(input).success, "client").toBe(ok);
    expect(createCommitmentSchema.safeParse({ visit_id: "v", ...input }).success, "server").toBe(ok);
  });
});
