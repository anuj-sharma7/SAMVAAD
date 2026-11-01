import { describe, expect, it } from "vitest";
import { all, get } from "@/lib/db/client";
import { freshDb } from "./helpers";
import { makeDevice, newFactory, onlineSnapshot, openStore } from "./offline-helpers";
import { LocalRuleError } from "@/lib/offline/store";

const when = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();
const visitInput = (school_id: string) => ({ school_id, teacher_alias: "T-801", scheduled_at: when(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit" });

async function setup() {
  const db = freshDb();
  const factory = newFactory();
  const device = makeDevice(db, "demo-mentor-asha");
  const store = await openStore("demo-mentor-asha", factory);
  await onlineSnapshot(store, device);
  const school = (await store.listSchools())[0];
  return { db, factory, device, store, school };
}

describe("school check in offline field mode", () => {
  it("is saved on the device with no internet, survives a restart, and syncs once to the server", async () => {
    const { db, factory, device, store, school } = await setup();
    device.faults.offline = true;
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const saved = await store.saveSchoolCheck(v.id, {
      learning: { ids: ["cantReadWords"], text: "" },
      meal: { ids: ["__other"], text: "Gas cylinder empty" },
      toilets: { ids: ["ok"], text: "" },
      extra: { ids: [], text: "Needs a fan in room 2" },
    });
    expect(saved.id).toBe(v.id); // the record id is the visit id
    expect(saved.sync.state).toBe("pending");

    store.close();
    const reopened = await openStore("demo-mentor-asha", factory);
    expect((await reopened.getSchoolCheck(v.id))?.answers.meal.text).toBe("Gas cylinder empty");

    expect((await device.sync(reopened)).status).toBe("offline");
    expect(get(db, "SELECT 1 FROM school_checks WHERE visit_id = ?", v.id)).toBeUndefined(); // nothing pretended to be sent

    device.faults.offline = false;
    const report = await device.sync(reopened);
    expect(report.status).toBe("ok");
    const rows = all<{ section: string; option_ids: string; other_text: string }>(db, "SELECT section, option_ids, other_text FROM school_checks WHERE visit_id = ? ORDER BY section", v.id);
    expect(rows.map((r) => r.section)).toEqual(["extra", "learning", "meal", "toilets"]);
    expect(rows.find((r) => r.section === "meal")!.other_text).toBe("Gas cylinder empty");
    expect((await reopened.getSchoolCheck(v.id))!.sync.state).toBe("synced");
    expect((await reopened.syncSummary()).pendingOps).toBe(0);

    // a second sync sends nothing and creates no duplicates
    await device.sync(reopened);
    expect(all(db, "SELECT 1 FROM school_checks WHERE visit_id = ?", v.id)).toHaveLength(4);
  });

  it("edits before sync are merged into one queued change, and an edit after sync replaces the server copy", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    await store.saveSchoolCheck(v.id, { meal: { ids: ["notCooked"], text: "" } });
    await store.saveSchoolCheck(v.id, { meal: { ids: ["notCooked", "noGas"], text: "" }, building: { ids: ["leakingRoof"], text: "" } });
    expect((await store.listOutbox()).filter((o) => o.entityType === "school_check")).toHaveLength(1);
    await device.sync(store);
    expect(all(db, "SELECT section FROM school_checks WHERE visit_id = ?", v.id)).toHaveLength(2);

    await store.saveSchoolCheck(v.id, { safety: { ids: ["noFirstAid"], text: "" } });
    await device.sync(store);
    expect(all<{ section: string }>(db, "SELECT section FROM school_checks WHERE visit_id = ?", v.id).map((r) => r.section)).toEqual(["safety"]);
  });

  it("refuses bad input on the device: unknown options, and a visit that has not started or is not on the device", async () => {
    const { store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await expect(store.saveSchoolCheck(v.id, { meal: { ids: ["notCooked"], text: "" } })).rejects.toBeInstanceOf(LocalRuleError); // not started
    await store.transitionVisit(v.id, "in_progress");
    await expect(store.saveSchoolCheck(v.id, { meal: { ids: ["leakingRoof"], text: "" } })).rejects.toThrow(); // option of another section
    await expect(store.saveSchoolCheck(v.id, { nonsense: { ids: [], text: "x" } })).rejects.toThrow();
    await expect(store.saveSchoolCheck(crypto.randomUUID(), {})).rejects.toBeInstanceOf(LocalRuleError);
    expect(await store.getSchoolCheck(v.id)).toBeUndefined();
  });

  it("a second device pulls the saved check in its snapshot", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    await store.saveSchoolCheck(v.id, { teachers: { ids: ["teacherLate"], text: "" } });
    await device.sync(store);

    const other = await openStore("demo-mentor-asha", newFactory());
    await onlineSnapshot(other, makeDevice(db, "demo-mentor-asha"));
    const pulled = await other.getSchoolCheck(v.id);
    expect(pulled?.answers.teachers.ids).toEqual(["teacherLate"]);
    expect(pulled?.sync.state).toBe("synced");
    expect(pulled?.origin).toBe("server");
  });

  it("a school check the server refuses stays visible as a failed record instead of disappearing", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    await store.saveSchoolCheck(v.id, { meal: { ids: ["notCooked"], text: "" } });
    await device.sync(store); // visit + check reach the server
    // the visit is completed on the server (only the server can do this), so it now refuses further checks
    db.prepare("UPDATE visits SET status = 'completed', completed_at = '2026-11-01T00:00:00.000Z' WHERE id = ?").run(v.id);
    // locally the visit is still in progress, so the device lets the mentor edit and the server then refuses
    await store.saveSchoolCheck(v.id, { meal: { ids: ["noGas"], text: "" } });
    const report = await device.sync(store);
    expect(report.status).not.toBe("ok");
    const ops = (await store.listOutbox()).filter((o) => o.entityType === "school_check");
    expect(ops[0].status).toBe("rejected");
    expect((await store.getSchoolCheck(v.id))!.sync.state).toBe("failed");
  });
});

describe("school check in the offline draft report", () => {
  it("is included with its sync state, and a visit without one reports none", async () => {
    const { buildLocalReport } = await import("@/lib/offline/report");
    const { store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const visit = (await store.getVisit(v.id))!;
    expect(buildLocalReport(visit, school, [], null, [], null).schoolCheck).toBeNull();

    const check = await store.saveSchoolCheck(v.id, { toilets: { ids: ["noToilet"], text: "" } });
    const r = buildLocalReport(visit, school, [], null, [], check);
    expect(r.schoolCheck?.answers.toilets.ids).toEqual(["noToilet"]);
    expect(r.schoolCheck?.sent).toBe(false); // saved only on this device
    expect(r.records.some((x) => x.kind === "school_check" && !x.sent)).toBe(true);
    expect(r.unsentCount).toBeGreaterThan(0);
  });
});
