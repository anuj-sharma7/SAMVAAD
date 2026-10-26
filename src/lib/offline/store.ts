import { dbNameFor, deleteDb, MIGRATIONS, openDb, type Migration } from "./db";
import { inTx, uuid, wrap } from "./idb";
import {
  commitmentInput, observationInput, visitInput, type CommitmentInput, type ObservationInput, type VisitInput,
} from "./validation";
import type {
  ConflictRecord, EntityType, LocalCard, LocalCommitment, LocalObservation, LocalSchool, LocalVisit, OpKind, OutboxOp,
  Snapshot, SyncLogEntry, SyncMeta, SyncState, VisitStatus,
} from "./types";
import { StorageError } from "./types";

export interface StoreOptions {
  factory?: IDBFactory;
  migrations?: Migration[];
  now?: () => Date;
}

export class LocalConflictError extends Error {
  constructor(message = "This record has a conflict that needs review before it can be edited.") {
    super(message);
    this.name = "LocalConflictError";
  }
}
export class LocalRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "LocalRuleError";
  }
}

const LOG_LIMIT = 200;
type AnyEntity = LocalVisit | LocalObservation | LocalCommitment;
/** Fields a local record may hold. A server row can carry more (ids of other people, internal columns); those never reach the device. */
const ALLOWED: Record<EntityType, string[]> = {
  visit: ["id", "school_id", "teacher_alias", "scheduled_at", "grade", "subject", "language", "purpose", "coaching_focus", "prep_notes", "previous_commitment_id", "observation_method", "status", "created_at", "updated_at"],
  observation: ["id", "visit_id", "practice_observed", "evidence", "worked_well", "improvement_area", "context_note", "created_at", "updated_at"],
  commitment: ["id", "visit_id", "action_text", "owner_role", "owner_alias", "target_date", "expected_evidence", "status", "created_at", "updated_at"],
};
const pick = (type: EntityType, rec: Record<string, unknown>) => Object.fromEntries(Object.entries(rec).filter(([k]) => ALLOWED[type].includes(k)));

const STORE_OF = { visit: "visits", observation: "observations", commitment: "commitments" } as const;

/**
 * The on-device database for ONE account. Every write that must reach the server is saved TOGETHER with its outbox entry in a
 * single IndexedDB transaction, so there is never a saved record without a queued change, or a queued change without a record.
 * A method resolves (and the UI may say "Saved on this device") only after the transaction has committed.
 */
export class LocalStore {
  private listeners = new Set<() => void>();
  private constructor(
    readonly accountId: string,
    private db: IDBDatabase,
    private factory: IDBFactory,
    private now: () => Date,
  ) {}

  static async open(accountId: string, opts: StoreOptions = {}): Promise<LocalStore> {
    const factory = opts.factory ?? indexedDB;
    const db = await openDb(dbNameFor(accountId), opts.migrations ?? MIGRATIONS, factory);
    const store = new LocalStore(accountId, db, factory, opts.now ?? (() => new Date()));
    const owner = await store.getMeta<string>("accountId");
    if (owner && owner !== accountId) {
      db.close();
      throw new StorageError("corrupt", "This local database belongs to a different account.");
    }
    if (!owner) await store.setMeta("accountId", accountId);
    return store;
  }

  close() { this.db.close(); }
  get iso() { return this.now().toISOString(); }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() { for (const l of [...this.listeners]) l(); }

  // ---- meta -----------------------------------------------------------------------------------------------------------
  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await inTx(this.db, ["meta"], "readonly", (tx) => wrap(tx.objectStore("meta").get(key)));
    return (row as { value: T } | undefined)?.value;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    await inTx(this.db, ["meta"], "readwrite", async (tx) => { await wrap(tx.objectStore("meta").put({ key, value })); });
  }

  // ---- reads ----------------------------------------------------------------------------------------------------------
  private all<T>(store: string): Promise<T[]> {
    return inTx(this.db, [store], "readonly", (tx) => wrap(tx.objectStore(store).getAll() as IDBRequest<T[]>));
  }
  listSchools() { return this.all<LocalSchool>("schools"); }
  listCards() { return this.all<LocalCard>("cards"); }
  async listVisits(): Promise<LocalVisit[]> {
    const v = await this.all<LocalVisit>("visits");
    return v.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  }
  async getVisit(id: string): Promise<LocalVisit | undefined> {
    return inTx(this.db, ["visits"], "readonly", (tx) => wrap(tx.objectStore("visits").get(id) as IDBRequest<LocalVisit | undefined>));
  }
  async listObservations(visitId: string): Promise<LocalObservation[]> {
    const rows = await inTx(this.db, ["observations"], "readonly", (tx) => wrap(tx.objectStore("observations").index("byVisit").getAll(visitId) as IDBRequest<LocalObservation[]>));
    return rows.filter((o) => !o.deleted).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async listCommitments(visitId: string): Promise<LocalCommitment[]> {
    const rows = await inTx(this.db, ["commitments"], "readonly", (tx) => wrap(tx.objectStore("commitments").index("byVisit").getAll(visitId) as IDBRequest<LocalCommitment[]>));
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  /** Open commitments (any visit) for a school and teacher alias, used to remind the mentor at the next visit. */
  async openCommitmentsFor(schoolId: string, alias: string): Promise<(LocalCommitment & { visit_date: string })[]> {
    const visits = (await this.listVisits()).filter((v) => v.school_id === schoolId && v.teacher_alias.toLowerCase() === alias.trim().toLowerCase());
    const out: (LocalCommitment & { visit_date: string })[] = [];
    for (const v of visits) for (const c of await this.listCommitments(v.id)) if (c.status === "open" || c.status === "completed") out.push({ ...c, visit_date: v.scheduled_at });
    return out.sort((a, b) => a.target_date.localeCompare(b.target_date));
  }
  listOutbox(): Promise<OutboxOp[]> {
    return this.all<OutboxOp>("outbox").then((r) => r.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)));
  }
  listConflicts(): Promise<ConflictRecord[]> { return this.all<ConflictRecord>("conflicts"); }
  async listSyncLog(): Promise<SyncLogEntry[]> {
    const rows = await this.all<SyncLogEntry>("syncLog");
    return rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  /** Counts for the Sync Center and status bar. "pending" = saved on this device and not yet acknowledged by the server. */
  async syncSummary() {
    const ops = await this.listOutbox();
    const by = (s: OutboxOp["status"]) => ops.filter((o) => o.status === s).length;
    const records = new Set(ops.map((o) => `${o.entityType}:${o.entityId}`));
    return {
      pendingOps: ops.length,
      pendingRecords: records.size,
      queued: by("queued") + by("inflight"),
      failed: by("failed"),
      rejected: by("rejected"),
      conflicts: by("conflict"),
      needsAttention: by("rejected") + by("conflict"),
      lastSyncAt: (await this.getMeta<string>("lastSyncAt")) ?? null,
      lastPullAt: (await this.getMeta<string>("lastPullAt")) ?? null,
    };
  }

  // ---- internal write helpers (must be called inside a readwrite transaction that includes these stores) ----------------
  private meta(prev: SyncMeta | null, state: SyncState = "pending"): SyncMeta {
    return {
      state,
      localUpdatedAt: this.iso,
      serverVersion: prev?.serverVersion ?? null,
      confirmedAt: prev?.confirmedAt ?? null,
    };
  }

  /** Queue an operation, merging into a not-yet-sent create/update of the same record (so a record edited five times offline sends one change). */
  private async queue(
    tx: IDBTransaction,
    o: { entityType: EntityType; entityId: string; op: OpKind; payload: Record<string, unknown>; chain: string },
  ): Promise<void> {
    const outbox = tx.objectStore("outbox");
    const existing = (await wrap(outbox.index("byEntity").getAll(o.entityId) as IDBRequest<OutboxOp[]>)).filter((x) => x.entityType === o.entityType);
    if (existing.some((x) => x.status === "conflict")) throw new LocalConflictError();
    if (o.op === "update") {
      const target = [...existing].reverse().find((x) => (x.op === "create" || x.op === "update") && x.status !== "inflight");
      const lastIsInflight = existing.length > 0 && existing[existing.length - 1].status === "inflight";
      if (target && !lastIsInflight) {
        const revived: OutboxOp = {
          ...target,
          payload: { ...target.payload, ...o.payload },
          // the server remembers a rejected op id, so a corrected change needs a fresh id
          opId: target.status === "rejected" ? uuid() : target.opId,
          status: "queued", retryCount: 0, nextAttemptAt: null, errorCode: undefined, errorMessage: undefined,
        };
        await wrap(outbox.put(revived));
        return;
      }
    }
    if (o.op === "delete") {
      const created = existing.find((x) => x.op === "create");
      if (created && created.status !== "inflight") {
        // Never reached the server: forget it completely.
        for (const x of existing) await wrap(outbox.delete(x.seq!));
        return;
      }
    }
    const op: OutboxOp = {
      opId: uuid(), entityType: o.entityType, entityId: o.entityId, op: o.op, payload: o.payload, chain: o.chain, schemaVersion: 1,
      createdAt: this.iso, lastAttemptAt: null, nextAttemptAt: null, retryCount: 0, status: "queued",
    };
    await wrap(outbox.add(op));
  }

  // ---- visits ---------------------------------------------------------------------------------------------------------
  async createVisit(input: unknown): Promise<LocalVisit> {
    const d = visitInput.parse(input);
    const id = uuid();
    const visit: LocalVisit = {
      id, school_id: d.school_id, teacher_alias: d.teacher_alias, scheduled_at: d.scheduled_at, grade: d.grade, subject: d.subject,
      language: d.language, purpose: d.purpose, coaching_focus: d.coaching_focus ?? null, prep_notes: d.prep_notes ?? null,
      previous_commitment_id: d.previous_commitment_id ?? null, observation_method: "text", status: "planned",
      created_at: this.iso, origin: "local", sync: this.meta(null),
    };
    await inTx(this.db, ["visits", "outbox", "schools"], "readwrite", async (tx) => {
      const school = await wrap(tx.objectStore("schools").get(d.school_id));
      if (!school) throw new LocalRuleError("unknown_school", "Choose one of your assigned schools.");
      await wrap(tx.objectStore("visits").put(visit));
      await this.queue(tx, { entityType: "visit", entityId: id, op: "create", chain: id, payload: this.visitPayload(visit) });
    });
    this.emit();
    return visit;
  }

  private visitPayload(v: LocalVisit): Record<string, unknown> {
    return {
      school_id: v.school_id, teacher_alias: v.teacher_alias, scheduled_at: v.scheduled_at, grade: v.grade, subject: v.subject, language: v.language,
      purpose: v.purpose, coaching_focus: v.coaching_focus ?? "", prep_notes: v.prep_notes ?? "", previous_commitment_id: v.previous_commitment_id ?? "",
      observation_method: v.observation_method,
    };
  }

  async updateVisit(id: string, patch: Partial<VisitInput>): Promise<LocalVisit> {
    const next = await inTx(this.db, ["visits", "outbox"], "readwrite", async (tx) => {
      const cur = (await wrap(tx.objectStore("visits").get(id))) as LocalVisit | undefined;
      if (!cur) throw new LocalRuleError("not_found", "That visit is not on this device.");
      if (cur.status !== "draft" && cur.status !== "planned") throw new LocalRuleError("visit_locked", "Visit details cannot be changed once the visit has started.");
      const merged = visitInput.parse({ ...cur, ...patch });
      const visit: LocalVisit = {
        ...cur, teacher_alias: merged.teacher_alias, scheduled_at: merged.scheduled_at, grade: merged.grade, subject: merged.subject, language: merged.language,
        purpose: merged.purpose, coaching_focus: merged.coaching_focus ?? null, prep_notes: merged.prep_notes ?? null, sync: this.meta(cur.sync),
      };
      await wrap(tx.objectStore("visits").put(visit));
      const { school_id: _s, previous_commitment_id: _p, ...updatable } = this.visitPayload(visit); // eslint-disable-line @typescript-eslint/no-unused-vars
      await this.queue(tx, { entityType: "visit", entityId: id, op: "update", chain: id, payload: updatable });
      return visit;
    });
    this.emit();
    return next;
  }

  /** Move a visit forward (planned → in progress → pending review). Same lifecycle the server enforces. */
  async transitionVisit(id: string, to: Extract<VisitStatus, "in_progress" | "pending_review">): Promise<LocalVisit> {
    const next = await inTx(this.db, ["visits", "outbox", "observations"], "readwrite", async (tx) => {
      const cur = (await wrap(tx.objectStore("visits").get(id))) as LocalVisit | undefined;
      if (!cur) throw new LocalRuleError("not_found", "That visit is not on this device.");
      const allowed = (cur.status === "draft" || cur.status === "planned") && to === "in_progress" || cur.status === "in_progress" && to === "pending_review" || cur.status === "pending_review" && to === "in_progress";
      if (!allowed) throw new LocalRuleError("invalid_transition", `A visit that is ${cur.status.replace("_", " ")} cannot move to ${to.replace("_", " ")}.`);
      if (to === "pending_review") {
        const obs = ((await wrap(tx.objectStore("observations").index("byVisit").getAll(id))) as LocalObservation[]).filter((o) => !o.deleted);
        if (obs.length === 0) throw new LocalRuleError("no_observations", "Add at least one observation before sending the visit for review.");
      }
      const visit: LocalVisit = { ...cur, status: to, sync: this.meta(cur.sync) };
      await wrap(tx.objectStore("visits").put(visit));
      await this.queue(tx, { entityType: "visit", entityId: id, op: "transition", chain: id, payload: { to } });
      return visit;
    });
    this.emit();
    return next;
  }

  // ---- observations ---------------------------------------------------------------------------------------------------
  async saveObservation(visitId: string, input: unknown, existingId?: string): Promise<LocalObservation> {
    const d: ObservationInput = observationInput.parse(input);
    const saved = await inTx(this.db, ["visits", "observations", "outbox"], "readwrite", async (tx) => {
      const visit = (await wrap(tx.objectStore("visits").get(visitId))) as LocalVisit | undefined;
      if (!visit) throw new LocalRuleError("not_found", "That visit is not on this device.");
      if (visit.status !== "in_progress" && visit.status !== "pending_review") {
        throw new LocalRuleError("visit_not_observable", visit.status === "completed" ? "This visit is completed and read-only." : "Start the visit before adding observations.");
      }
      const prev = existingId ? ((await wrap(tx.objectStore("observations").get(existingId))) as LocalObservation | undefined) : undefined;
      if (existingId && !prev) throw new LocalRuleError("not_found", "That observation is not on this device.");
      const id = existingId ?? uuid();
      const obs: LocalObservation = {
        id, visit_id: visitId, practice_observed: d.practice_observed, evidence: d.evidence, worked_well: d.worked_well ?? null,
        improvement_area: d.improvement_area ?? null, context_note: d.context_note ?? null,
        created_at: prev?.created_at ?? this.iso, origin: prev?.origin ?? "local", sync: this.meta(prev?.sync ?? null),
      };
      const payload = { visit_id: visitId, practice_observed: obs.practice_observed, evidence: obs.evidence, worked_well: obs.worked_well ?? "", improvement_area: obs.improvement_area ?? "", context_note: obs.context_note ?? "" };
      await this.queue(tx, { entityType: "observation", entityId: id, op: prev ? "update" : "create", chain: visitId, payload });
      await wrap(tx.objectStore("observations").put(obs));
      return obs;
    });
    this.emit();
    return saved;
  }

  async deleteObservation(id: string): Promise<void> {
    await inTx(this.db, ["observations", "outbox"], "readwrite", async (tx) => {
      const cur = (await wrap(tx.objectStore("observations").get(id))) as LocalObservation | undefined;
      if (!cur) return;
      const existing = (await wrap(tx.objectStore("outbox").index("byEntity").getAll(id))) as OutboxOp[];
      const neverSent = existing.some((x) => x.op === "create" && x.status !== "inflight");
      await this.queue(tx, { entityType: "observation", entityId: id, op: "delete", chain: cur.visit_id, payload: {} });
      if (neverSent) await wrap(tx.objectStore("observations").delete(id));
      else await wrap(tx.objectStore("observations").put({ ...cur, deleted: true, sync: this.meta(cur.sync) }));
    });
    this.emit();
  }

  // ---- commitments ----------------------------------------------------------------------------------------------------
  async saveCommitment(visitId: string, input: unknown, existingId?: string): Promise<LocalCommitment> {
    const d: CommitmentInput = commitmentInput.parse(input);
    const saved = await inTx(this.db, ["visits", "commitments", "outbox"], "readwrite", async (tx) => {
      const visit = (await wrap(tx.objectStore("visits").get(visitId))) as LocalVisit | undefined;
      if (!visit) throw new LocalRuleError("not_found", "That visit is not on this device.");
      if (visit.status === "completed") throw new LocalRuleError("visit_locked", "This visit is completed and read-only.");
      if (visit.status === "draft" || visit.status === "planned") throw new LocalRuleError("visit_not_started", "Start the visit before agreeing a next step.");
      const day = Math.round((new Date(d.target_date).getTime() - new Date(visit.scheduled_at.slice(0, 10)).getTime()) / 86_400_000);
      if (day < 0) throw new LocalRuleError("target_before_visit", "The target date cannot be before the visit date.");
      if (day > 180) throw new LocalRuleError("target_too_far", "The target date should be within 180 days of the visit.");
      const others = ((await wrap(tx.objectStore("commitments").index("byVisit").getAll(visitId))) as LocalCommitment[]).filter((c) => c.status !== "cancelled" && c.id !== existingId);
      if (others.length) throw new LocalRuleError("commitment_exists", "A next step has already been agreed for this visit.");
      const prev = existingId ? ((await wrap(tx.objectStore("commitments").get(existingId))) as LocalCommitment | undefined) : undefined;
      if (existingId && !prev) throw new LocalRuleError("not_found", "That next step is not on this device.");
      if (prev && (prev.status === "reviewed" || prev.status === "cancelled")) throw new LocalRuleError("commitment_locked", "This next step can no longer be changed.");
      const id = existingId ?? uuid();
      const c: LocalCommitment = {
        id, visit_id: visitId, action_text: d.action_text, owner_role: d.owner_role, owner_alias: visit.teacher_alias, target_date: d.target_date,
        expected_evidence: d.expected_evidence, status: prev?.status ?? "open", created_at: prev?.created_at ?? this.iso,
        origin: prev?.origin ?? "local", sync: this.meta(prev?.sync ?? null),
      };
      const payload = prev
        ? { action_text: c.action_text, target_date: c.target_date, expected_evidence: c.expected_evidence }
        : { visit_id: visitId, action_text: c.action_text, owner_role: c.owner_role, owner_alias: c.owner_alias, target_date: c.target_date, expected_evidence: c.expected_evidence };
      await this.queue(tx, { entityType: "commitment", entityId: id, op: prev ? "update" : "create", chain: visitId, payload });
      await wrap(tx.objectStore("commitments").put(c));
      return c;
    });
    this.emit();
    return saved;
  }

  // ---- snapshot (server → device) -------------------------------------------------------------------------------------
  /**
   * Merge a server snapshot. Anything with unsent local changes is left exactly as the device has it (the server compares versions
   * when those changes are pushed, and reports a conflict instead of overwriting). Everything already confirmed is refreshed.
   */
  async applySnapshot(snap: Snapshot): Promise<{ visits: number; observations: number; commitments: number }> {
    const counts = { visits: 0, observations: 0, commitments: 0 };
    await inTx(this.db, ["meta", "schools", "cards", "visits", "observations", "commitments", "outbox"], "readwrite", async (tx) => {
      const confirmed = (updated: string): SyncMeta => ({ state: "synced", localUpdatedAt: updated, serverVersion: updated, confirmedAt: snap.server_time });
      const busy = new Set(((await wrap(tx.objectStore("outbox").getAll())) as OutboxOp[]).map((o) => `${o.entityType}:${o.entityId}`));

      await wrap(tx.objectStore("schools").clear());
      for (const s of snap.schools) await wrap(tx.objectStore("schools").put(s));
      await wrap(tx.objectStore("cards").clear());
      for (const c of snap.cards) await wrap(tx.objectStore("cards").put(c));

      for (const v of snap.visits) {
        if (busy.has(`visit:${v.id}`)) continue;
        const { updated_at, started_at: _a, completed_at: _b, ...rest } = v; // eslint-disable-line @typescript-eslint/no-unused-vars
        await wrap(tx.objectStore("visits").put({ ...rest, origin: "server", sync: confirmed(updated_at) } satisfies LocalVisit));
        counts.visits++;
      }
      const visitIdsInSnapshot = new Set(snap.visits.map((v) => v.id));
      const serverObs = new Map(snap.observations.map((o) => [o.id, o]));
      const localObs = (await wrap(tx.objectStore("observations").getAll())) as LocalObservation[];
      for (const o of snap.observations) {
        if (busy.has(`observation:${o.id}`)) continue;
        const { updated_at, ...rest } = o;
        await wrap(tx.objectStore("observations").put({ ...rest, origin: "server", sync: confirmed(updated_at) } satisfies LocalObservation));
        counts.observations++;
      }
      for (const lo of localObs) {
        // confirmed earlier, gone from the server now (deleted on another device): remove, unless we still have unsent changes for it
        if (lo.sync.state === "synced" && !serverObs.has(lo.id) && visitIdsInSnapshot.has(lo.visit_id) && !busy.has(`observation:${lo.id}`)) {
          await wrap(tx.objectStore("observations").delete(lo.id));
        }
      }
      for (const c of snap.commitments) {
        if (busy.has(`commitment:${c.id}`)) continue;
        const { updated_at, feedback_id: _f, review_visit_id: _r, review_outcome: _o, review_evidence: _e, review_barriers: _b, reviewed_at: _t, completed_at: _c, ...rest } = c as typeof c & Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
        await wrap(tx.objectStore("commitments").put({ ...(rest as Omit<LocalCommitment, "sync" | "origin">), origin: "server", sync: confirmed(updated_at) } satisfies LocalCommitment));
        counts.commitments++;
      }
      await wrap(tx.objectStore("meta").put({ key: "lastPullAt", value: snap.server_time }));
      await wrap(tx.objectStore("meta").put({ key: "account", value: snap.account }));
    });
    this.emit();
    return counts;
  }

  // ---- outbox processing (used by the sync engine) ---------------------------------------------------------------------
  /** Operations that were in flight when the app was closed or crashed go back to the queue (the server de-duplicates by op id). */
  async resetInflight(): Promise<number> {
    let n = 0;
    await inTx(this.db, ["outbox"], "readwrite", async (tx) => {
      const ops = (await wrap(tx.objectStore("outbox").getAll())) as OutboxOp[];
      for (const o of ops) if (o.status === "inflight") { n++; await wrap(tx.objectStore("outbox").put({ ...o, status: "queued" })); }
    });
    if (n) this.emit();
    return n;
  }

  /**
   * Next operations to send, oldest first. A visit's operations are strictly ordered: if one of them needs the user's attention
   * (rejected, conflict) or is waiting for its retry time, everything after it on that visit is held back.
   */
  async nextBatch(now: Date, manual: boolean, limit: number): Promise<{ op: OutboxOp; expected: string | undefined }[]> {
    const ops = await this.listOutbox();
    const held = new Set<string>();
    const touched = new Set<string>();
    const batch: { op: OutboxOp; expected: string | undefined }[] = [];
    for (const o of ops) {
      if (held.has(o.chain)) continue;
      if (o.status === "rejected" || o.status === "conflict" || o.status === "inflight") { held.add(o.chain); continue; }
      if (o.status === "failed" && !manual && o.nextAttemptAt && o.nextAttemptAt > now.toISOString()) { held.add(o.chain); continue; }
      if (batch.length >= limit) break;
      let expected: string | undefined;
      if (o.op === "update") {
        const key = `${o.entityType}:${o.entityId}`;
        if (!touched.has(key)) {
          const ent = (await this.entity(o.entityType, o.entityId)) as AnyEntity | undefined;
          expected = ent?.sync.serverVersion ?? undefined;
        }
      }
      touched.add(`${o.entityType}:${o.entityId}`);
      batch.push({ op: o, expected });
    }
    return batch;
  }

  private entity(type: EntityType, id: string) {
    return inTx(this.db, [STORE_OF[type]], "readonly", (tx) => wrap(tx.objectStore(STORE_OF[type]).get(id)));
  }

  async markInflight(opIds: string[], at: string): Promise<void> {
    await inTx(this.db, ["outbox"], "readwrite", async (tx) => {
      const idx = tx.objectStore("outbox").index("byOpId");
      for (const id of opIds) {
        const o = (await wrap(idx.get(id))) as OutboxOp | undefined;
        if (o) await wrap(tx.objectStore("outbox").put({ ...o, status: "inflight", lastAttemptAt: at }));
      }
    });
    this.emit();
  }

  /** The request never got a verdict (for example the session expired): put the operations back unchanged, without counting a failed attempt. */
  async releaseInflight(opIds: string[]): Promise<void> {
    await inTx(this.db, ["outbox"], "readwrite", async (tx) => {
      const idx = tx.objectStore("outbox").index("byOpId");
      for (const id of opIds) {
        const o = (await wrap(idx.get(id))) as OutboxOp | undefined;
        if (o && o.status === "inflight") await wrap(tx.objectStore("outbox").put({ ...o, status: "queued" }));
      }
    });
    this.emit();
  }

  /** Whole request failed (offline, timeout, server error): keep every operation, schedule bounded retries. */
  async markFailed(opIds: string[], code: string, nextAttemptAt: string | null): Promise<void> {
    await inTx(this.db, ["outbox", "visits", "observations", "commitments", "syncLog"], "readwrite", async (tx) => {
      const idx = tx.objectStore("outbox").index("byOpId");
      for (const id of opIds) {
        const o = (await wrap(idx.get(id))) as OutboxOp | undefined;
        if (!o) continue;
        await wrap(tx.objectStore("outbox").put({ ...o, status: "failed", retryCount: o.retryCount + 1, nextAttemptAt, errorCode: code, errorMessage: undefined }));
        await this.refreshEntity(tx, o.entityType, o.entityId);
      }
      await this.log(tx, { at: this.iso, opId: null, entityType: null, result: "failed", code });
    });
    this.emit();
  }

  /** Record the server's per-operation answers. An operation leaves the outbox ONLY when the server applied it (or already had it). */
  async applyResults(
    sent: OutboxOp[],
    results: { op_id: string; status: string; server_version?: string; server_record?: Record<string, unknown>; code?: string; message?: string }[],
    nextAttemptAt: (retry: number) => string,
  ): Promise<{ applied: number; duplicates: number; conflicts: number; rejected: number; skipped: number; failed: number }> {
    const tally = { applied: 0, duplicates: 0, conflicts: 0, rejected: 0, skipped: 0, failed: 0 };
    await inTx(this.db, ["outbox", "visits", "observations", "commitments", "conflicts", "syncLog"], "readwrite", async (tx) => {
      const byId = new Map(results.map((r) => [r.op_id, r]));
      for (const sentOp of sent) {
        const cur = (await wrap(tx.objectStore("outbox").index("byOpId").get(sentOp.opId))) as OutboxOp | undefined;
        if (!cur) continue;
        const r = byId.get(cur.opId);
        if (!r) { // the server did not answer for this op: treat as not applied
          await wrap(tx.objectStore("outbox").put({ ...cur, status: "failed", retryCount: cur.retryCount + 1, nextAttemptAt: nextAttemptAt(cur.retryCount + 1), errorCode: "no_answer" }));
          tally.failed++;
          await this.refreshEntity(tx, cur.entityType, cur.entityId);
          continue;
        }
        const now = this.iso;
        if (r.status === "applied" || r.status === "duplicate") {
          await wrap(tx.objectStore("outbox").delete(cur.seq!));
          const store = STORE_OF[cur.entityType];
          const ent = (await wrap(tx.objectStore(store).get(cur.entityId))) as AnyEntity | undefined;
          if (cur.op === "delete") {
            if (ent) await wrap(tx.objectStore(store).delete(cur.entityId));
          } else if (ent && r.server_version) {
            await wrap(tx.objectStore(store).put({ ...ent, sync: { ...ent.sync, serverVersion: r.server_version, confirmedAt: now } }));
          }
          if (r.status === "applied") tally.applied++;
          else tally.duplicates++;
        } else if (r.status === "conflict") {
          await wrap(tx.objectStore("outbox").put({ ...cur, status: "conflict", errorCode: r.code ?? "stale_edit", errorMessage: undefined }));
          const ent = (await wrap(tx.objectStore(STORE_OF[cur.entityType]).get(cur.entityId))) as AnyEntity | undefined;
          const { sync: _s, ...local } = (ent ?? {}) as AnyEntity; // eslint-disable-line @typescript-eslint/no-unused-vars
          const rec: ConflictRecord = { id: uuid(), opId: cur.opId, entityType: cur.entityType, entityId: cur.entityId, local: local as Record<string, unknown>, server: pick(cur.entityType, r.server_record ?? {}), detectedAt: now, resolvedAt: null, resolution: null };
          await wrap(tx.objectStore("conflicts").put(rec));
          tally.conflicts++;
        } else if (r.status === "rejected") {
          await wrap(tx.objectStore("outbox").put({ ...cur, status: "rejected", errorCode: r.code ?? "rejected", errorMessage: r.message?.slice(0, 200) }));
          tally.rejected++;
        } else if (r.status === "skipped") {
          await wrap(tx.objectStore("outbox").put({ ...cur, status: "queued" }));
          tally.skipped++;
        } else {
          await wrap(tx.objectStore("outbox").put({ ...cur, status: "failed", retryCount: cur.retryCount + 1, nextAttemptAt: nextAttemptAt(cur.retryCount + 1), errorCode: r.code ?? "server_error" }));
          tally.failed++;
        }
        await this.refreshEntity(tx, cur.entityType, cur.entityId);
        await this.log(tx, { at: now, opId: cur.opId, entityType: cur.entityType, result: r.status, code: r.code });
      }
    });
    this.emit();
    return tally;
  }

  /** Recompute a record's displayed sync state from what is still waiting in the outbox. */
  private async refreshEntity(tx: IDBTransaction, type: EntityType, id: string): Promise<void> {
    const store = STORE_OF[type];
    const ent = (await wrap(tx.objectStore(store).get(id))) as AnyEntity | undefined;
    if (!ent) return;
    const ops = (await wrap(tx.objectStore("outbox").index("byEntity").getAll(id))) as OutboxOp[];
    const mine = ops.filter((o) => o.entityType === type);
    let state: SyncState = "synced";
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    if (mine.length) {
      const conflict = mine.find((o) => o.status === "conflict");
      // "No connection" is not a failure of the record: it is simply still waiting (pending). "Sync failed" is for a server error or a refusal.
      const bad = mine.find((o) => o.status === "rejected" || (o.status === "failed" && o.errorCode !== "network"));
      if (conflict) { state = "conflict"; errorCode = conflict.errorCode; }
      else if (bad) { state = "failed"; errorCode = bad.errorCode; errorMessage = bad.errorMessage; }
      else state = "pending";
    }
    const sync: SyncMeta = { ...ent.sync, state, errorCode, errorMessage, confirmedAt: state === "synced" ? ent.sync.confirmedAt : ent.sync.confirmedAt };
    await wrap(tx.objectStore(store).put({ ...ent, sync }));
  }

  private async log(tx: IDBTransaction, entry: SyncLogEntry): Promise<void> {
    const s = tx.objectStore("syncLog");
    await wrap(s.add(entry));
    const n = await wrap(s.count());
    if (n > LOG_LIMIT) {
      const first = await wrap(s.openCursor());
      if (first) await wrap(first.delete() as IDBRequest);
    }
  }

  async setLastSync(at: string) { await this.setMeta("lastSyncAt", at); this.emit(); }

  // ---- conflicts and rejected changes ---------------------------------------------------------------------------------
  /**
   * Resolve a conflict. "mine": keep the device's version and send it again on top of the server's current version.
   * "server": take the server's version. The other version stays in the conflict record (marked resolved), never silently lost.
   */
  async resolveConflict(conflictId: string, choice: "mine" | "server"): Promise<void> {
    await inTx(this.db, ["conflicts", "outbox", "visits", "observations", "commitments", "syncLog"], "readwrite", async (tx) => {
      const c = (await wrap(tx.objectStore("conflicts").get(conflictId))) as ConflictRecord | undefined;
      if (!c || c.resolvedAt) return;
      const store = STORE_OF[c.entityType];
      const ent = (await wrap(tx.objectStore(store).get(c.entityId))) as AnyEntity | undefined;
      const outbox = tx.objectStore("outbox");
      const ops = ((await wrap(outbox.index("byEntity").getAll(c.entityId))) as OutboxOp[]).filter((o) => o.entityType === c.entityType);
      const serverVersion = String((c.server as { updated_at?: string }).updated_at ?? "");
      if (choice === "mine") {
        if (ent && serverVersion) await wrap(tx.objectStore(store).put({ ...ent, sync: { ...ent.sync, serverVersion } }));
        for (const o of ops) if (o.status === "conflict") await wrap(outbox.put({ ...o, opId: uuid(), status: "queued", retryCount: 0, nextAttemptAt: null, errorCode: undefined }));
      } else {
        for (const o of ops) await wrap(outbox.delete(o.seq!));
        if (ent) {
          const server = c.server as Record<string, unknown>;
          const { updated_at, ...fields } = pick(c.entityType, server) as { updated_at?: string } & Record<string, unknown>;
          await wrap(tx.objectStore(store).put({ ...ent, ...(fields as object), deleted: undefined, origin: "server", sync: { state: "synced", localUpdatedAt: this.iso, serverVersion: updated_at ?? ent.sync.serverVersion, confirmedAt: this.iso } } as AnyEntity));
        }
      }
      await wrap(tx.objectStore("conflicts").put({ ...c, resolvedAt: this.iso, resolution: choice }));
      await this.refreshEntity(tx, c.entityType, c.entityId);
      await this.log(tx, { at: this.iso, opId: c.opId, entityType: c.entityType, result: `resolved_${choice}` });
    });
    this.emit();
  }

  /** Give a failed or rejected change a fresh attempt (new operation id, because the server remembers a rejected id). */
  async retryOp(opId: string): Promise<void> {
    await inTx(this.db, ["outbox", "visits", "observations", "commitments"], "readwrite", async (tx) => {
      const o = (await wrap(tx.objectStore("outbox").index("byOpId").get(opId))) as OutboxOp | undefined;
      if (!o || o.status === "conflict" || o.status === "inflight") return;
      await wrap(tx.objectStore("outbox").put({ ...o, opId: o.status === "rejected" ? uuid() : o.opId, status: "queued", retryCount: 0, nextAttemptAt: null, errorCode: undefined, errorMessage: undefined }));
      await this.refreshEntity(tx, o.entityType, o.entityId);
    });
    this.emit();
  }

  /**
   * Discard a change the server refused, after the user confirmed. Newly created records that the server never accepted are removed
   * from this device; for a refused edit the record returns to the last version the server confirmed (see `serverCopy`).
   * Only ever called from an explicit user action.
   */
  async discardRejected(opId: string, serverCopy?: Record<string, unknown>): Promise<void> {
    await inTx(this.db, ["outbox", "visits", "observations", "commitments", "syncLog"], "readwrite", async (tx) => {
      const outbox = tx.objectStore("outbox");
      const o = (await wrap(outbox.index("byOpId").get(opId))) as OutboxOp | undefined;
      if (!o || o.status !== "rejected") return;
      const store = STORE_OF[o.entityType];
      const all = ((await wrap(outbox.index("byEntity").getAll(o.entityId))) as OutboxOp[]).filter((x) => x.entityType === o.entityType);
      const neverOnServer = all.some((x) => x.op === "create");
      if (neverOnServer) {
        // also drop everything queued for records that depend on this visit
        const chainOps = ((await wrap(outbox.getAll())) as OutboxOp[]).filter((x) => o.entityType === "visit" ? x.chain === o.entityId : x.entityId === o.entityId);
        for (const x of chainOps) await wrap(outbox.delete(x.seq!));
        if (o.entityType === "visit") {
          for (const s of ["observations", "commitments"] as const) {
            const rows = (await wrap(tx.objectStore(s).index("byVisit").getAll(o.entityId))) as { id: string }[];
            for (const r of rows) await wrap(tx.objectStore(s).delete(r.id));
          }
        }
        await wrap(tx.objectStore(store).delete(o.entityId));
      } else {
        for (const x of all) await wrap(outbox.delete(x.seq!));
        const ent = (await wrap(tx.objectStore(store).get(o.entityId))) as AnyEntity | undefined;
        if (ent && serverCopy) {
          const { updated_at, ...fields } = pick(o.entityType, serverCopy) as { updated_at?: string } & Record<string, unknown>;
          await wrap(tx.objectStore(store).put({ ...ent, ...(fields as object), deleted: undefined, sync: { state: "synced", localUpdatedAt: this.iso, serverVersion: updated_at ?? ent.sync.serverVersion, confirmedAt: this.iso } } as AnyEntity));
        } else if (ent) {
          await this.refreshEntity(tx, o.entityType, o.entityId);
        }
      }
      await this.log(tx, { at: this.iso, opId, entityType: o.entityType, result: "discarded_by_user", code: o.errorCode });
    });
    this.emit();
  }

  /** Remove ALL records of this account from this device. Refuses while unsynced work exists unless the caller passes `force` (an explicit, confirmed user action). */
  async wipe(opts: { force?: boolean } = {}): Promise<void> {
    const s = await this.syncSummary();
    if (s.pendingOps > 0 && !opts.force) throw new LocalRuleError("unsynced_records", "There are records on this device that the server has not confirmed yet.");
    const name = dbNameFor(this.accountId);
    this.db.close();
    await deleteDb(name, this.factory);
  }
}
