import { describe, expect, it } from "vitest";
import { all, get, run } from "@/lib/db/client";
import { freshDb } from "./helpers";
import { makeDevice, newFactory, onlineSnapshot, openStore } from "./offline-helpers";
import { backoffMs, MAX_BATCH } from "@/lib/offline/sync-engine";

const when = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();
const visitInput = (school_id: string, extra: object = {}) => ({ school_id, teacher_alias: "T-601", scheduled_at: when(), grade: 2, subject: "Hindi", language: "hi", purpose: "Routine academic support visit", ...extra });
const count = (db: ReturnType<typeof freshDb>, t: string) => get<{ n: number }>(db, `SELECT count(*) AS n FROM ${t}`)!.n;

async function setup(persona = "demo-mentor-asha") {
  const db = freshDb();
  const factory = newFactory();
  const device = makeDevice(db, persona);
  const store = await openStore(persona, factory);
  await onlineSnapshot(store, device); // "first open while online": schools, visits and approved cards are cached
  const school = (await store.listSchools())[0];
  return { db, factory, device, store, school };
}

describe("the main acceptance scenario: record offline, restart, reconnect, sync once", () => {
  it("visit + observation + commitment saved offline survive a restart, stay 'pending', then sync exactly once with no duplicates", async () => {
    const { db, factory, device, store, school } = await setup();
    const serverVisits = count(db, "visits"), serverObs = count(db, "observations"), serverComs = count(db, "commitments");

    device.faults.offline = true; // internet lost
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const o = await store.saveObservation(v.id, { practice_observed: "Pairs read aloud.", evidence: "Learners took turns reading the passage." });
    const c = await store.saveCommitment(v.id, { action_text: "Ask three questions after each read-aloud", target_date: when(9).slice(0, 10), expected_evidence: "Three questions asked" });

    // a sync attempt while offline loses nothing and does not pretend anything succeeded
    const offline = await device.sync(store);
    expect(offline.status).toBe("offline");
    expect(count(db, "visits")).toBe(serverVisits);

    store.close(); // app closed
    const restarted = await openStore("demo-mentor-asha", factory); // app reopened, still offline
    const summary = await restarted.syncSummary();
    expect(summary.pendingOps).toBe(4);
    for (const rec of [await restarted.getVisit(v.id), (await restarted.listObservations(v.id))[0], (await restarted.listCommitments(v.id))[0]]) {
      expect(rec!.sync.state).not.toBe("synced");
      expect(rec!.sync.serverVersion).toBeNull();
      expect(rec!.sync.confirmedAt).toBeNull();
    }

    device.faults.offline = false; // internet back
    const report = await device.sync(restarted, { manual: true });
    expect(report.applied).toBe(4);
    expect(report.status).toBe("ok");

    // server confirmed: records exist exactly once, under the device's own ids
    expect(count(db, "visits")).toBe(serverVisits + 1);
    expect(count(db, "observations")).toBe(serverObs + 1);
    expect(count(db, "commitments")).toBe(serverComs + 1);
    expect(get(db, "SELECT id FROM visits WHERE id = ?", v.id)).toBeTruthy();
    expect(get(db, "SELECT id FROM observations WHERE id = ?", o.id)).toBeTruthy();
    expect(get(db, "SELECT id FROM commitments WHERE id = ?", c.id)).toBeTruthy();

    // and only now does the device show them as synced, with the server's version recorded
    expect((await restarted.listOutbox())).toHaveLength(0);
    const after = await restarted.getVisit(v.id);
    expect(after!.sync.state).toBe("synced");
    expect(after!.sync.serverVersion).toBe(get<{ updated_at: string }>(db, "SELECT updated_at FROM visits WHERE id = ?", v.id)!.updated_at);
    expect((await restarted.listObservations(v.id))[0].sync.state).toBe("synced");
    expect((await restarted.listCommitments(v.id))[0].sync.state).toBe("synced");
    expect((await restarted.syncSummary()).lastSyncAt).toBeTruthy();

    // syncing again changes nothing
    const again = await device.sync(restarted, { manual: true });
    expect(again.status).toBe("nothing");
    expect(count(db, "visits")).toBe(serverVisits + 1);
  });

  it("'synced' is never shown before the server answers (the record is still pending while the request is in flight)", async () => {
    const { device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    let during: string | undefined;
    device.faults.onRequest = async (path) => {
      if (path.startsWith("/sync/push")) during = (await store.getVisit(v.id))!.sync.state;
    };
    await device.sync(store);
    expect(during).toBe("pending");
    expect((await store.getVisit(v.id))!.sync.state).toBe("synced");
  });

  it("records created online and cached stay readable offline after a restart", async () => {
    const { factory, device, store } = await setup();
    const visits = await store.listVisits();
    expect(visits.length).toBeGreaterThan(0);
    expect(visits.every((v) => v.origin === "server" && v.sync.state === "synced")).toBe(true);
    store.close();
    device.faults.offline = true;
    const offlineStore = await openStore("demo-mentor-asha", factory);
    expect((await offlineStore.listVisits()).length).toBe(visits.length);
    expect((await offlineStore.listCards()).length).toBeGreaterThan(0);
    const withObs = visits.find(async (v) => (await offlineStore.listObservations(v.id)).length > 0);
    expect(withObs).toBeDefined();
  });
});

describe("failures never lose or duplicate records", () => {
  it("timeout after the server committed: the retry returns 'duplicate' and creates nothing twice", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    await store.saveObservation(v.id, { practice_observed: "Counting groups", evidence: "Groups of ten were made." });
    const base = { visits: count(db, "visits"), obs: count(db, "observations") };

    device.faults.dropResponseOnce = true; // server applies the batch, device never hears back
    const first = await device.sync(store);
    expect(first.status).toBe("offline");
    expect(count(db, "visits")).toBe(base.visits + 1); // the server DID commit
    expect((await store.listOutbox()).length).toBe(3);  // the device still holds every change
    // no connection is not a failure of the record: it is still just waiting on the device
    expect((await store.getVisit(v.id))!.sync.state).toBe("pending");
    expect((await store.listOutbox()).every((o) => o.status === "failed" && o.errorCode === "network")).toBe(true);

    const second = await device.sync(store, { manual: true });
    expect(second.duplicates).toBe(3);
    expect(second.applied).toBe(0);
    expect(count(db, "visits")).toBe(base.visits + 1);
    expect(count(db, "observations")).toBe(base.obs + 1);
    expect((await store.listOutbox())).toHaveLength(0);
    expect((await store.getVisit(v.id))!.sync.state).toBe("synced");
  });

  it("an app crash while a request was in flight: the change is queued again and applied once", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    const [op] = await store.listOutbox();
    await store.markInflight([op.opId], new Date().toISOString()); // the tab died here
    const before = count(db, "visits");
    await device.sync(store);
    await device.sync(store, { manual: true });
    expect(count(db, "visits")).toBe(before + 1);
    expect((await store.getVisit(v.id))!.sync.state).toBe("synced");
  });

  it("partial sync: when the connection drops after the first batch, the rest stays queued and finishes later without duplicates", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const n = MAX_BATCH + 5;
    for (let i = 0; i < n; i++) await store.saveObservation(v.id, { practice_observed: `Observation number ${i}`, evidence: `Evidence number ${i}` });
    let pushes = 0;
    device.faults.onRequest = (path) => { if (path.startsWith("/sync/push") && ++pushes === 2) { device.faults.offline = true; throw new TypeError("Failed to fetch"); } };
    const first = await device.sync(store);
    expect(first.status).toBe("partial");
    expect(first.applied).toBe(MAX_BATCH);
    const left = await store.listOutbox();
    expect(left.length).toBe(2 + n - MAX_BATCH);
    expect(count(db, "observations")).toBeGreaterThan(0);

    device.faults.offline = false;
    device.faults.onRequest = undefined;
    const second = await device.sync(store, { manual: true });
    expect(second.status).toBe("ok");
    expect(count(db, "observations") - all(db, "SELECT id FROM observations WHERE visit_id <> ?", v.id).length).toBe(n);
    expect(await store.listOutbox()).toHaveLength(0);
  });

  it("a temporary server error keeps everything and retries later with bounded backoff (automatic sync does not hammer the server)", async () => {
    let clock = new Date("2026-03-10T08:00:00Z");
    const now = () => clock;
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    const before = count(db, "visits");
    device.faults.fail503Push = 1;
    const r1 = await device.sync(store, { now, random: () => 1 });
    expect(r1.status).toBe("offline");
    const [op] = await store.listOutbox();
    expect(op.status).toBe("failed");
    expect(op.retryCount).toBe(1);
    expect(op.nextAttemptAt).toBe(new Date(clock.getTime() + 2000).toISOString());
    expect((await store.getVisit(v.id))!.sync.state).toBe("failed");
    expect(count(db, "visits")).toBe(before);

    device.faults.seen.length = 0;
    await device.sync(store, { now, random: () => 1 }); // not due yet
    expect(device.faults.seen.filter((s) => s.includes("/sync/push"))).toHaveLength(0);
    clock = new Date(clock.getTime() + 2500);
    const r2 = await device.sync(store, { now, random: () => 1 }); // due now
    expect(r2.status).toBe("ok");
    expect((await store.getVisit(v.id))!.sync.state).toBe("synced");
    expect(count(db, "visits")).toBe(before + 1);
  });

  it("backoff grows exponentially, has jitter, and is capped", () => {
    expect(backoffMs(1, () => 1)).toBe(2000);
    expect(backoffMs(2, () => 1)).toBe(4000);
    expect(backoffMs(5, () => 1)).toBe(32000);
    expect(backoffMs(30, () => 1)).toBe(300000);
    expect(backoffMs(3, () => 0)).toBe(4000); // half of 8000
    const s = new Set(Array.from({ length: 20 }, () => backoffMs(4)));
    expect(s.size).toBeGreaterThan(1);
  });

  it("a rate-limit answer (429) is honoured: the retry time is at least Retry-After", async () => {
    const clock = new Date("2026-03-10T08:00:00Z");
    const { device, store, school } = await setup();
    await store.createVisit(visitInput(school.id));
    device.faults.rateLimitOnce = 90;
    await device.sync(store, { now: () => clock, random: () => 0 });
    const [op] = await store.listOutbox();
    expect(op.status).toBe("failed");
    expect(op.errorCode).toBe("rate_limited");
    expect(new Date(op.nextAttemptAt!).getTime() - clock.getTime()).toBeGreaterThanOrEqual(90_000);
  });
});

describe("the server refuses something: it stays visible and recoverable", () => {
  it("a rejected visit keeps its dependent changes held back, other visits still sync, and the user can discard it", async () => {
    const { db, device, store, school } = await setup();
    const bad = await store.createVisit(visitInput(school.id, { teacher_alias: "T-bad" }));
    await store.transitionVisit(bad.id, "in_progress");
    await store.saveObservation(bad.id, { practice_observed: "On the bad visit", evidence: "Held back" });
    const good = await store.createVisit(visitInput(school.id, { teacher_alias: "T-good" }));
    // the school assignment is withdrawn on the server while the device is offline
    run(db, "UPDATE school_assignments SET status = 'inactive' WHERE school_id = ? AND profile_id = 'demo-mentor-asha'", school.id);
    const r = await device.sync(store);
    expect(r.rejected).toBeGreaterThan(0);
    expect((await store.getVisit(bad.id))!.sync.state).toBe("failed");
    expect((await store.getVisit(bad.id))!.sync.errorCode).toBeTruthy();
    expect(get(db, "SELECT id FROM visits WHERE id = ?", bad.id)).toBeUndefined();
    const ops = await store.listOutbox();
    expect(ops.some((o) => o.status === "rejected")).toBe(true);
    expect(ops.filter((o) => o.chain === bad.id).length).toBe(3); // nothing silently dropped
    void good;

    const rejected = ops.find((o) => o.status === "rejected")!;
    await store.discardRejected(rejected.opId); // explicit user action
    expect(await store.getVisit(bad.id)).toBeUndefined();
    expect((await store.listOutbox()).filter((o) => o.chain === bad.id)).toHaveLength(0);
  });

  it("a retried rejected change gets a fresh operation id (the server remembers the old refusal)", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    run(db, "UPDATE school_assignments SET status = 'inactive' WHERE school_id = ? AND profile_id = 'demo-mentor-asha'", school.id);
    await device.sync(store);
    const [rejected] = await store.listOutbox();
    expect(rejected.status).toBe("rejected");
    run(db, "UPDATE school_assignments SET status = 'active' WHERE school_id = ? AND profile_id = 'demo-mentor-asha'", school.id);
    await store.retryOp(rejected.opId);
    const [requeued] = await store.listOutbox();
    expect(requeued.opId).not.toBe(rejected.opId);
    await device.sync(store, { manual: true });
    expect((await store.getVisit(v.id))!.sync.state).toBe("synced");
  });
});

describe("sessions and accounts", () => {
  it("an expired session keeps every pending change and syncs after signing in again", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    const before = count(db, "visits");
    device.expireSession();
    const r = await device.sync(store);
    expect(r.status).toBe("auth_expired");
    expect(await store.listOutbox()).toHaveLength(1);
    expect((await store.getVisit(v.id))!.sync.state).toBe("pending"); // not marked failed or lost
    expect(count(db, "visits")).toBe(before);
    device.signIn();
    expect((await device.sync(store, { manual: true })).status).toBe("ok");
    expect(count(db, "visits")).toBe(before + 1);
  });

  it("another account signing in cannot push this account's queue (device and server both refuse)", async () => {
    const { db, device, store, school } = await setup();
    await store.createVisit(visitInput(school.id));
    const before = count(db, "visits");
    device.signIn("demo-mentor-rakesh"); // someone else signs in on the same phone
    const r = await device.sync(store);
    expect(r.status).toBe("account_mismatch");
    expect(device.faults.seen.some((s) => s.includes("/sync/push"))).toBe(false);
    expect(count(db, "visits")).toBe(before);
    expect(await store.listOutbox()).toHaveLength(1); // still waiting for the right account
    // and even a hand-made request is refused by the server
    const res = await device.transport.push("demo-mentor-asha", [{ op_id: crypto.randomUUID(), entity_type: "visit", entity_id: crypto.randomUUID(), op: "create", payload: {}, created_at: new Date().toISOString(), schema_version: 1 }]).catch((e) => e);
    expect(res.kind).toBe("client");
    expect(res.status).toBe(403);
  });
});

describe("two devices editing the same record", () => {
  it("surfaces a conflict with both versions, never overwrites silently, and lets the user choose", async () => {
    const db = freshDb();
    const phone = makeDevice(db, "demo-mentor-asha");
    const tablet = makeDevice(db, "demo-mentor-asha");
    const phoneStore = await openStore("demo-mentor-asha", newFactory());
    const tabletStore = await openStore("demo-mentor-asha", newFactory());
    await onlineSnapshot(phoneStore, phone);
    const school = (await phoneStore.listSchools())[0];
    const v = await phoneStore.createVisit(visitInput(school.id));
    await phoneStore.transitionVisit(v.id, "in_progress");
    const o = await phoneStore.saveObservation(v.id, { practice_observed: "Shared observation", evidence: "Original evidence text" });
    await phone.sync(phoneStore);
    await onlineSnapshot(tabletStore, tablet); // the tablet now has the same record

    await phoneStore.saveObservation(v.id, { practice_observed: "Shared observation", evidence: "Phone edit of the evidence" }, o.id);
    await tabletStore.saveObservation(v.id, { practice_observed: "Shared observation", evidence: "Tablet edit of the evidence" }, o.id);
    await phone.sync(phoneStore); // phone wins the race
    const r = await tablet.sync(tabletStore); // tablet edited the same version
    expect(r.conflicts).toBe(1);
    expect(get<{ evidence: string }>(db, "SELECT evidence FROM observations WHERE id = ?", o.id)!.evidence).toBe("Phone edit of the evidence"); // not overwritten

    const mine = (await tabletStore.listObservations(v.id))[0];
    expect(mine.sync.state).toBe("conflict");
    expect(mine.evidence).toBe("Tablet edit of the evidence"); // the tablet's text is still on the tablet
    const [conflict] = await tabletStore.listConflicts();
    expect((conflict.local as { evidence: string }).evidence).toBe("Tablet edit of the evidence");
    expect((conflict.server as { evidence: string }).evidence).toBe("Phone edit of the evidence");
    expect(JSON.stringify(conflict.server)).not.toMatch(/mentor_id|created_by/);

    // choose "keep mine": it is sent again on top of the server's version
    await tabletStore.resolveConflict(conflict.id, "mine");
    expect((await tabletStore.listConflicts())[0].resolution).toBe("mine");
    await tablet.sync(tabletStore, { manual: true });
    expect(get<{ evidence: string }>(db, "SELECT evidence FROM observations WHERE id = ?", o.id)!.evidence).toBe("Tablet edit of the evidence");
    expect((await tabletStore.listObservations(v.id))[0].sync.state).toBe("synced");
    // the phone's version is still recorded in the (resolved) conflict history, not lost
    expect((await tabletStore.listConflicts())[0].server).toMatchObject({ evidence: "Phone edit of the evidence" });
  });

  it("choosing the server's version replaces the local text and clears the queued change", async () => {
    const db = freshDb();
    const a = makeDevice(db, "demo-mentor-asha");
    const b = makeDevice(db, "demo-mentor-asha");
    const sa = await openStore("demo-mentor-asha", newFactory());
    const sb = await openStore("demo-mentor-asha", newFactory());
    await onlineSnapshot(sa, a);
    const school = (await sa.listSchools())[0];
    const v = await sa.createVisit(visitInput(school.id));
    await sa.transitionVisit(v.id, "in_progress");
    const o = await sa.saveObservation(v.id, { practice_observed: "Shared text", evidence: "Original" });
    await a.sync(sa);
    await onlineSnapshot(sb, b);
    await sa.saveObservation(v.id, { practice_observed: "Shared text", evidence: "A changed it" }, o.id);
    await sb.saveObservation(v.id, { practice_observed: "Shared text", evidence: "B changed it" }, o.id);
    await a.sync(sa);
    await b.sync(sb);
    const [c] = await sb.listConflicts();
    await sb.resolveConflict(c.id, "server");
    const now = (await sb.listObservations(v.id))[0];
    expect(now.evidence).toBe("A changed it");
    expect(now.sync.state).toBe("synced");
    expect(await sb.listOutbox()).toHaveLength(0);
    expect((await sb.listConflicts())[0].local).toMatchObject({ evidence: "B changed it" }); // B's text is kept in the history
  });

  it("an approved-feedback lock on the server is reported as a refusal, not silently overwritten", async () => {
    const { db, device, store, school } = await setup();
    const v = await store.createVisit(visitInput(school.id));
    await store.transitionVisit(v.id, "in_progress");
    const o = await store.saveObservation(v.id, { practice_observed: "Observed text", evidence: "Evidence text" });
    await device.sync(store);
    // feedback is approved elsewhere: evidence behind it is locked
    run(db, "INSERT INTO feedback_drafts (id, visit_id, seq, status, language, strength, priority_practice, next_step, provider, is_simulated, mentor_edited, approved_by, approved_at, created_by, created_at, updated_at) VALUES (?, ?, 1, 'approved', 'en', 'a', 'b', 'c', 'demo', 1, 0, 'demo-mentor-asha', ?, 'demo-mentor-asha', ?, ?)", crypto.randomUUID(), v.id, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    await store.saveObservation(v.id, { practice_observed: "Observed text", evidence: "Late edit on the phone" }, o.id);
    const r = await device.sync(store, { manual: true });
    expect(r.rejected).toBe(1);
    const rec = (await store.listObservations(v.id))[0];
    expect(rec.evidence).toBe("Late edit on the phone"); // the mentor's words are still on the device
    expect(rec.sync.state).toBe("failed");
    expect(rec.sync.errorCode).toBe("feedback_already_approved");
    expect(get<{ evidence: string }>(db, "SELECT evidence FROM observations WHERE id = ?", o.id)!.evidence).toBe("Evidence text");
  });
});
