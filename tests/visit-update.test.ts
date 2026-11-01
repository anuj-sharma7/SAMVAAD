import { expect, it } from "vitest";
import { asha, freshDb } from "./helpers";
import { createVisit, listVisits, updateVisit } from "@/lib/services/visits";

it("an update that does not mention language or method keeps them", () => {
  const db = freshDb();
  const sid = listVisits(db, asha(db), {}).items[0].school_id;
  const v = createVisit(db, asha(db), { school_id: sid, teacher_alias: "T-601", scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), grade: 2, subject: "English", language: "en", purpose: "Routine academic support visit", observation_method: "checklist", save_as: "planned" });
  const u = updateVisit(db, asha(db), v.id, { teacher_alias: "T-602" });
  expect(u.language).toBe("en");
  expect(u.observation_method).toBe("checklist");
});
