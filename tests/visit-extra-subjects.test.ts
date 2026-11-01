import { describe, expect, it } from "vitest";
import { asha, freshDb } from "./helpers";
import { createVisit, listVisits, updateVisit } from "@/lib/services/visits";
import { SUBJECTS } from "@/lib/visit-labels";
import { visitSubjects } from "@/lib/visit-subjects";

function base(db: ReturnType<typeof freshDb>) {
  const existing = listVisits(db, asha(db), {}).items[0];
  return {
    school_id: existing.school_id, teacher_alias: "T-501", scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), grade: 3,
    subject: "Hindi", language: "hi", purpose: "Routine academic support visit", save_as: "planned",
  };
}

describe("visits that cover several subjects", () => {
  it("stores the other subjects beside the main one, and defaults to none", () => {
    const db = freshDb();
    const plain = createVisit(db, asha(db), base(db));
    expect(JSON.parse(plain.extra_subjects)).toEqual([]);
    const multi = createVisit(db, asha(db), { ...base(db), teacher_alias: "T-502", subject: "Mathematics", extra_subjects: ["Science", "English"] });
    expect(multi.subject).toBe("Mathematics");
    expect(visitSubjects(multi.subject, multi.extra_subjects)).toEqual(["Mathematics", "Science", "English"]);
  });

  it("never repeats a subject or lists the main subject twice", () => {
    const db = freshDb();
    const v = createVisit(db, asha(db), { ...base(db), subject: "Hindi", extra_subjects: ["Hindi", "English", "English"] });
    expect(JSON.parse(v.extra_subjects)).toEqual(["English"]);
  });

  it("can cover all subjects", () => {
    const db = freshDb();
    const v = createVisit(db, asha(db), { ...base(db), subject: SUBJECTS[0], extra_subjects: SUBJECTS.slice(1) });
    expect(visitSubjects(v.subject, v.extra_subjects)).toHaveLength(SUBJECTS.length);
  });

  it("rejects an unknown subject", () => {
    const db = freshDb();
    expect(() => createVisit(db, asha(db), { ...base(db), extra_subjects: ["Klingon"] })).toThrow();
  });

  it("can be changed while planning, and a new main subject is removed from the extras", () => {
    const db = freshDb();
    const v = createVisit(db, asha(db), { ...base(db), subject: "Hindi", extra_subjects: ["English", "Science"] });
    const a = updateVisit(db, asha(db), v.id, { extra_subjects: ["Sanskrit"] });
    expect(JSON.parse(a.extra_subjects)).toEqual(["Sanskrit"]);
    const b = updateVisit(db, asha(db), v.id, { extra_subjects: ["English", "Science"] });
    const c = updateVisit(db, asha(db), v.id, { subject: "English" });
    expect(c.subject).toBe("English");
    expect(JSON.parse(c.extra_subjects)).toEqual(["Science"]);
    expect(JSON.parse(b.extra_subjects)).toEqual(["English", "Science"]);
  });

  it("leaves the extras alone when only other fields change", () => {
    const db = freshDb();
    const v = createVisit(db, asha(db), { ...base(db), extra_subjects: ["English"] });
    const u = updateVisit(db, asha(db), v.id, { teacher_alias: "T-777" });
    expect(JSON.parse(u.extra_subjects)).toEqual(["English"]);
  });
});
