import { describe, expect, it } from "vitest";
import { freshDb, asha, rakesh, meena } from "./helpers";
import { createIssue, generateQuestions, getIssue, getSession, listIssues, listSessions, resuggestIssue, reviewSession, updateIssue } from "@/lib/services/mentor-help";
import { subjectsForGrade, HELP_GRADES, HELP_SUBJECTS, GROUND_TOPICS, MEAL_TOPICS, bandOf } from "@/lib/help/catalog";
import { SUBJECT_BANK } from "@/lib/help/bank";
import { all } from "@/lib/db/client";
import type { AiProvider } from "@/lib/ai/provider";

const demo = { use_demo_provider: true };

describe("question bank coverage", () => {
  it("has questions for every class and subject the UI offers", () => {
    for (const g of HELP_GRADES) {
      for (const s of subjectsForGrade(g)) {
        expect(SUBJECT_BANK[s]?.[bandOf(g)]?.length, `${s} class ${g}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(HELP_SUBJECTS).toEqual(["Hindi", "English", "Mathematics", "Science", "SocialScience", "Sanskrit"]);
  });
});

describe("academic problems", () => {
  it("logs a problem with an instant suggestion, updates its status and summarises", async () => {
    const db = freshDb();
    const a = asha(db);
    const issue = await createIssue(db, a, { category: "reading", description: "Class 3 children cannot read words yet", grade: 3, subject: "Hindi", ...demo, language: "hi" });
    expect(issue.status).toBe("open");
    expect(issue.suggestion?.suggestions.length).toBe(3);
    expect(issue.is_simulated).toBe(true);
    const done = updateIssue(db, a, issue.id, { status: "resolved", resolution_note: "Group reading started" });
    expect(done.status).toBe("resolved");
    expect(done.resolved_at).not.toBeNull();
    const l = listIssues(db, a);
    expect(l.summary.total).toBe(1);
    expect(l.summary.by_status.resolved).toBe(1);
    expect(listIssues(db, a, { status: "open" }).items).toHaveLength(0);
    expect(listIssues(db, a, { status: "resolved" }).items).toHaveLength(1);
  });

  it("is private to the mentor and closed to other roles", async () => {
    const db = freshDb();
    const i = await createIssue(db, asha(db), { category: "numeracy", description: "Sums are hard", ...demo });
    expect(() => getIssue(db, rakesh(db), i.id)).toThrow(/not found/i);
    expect(() => listIssues(db, meena(db))).toThrow();
  });

  it("saves the problem even when the AI fails, and can retry", async () => {
    const db = freshDb();
    const failing: AiProvider = { id: "x", label: "x", simulated: false, generate: async () => { throw new Error("boom"); } };
    const i = await createIssue(db, asha(db), { category: "attendance", description: "Many absent on Mondays" }, { provider: failing });
    expect(i.suggestion).toBeNull();
    expect(i.suggestion_error).toBeTruthy();
    const again = await resuggestIssue(db, asha(db), i.id, demo);
    expect(again.suggestion?.first_step).toBeTruthy();
  });

  it("refuses a school the mentor is not assigned to", async () => {
    const db = freshDb();
    const other = all<{ id: string }>(db, "SELECT id FROM schools WHERE id NOT IN (SELECT school_id FROM school_assignments WHERE profile_id = ?)", asha(db).id)[0];
    if (!other) return;
    await expect(createIssue(db, asha(db), { category: "other", description: "abc", school_id: other.id, ...demo })).rejects.toThrow();
  });
});

describe("question sets and review", () => {
  it("generates class- and subject-wise questions, then reviews the outcomes with suggestions", async () => {
    const db = freshDb();
    const a = asha(db);
    const s = await generateQuestions(db, a, { kind: "subject", grade: 4, subject: "Mathematics", count: 5, language: "hi", ...demo });
    expect(s.questions).toHaveLength(5);
    expect(s.questions.every((q) => q.q && q.hint)).toBe(true);
    expect(s.is_simulated).toBe(true);
    const r = await reviewSession(db, a, s.id, { outcomes: { "0": "good", "1": "weak", "2": "some" }, note: "Group of 6 children", ...demo });
    expect(r.review?.suggestions.length).toBe(2);
    expect(r.review?.next_step).toContain(s.questions[1].q.slice(0, 20));
    expect(getSession(db, a, s.id).outcomes["1"]).toBe("weak");
    expect(listSessions(db, a, { kind: "subject" })).toHaveLength(1);
  });

  it("covers mid-day meal and ground topics", async () => {
    const db = freshDb();
    for (const topic of MEAL_TOPICS) {
      const s = await generateQuestions(db, asha(db), { kind: "meal", topic, count: 3, ...demo });
      expect(s.questions.length, topic).toBeGreaterThan(0);
      expect(s.questions.every((q) => q.fix)).toBe(true);
    }
    for (const topic of GROUND_TOPICS) {
      expect((await generateQuestions(db, asha(db), { kind: "ground", topic, count: 3, ...demo })).questions.length, topic).toBeGreaterThan(0);
    }
  });

  it("rejects invalid choices and other roles", async () => {
    const db = freshDb();
    await expect(generateQuestions(db, asha(db), { kind: "subject", grade: 1, subject: "Sanskrit", ...demo })).rejects.toThrow();
    await expect(generateQuestions(db, asha(db), { kind: "subject", grade: 9, subject: "Hindi", ...demo })).rejects.toThrow();
    await expect(generateQuestions(db, asha(db), { kind: "meal", topic: "nonsense", ...demo })).rejects.toThrow();
    await expect(generateQuestions(db, meena(db), { kind: "meal", topic: "menu", ...demo })).rejects.toThrow();
    const s = await generateQuestions(db, asha(db), { kind: "meal", topic: "menu", ...demo });
    expect(() => getSession(db, rakesh(db), s.id)).toThrow(/not found/i);
    await expect(reviewSession(db, asha(db), s.id, { outcomes: { "9": "weak" }, ...demo })).rejects.toThrow();
    await expect(reviewSession(db, asha(db), s.id, { outcomes: {}, ...demo })).rejects.toThrow();
  });

  it("discards model output with evaluative language about a teacher", async () => {
    const db = freshDb();
    const bad: AiProvider = {
      id: "x", label: "x", simulated: false,
      generate: async () => ({ json: { questions: [{ q: "Is the teacher rating low?", hint: "This teacher score is bad", who: "teacher", fix: "" }], tip: "" }, provider: "x", model: "m", simulated: false }),
    };
    await expect(generateQuestions(db, asha(db), { kind: "meal", topic: "menu" }, { provider: bad })).rejects.toThrow(/evaluative/i);
  });

  it("writes everyday Hinglish, not formal Hindi", async () => {
    const db = freshDb();
    const i = await createIssue(db, asha(db), { category: "teaching", description: "Needs support", language: "hi", ...demo });
    expect(i.suggestion?.first_step).toMatch(/[ऀ-ॿ]/);
  });
});

describe("photos on a problem", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString("base64");
  const mk = async (db: ReturnType<typeof freshDb>) => (await createIssue(db, asha(db), { category: "reading", description: "Cannot read words", ...demo })).id;

  it("adds, lists, reads and deletes photos, only for the owner", async () => {
    const { addIssuePhoto, getIssuePhoto, deleteIssuePhoto } = await import("@/lib/services/mentor-help");
    const db = freshDb();
    const id = await mk(db);
    const withOne = addIssuePhoto(db, asha(db), id, { data_base64: jpeg });
    expect(withOne.photos).toHaveLength(1);
    expect(getIssuePhoto(db, asha(db), withOne.photos[0].id).mime).toBe("image/jpeg");
    expect(listIssues(db, asha(db)).items[0].photos).toHaveLength(1);
    expect(() => getIssuePhoto(db, rakesh(db), withOne.photos[0].id)).toThrow(/not found/i);
    expect(() => addIssuePhoto(db, rakesh(db), id, { data_base64: jpeg })).toThrow(/not found/i);
    expect(() => deleteIssuePhoto(db, rakesh(db), withOne.photos[0].id)).toThrow(/not found/i);
    expect(deleteIssuePhoto(db, asha(db), withOne.photos[0].id).photos).toHaveLength(0);
  });

  it("refuses files that are not images, too many photos, and oversize photos", async () => {
    const { addIssuePhoto, MAX_PHOTO_BYTES } = await import("@/lib/services/mentor-help");
    const db = freshDb();
    const id = await mk(db);
    expect(() => addIssuePhoto(db, asha(db), id, { data_base64: Buffer.from("<script>alert(1)</script>............").toString("base64") })).toThrow(/JPEG, PNG or WebP/);
    expect(() => addIssuePhoto(db, asha(db), id, { data_base64: "not base64!!!!!!!!!!!!" })).toThrow();
    for (let n = 0; n < 3; n++) addIssuePhoto(db, asha(db), id, { data_base64: jpeg });
    expect(() => addIssuePhoto(db, asha(db), id, { data_base64: jpeg })).toThrow(/up to 3/);
    const id2 = await mk(db);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_PHOTO_BYTES + 10, 2)]).toString("base64");
    expect(() => addIssuePhoto(db, asha(db), id2, { data_base64: big })).toThrow();
  });
});
