import { afterEach, describe, expect, it } from "vitest";
import { IDBObjectStore as FDBObjectStore } from "fake-indexeddb";
import { freshDb } from "./helpers";
import { makeDevice, newFactory, onlineSnapshot, openStore } from "./offline-helpers";
import { LocalStore, LocalConflictError, LocalRuleError } from "@/lib/offline/store";
import { MIGRATIONS, dbNameFor, openDb } from "@/lib/offline/db";
import { StorageError } from "@/lib/offline/types";

const when = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();
const visitInput = (school_id: string, extra: object = {}) => ({ school_id, teacher_alias: "T-501", scheduled_at: when(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit", ...extra });

async function ready() {
  const db = freshDb();
  const factory = newFactory();
  const device = makeDevice(db, "demo-mentor-asha");
  const store = await openStore("demo-mentor-asha", factory);
  await onlineSnapshot(store, device);
  const school = (await store.listSchools())[0];
  return { db, factory, device, store, school };
}
const raw = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

afterEach(() => { (FDBObjectStore.prototype as unknown as { put: unknown }).put = origPut; });
const origPut = FDBObjectStore.prototype.put;

describe("saving on the device", () => {
  it("a new visit, observation and commitment are saved locally with a queued change each, and survive a restart", async () => {
    const { factory, store, school } = await ready();
    const v = await store.createVisit(visitInput(school.id));
    expect(v.sync.state).toBe("pending");
    expect(v.sync.serverVersion).toBeNull();
    await store.transitionVisit(v.id, "in_progress");
    const o = await store.saveObservation(v.id, { practice_observed: "Pairs read aloud.", evidence: "Learners took turns reading." });
    const target = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    const c = await store.saveCommitment(v.id, { action_text: "Ask three questions after each read-aloud", target_date: target, expected_evidence: "Questions asked" });
    expect([o.sync.state, c.sync.state]).toEqual(["pending", "pending"]);
    expect((await store.listOutbox()).map((x) => `${x.entityType}.${x.op}`)).toEqual(["visit.create", "visit.transition", "observation.create", "commitment.create"]);

    store.close(); // app closed
    const reopened = await openStore("demo-mentor-asha", factory); // app restarted
    expect((await reopened.getVisit(v.id))?.status).toBe("in_progress");
    expect((await reopened.listObservations(v.id))[0].practice_observed).toBe("Pairs read aloud.");
    expect((await reopened.listCommitments(v.id))[0].action_text).toMatch(/three questions/);
    const s = await reopened.syncSummary();
    expect(s.pendingOps).toBe(4);
    expect(s.pendingRecords).toBe(3 + 0); // visit, observation, commitment
    expect((await reopened.listVisits()).find((x) => x.id === v.id)!.sync.state).toBe("pending"); // still NOT server-confirmed
  });

  it("edits to an unsent record are merged into one queued change; deleting an unsent record leaves no trace", async () => {
    const { store, school } = await ready();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const o = await store.saveObservation(v.id, { practice_observed: "First draft text", evidence: "First evidence" });
    for (let i = 2; i <= 5; i++) await store.saveObservation(v.id, { practice_observed: `Edit number ${i}`, evidence: "Evidence stays" }, o.id);
    const ops = (await store.listOutbox()).filter((x) => x.entityId === o.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("create");
    expect(ops[0].payload.practice_observed).toBe("Edit number 5");
    await store.deleteObservation(o.id);
    expect((await store.listOutbox()).filter((x) => x.entityId === o.id)).toHaveLength(0);
    expect(await store.listObservations(v.id)).toHaveLength(0);
  });

  it("enforces the same rules as the server before saving (and says why)", async () => {
    const { store, school } = await ready();
    await expect(store.createVisit(visitInput(school.id, { teacher_alias: "<script>" }))).rejects.toThrow();
    await expect(store.createVisit(visitInput("not-my-school"))).rejects.toBeInstanceOf(LocalRuleError);
    const v = await store.createVisit(visitInput(school.id));
    await expect(store.saveObservation(v.id, { practice_observed: "Text here", evidence: "Evidence" })).rejects.toMatchObject({ code: "visit_not_observable" });
    await expect(store.saveCommitment(v.id, { action_text: "Do the thing", target_date: when(3).slice(0, 10), expected_evidence: "x y z" })).rejects.toMatchObject({ code: "visit_not_started" });
    await expect(store.transitionVisit(v.id, "pending_review")).rejects.toMatchObject({ code: "invalid_transition" });
    await store.transitionVisit(v.id, "in_progress");
    await expect(store.transitionVisit(v.id, "pending_review")).rejects.toMatchObject({ code: "no_observations" });
    await store.saveObservation(v.id, { practice_observed: "Text here", evidence: "Evidence" });
    await store.saveCommitment(v.id, { action_text: "Do the thing", target_date: when(3).slice(0, 10), expected_evidence: "x y z" });
    await expect(store.saveCommitment(v.id, { action_text: "Another thing", target_date: when(3).slice(0, 10), expected_evidence: "x y z" })).rejects.toMatchObject({ code: "commitment_exists" });
    await expect(store.saveCommitment(v.id, { action_text: "Late thing", target_date: when(400).slice(0, 10), expected_evidence: "x y z" }, (await store.listCommitments(v.id))[0].id)).rejects.toMatchObject({ code: "target_too_far" });
  });
});

describe("storage failures never produce a false 'saved'", () => {
  it("a quota error rolls back the record AND its queued change together", async () => {
    const { store, school } = await ready();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const before = { obs: await store.listObservations(v.id), ops: await store.listOutbox() };
    (FDBObjectStore.prototype as unknown as { put: unknown }).put = function () { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); };
    const err = await store.saveObservation(v.id, { practice_observed: "Will not fit", evidence: "No space" }).catch((e) => e);
    (FDBObjectStore.prototype as unknown as { put: unknown }).put = origPut;
    expect(err).toBeInstanceOf(StorageError);
    expect(err.kind).toBe("quota");
    expect(await store.listObservations(v.id)).toEqual(before.obs);
    expect((await store.listOutbox()).length).toBe(before.ops.length); // no orphan queued change
  });

  it("an unavailable database surfaces as a StorageError instead of pretending to work", async () => {
    const broken = { open() { throw new Error("SecurityError: storage disabled (private mode)"); } } as unknown as IDBFactory;
    await expect(LocalStore.open("demo-mentor-asha", { factory: broken })).rejects.toMatchObject({ name: "StorageError", kind: "unavailable" });
  });
});

describe("account separation", () => {
  it("each account has its own database: another account sees nothing and cannot sync it", async () => {
    const { factory, store, school } = await ready();
    const v = await store.createVisit(visitInput(school.id));
    const other = await openStore("demo-mentor-rakesh", factory);
    expect(await other.listVisits()).toHaveLength(0);
    expect(await other.getVisit(v.id)).toBeUndefined();
    expect((await other.syncSummary()).pendingOps).toBe(0);
    expect(dbNameFor("demo-mentor-asha")).not.toBe(dbNameFor("demo-mentor-rakesh"));
    // the first account's unsynced work is still there after the other account used the device
    expect((await store.syncSummary()).pendingOps).toBe(1);
  });

  it("refuses to open a database whose recorded owner is a different account", async () => {
    const factory = newFactory();
    const a = await openStore("demo-mentor-asha", factory);
    await a.setMeta("accountId", "demo-mentor-rakesh");
    a.close();
    await expect(openStore("demo-mentor-asha", factory)).rejects.toMatchObject({ kind: "corrupt" });
  });

  it("wiping local data refuses while records are unsynced unless the user explicitly forces it", async () => {
    const { factory, store, school } = await ready();
    await store.createVisit(visitInput(school.id));
    await expect(store.wipe()).rejects.toMatchObject({ code: "unsynced_records" });
    await store.wipe({ force: true });
    const fresh = await openStore("demo-mentor-asha", factory);
    expect(await fresh.listVisits()).toHaveLength(0);
  });
});

describe("local database migrations", () => {
  async function seedVersion1(factory: IDBFactory, account: string) {
    const db = await openDb(dbNameFor(account), [MIGRATIONS[0]], factory); // an older app: schema v1 (no syncLog store)
    const tx = db.transaction(["meta", "visits", "outbox"], "readwrite");
    tx.objectStore("meta").put({ key: "accountId", value: account });
    tx.objectStore("visits").put({ id: "11111111-1111-4111-8111-111111111111", school_id: "s", teacher_alias: "T-9", scheduled_at: new Date().toISOString(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine", coaching_focus: null, prep_notes: null, previous_commitment_id: null, observation_method: "text", status: "planned", created_at: new Date().toISOString(), origin: "local", sync: { state: "pending", localUpdatedAt: new Date().toISOString(), serverVersion: null, confirmedAt: null } });
    tx.objectStore("outbox").add({ opId: "22222222-2222-4222-8222-222222222222", entityType: "visit", entityId: "11111111-1111-4111-8111-111111111111", op: "create", payload: { teacher_alias: "T-9" }, chain: "11111111-1111-4111-8111-111111111111", schemaVersion: 1, createdAt: new Date().toISOString(), lastAttemptAt: null, nextAttemptAt: null, retryCount: 0, status: "queued" });
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  }

  it("upgrading from the previous version keeps every pending record and queued change", async () => {
    const factory = newFactory();
    await seedVersion1(factory, "demo-mentor-asha");
    const store = await openStore("demo-mentor-asha", factory); // current app opens the old database and upgrades it
    expect((await store.listVisits()).map((v) => v.teacher_alias)).toEqual(["T-9"]);
    const ops = await store.listOutbox();
    expect(ops).toHaveLength(1);
    expect(ops[0].opId).toBe("22222222-2222-4222-8222-222222222222");
    expect(await store.listSyncLog()).toEqual([]); // the store added in v2 exists and is usable
  });

  it("a migration that fails rolls back: the database stays at the old version with all its records", async () => {
    const factory = newFactory();
    await seedVersion1(factory, "demo-mentor-asha");
    const broken = [...MIGRATIONS, { version: 3, up() { throw new Error("boom"); } }];
    await expect(LocalStore.open("demo-mentor-asha", { factory, migrations: broken })).rejects.toMatchObject({ name: "StorageError", kind: "migration" });
    const probe = await openDb(dbNameFor("demo-mentor-asha"), [MIGRATIONS[0]], factory); // still version 1, readable
    expect(probe.version).toBe(1);
    const n = await raw(probe.transaction("outbox").objectStore("outbox").count());
    expect(n).toBe(1);
    probe.close();
    const store = await openStore("demo-mentor-asha", factory); // and the real upgrade still works afterwards
    expect((await store.listOutbox()).length).toBe(1);
  });
});

describe("conflicted records are protected from silent edits", () => {
  it("editing a record that is in conflict is refused until the user resolves it", async () => {
    const { store, school, device, db } = await ready();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const o = await store.saveObservation(v.id, { practice_observed: "Original", evidence: "Original ev" });
    await device.sync(store);
    // server copy changes behind the device's back, then the device edits
    db.prepare("UPDATE observations SET evidence = 'changed elsewhere', updated_at = ? WHERE id = ?").run(new Date(Date.now() + 9000).toISOString(), o.id);
    await store.saveObservation(v.id, { practice_observed: "Original", evidence: "My edit" }, o.id);
    await device.sync(store, { manual: true });
    expect((await store.listObservations(v.id))[0].sync.state).toBe("conflict");
    await expect(store.saveObservation(v.id, { practice_observed: "Original", evidence: "Another edit" }, o.id)).rejects.toBeInstanceOf(LocalConflictError);
  });
});
