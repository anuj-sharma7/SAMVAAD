import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, parseJson } from "../util";
import { conflict, invalid, notFound } from "../errors";
import { audit } from "./audit";
import { assertNotStale, getAuthorizedVisit } from "./access";
import { suggestTagsByRules, type RubricTag } from "../engines/tagger";
import type { Actor, ObservationRow, VisitRow } from "../types";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const observationSchema = z.object({
  practice_observed: z.string().trim().min(3, "Describe the practice you observed").max(1500),
  evidence: z.string().trim().min(3, "Add a concrete example or evidence").max(2000),
  worked_well: optionalText(1500),
  improvement_area: optionalText(1500),
  context_note: optionalText(500),
});

export interface TagView {
  code: string;
  label: string;
  domain: string;
  source: "mentor" | "suggested";
  confirmed: boolean;
  match_strength: number | null;
  matched_terms: string[];
}
export interface ObservationView extends ObservationRow {
  tags: TagView[];
}

export function loadRubric(db: Db): RubricTag[] {
  return all<{ code: string; domain: string; label: string; description: string; keywords: string }>(
    db,
    "SELECT * FROM rubric_tags ORDER BY domain, code",
  ).map((r) => ({ ...r, keywords: parseJson<string[]>(r.keywords, []) }));
}

function tagsFor(db: Db, observationId: string): TagView[] {
  return all<{
    code: string; label: string; domain: string; source: "mentor" | "suggested";
    confirmed: number; match_strength: number | null; matched_terms: string;
  }>(
    db,
    `SELECT t.tag_code AS code, r.label, r.domain, t.source, t.confirmed, t.match_strength, t.matched_terms
       FROM observation_tags t JOIN rubric_tags r ON r.code = t.tag_code
      WHERE t.observation_id = ? ORDER BY t.confirmed DESC, t.match_strength DESC`,
    observationId,
  ).map((t) => ({
    code: t.code, label: t.label, domain: t.domain, source: t.source,
    confirmed: !!t.confirmed, match_strength: t.match_strength,
    matched_terms: parseJson<string[]>(t.matched_terms, []),
  }));
}

export function listObservations(db: Db, actor: Actor, visitId: string): ObservationView[] {
  getAuthorizedVisit(db, actor, visitId, "content");
  return all<ObservationRow>(db, "SELECT * FROM observations WHERE visit_id = ? ORDER BY created_at", visitId).map(
    (o) => ({ ...o, tags: tagsFor(db, o.id) }),
  );
}

function assertObservable(db: Db, visit: VisitRow) {
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict(
      "visit_not_observable",
      visit.status === "completed"
        ? "This visit is completed and read-only"
        : "Start the visit before adding observations",
    );
  }
  if (get(db, "SELECT 1 AS x FROM feedback_drafts WHERE visit_id = ? AND status = 'approved'", visit.id)) {
    throw conflict(
      "feedback_already_approved",
      "Feedback has been approved for this visit, so its evidence can no longer be changed",
    );
  }
}

function suggestAndStore(db: Db, actor: Actor, obs: ObservationRow) {
  const text = [obs.practice_observed, obs.evidence, obs.worked_well, obs.improvement_area]
    .filter(Boolean)
    .join(" \n ");
  const suggestions = suggestTagsByRules(text, loadRubric(db));
  for (const s of suggestions) {
    run(
      db,
      `INSERT OR IGNORE INTO observation_tags (observation_id, tag_code, source, confirmed, match_strength, matched_terms)
       VALUES (?, ?, 'suggested', 0, ?, ?)`,
      obs.id, s.code, s.matchStrength, JSON.stringify(s.matchedTerms),
    );
  }
  if (suggestions.length) {
    audit(db, actor, "observation_tag.suggested", "observation", obs.id, {
      codes: suggestions.map((s) => s.code).join(","),
      engine: "rules-baseline",
    });
  }
}

export function addObservation(db: Db, actor: Actor, visitId: string, input: unknown): ObservationView {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  assertObservable(db, visit);
  const d = observationSchema.parse(input);
  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO observations (id, visit_id, practice_observed, evidence, worked_well, improvement_area,
         context_note, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, visitId, d.practice_observed, d.evidence, d.worked_well ?? null, d.improvement_area ?? null,
      d.context_note ?? null, actor.id, ts, ts,
    );
    run(db, "UPDATE visits SET updated_at = ? WHERE id = ?", ts, visitId);
    audit(db, actor, "observation.added", "observation", id, { visit_id: visitId });
    suggestAndStore(db, actor, get<ObservationRow>(db, "SELECT * FROM observations WHERE id = ?", id)!);
  });
  return { ...get<ObservationRow>(db, "SELECT * FROM observations WHERE id = ?", id)!, tags: tagsFor(db, id) };
}

function loadOwnObservation(db: Db, actor: Actor, observationId: string) {
  const obs = get<ObservationRow>(db, "SELECT * FROM observations WHERE id = ?", observationId);
  if (!obs) throw notFound("Observation");
  const visit = getAuthorizedVisit(db, actor, obs.visit_id, "write");
  return { obs, visit };
}

export function updateObservation(db: Db, actor: Actor, observationId: string, input: unknown): ObservationView {
  const { obs, visit } = loadOwnObservation(db, actor, observationId);
  assertObservable(db, visit);
  const { expected_updated_at, ...d } = observationSchema.partial().extend({ expected_updated_at: z.string().max(40).optional() }).parse(input);
  assertNotStale(obs.updated_at, expected_updated_at);
  // Stored NULLs mean "not provided"; the schema models that as undefined.
  const stored = Object.fromEntries(
    (["practice_observed", "evidence", "worked_well", "improvement_area", "context_note"] as const).map((k) => [k, obs[k] ?? undefined]),
  );
  const merged = { ...stored, ...d };
  const parsed = observationSchema.safeParse(merged);
  if (!parsed.success) throw invalid("Observation is incomplete", parsed.error.flatten());
  transaction(db, () => {
    run(
      db,
      `UPDATE observations SET practice_observed=?, evidence=?, worked_well=?, improvement_area=?, context_note=?, updated_at=? WHERE id=?`,
      parsed.data.practice_observed, parsed.data.evidence, parsed.data.worked_well ?? null,
      parsed.data.improvement_area ?? null, parsed.data.context_note ?? null, nowIso(), observationId,
    );
    audit(db, actor, "observation.updated", "observation", observationId, { visit_id: visit.id });
  });
  return { ...get<ObservationRow>(db, "SELECT * FROM observations WHERE id = ?", observationId)!, tags: tagsFor(db, observationId) };
}

export function deleteObservation(db: Db, actor: Actor, observationId: string): void {
  const { visit } = loadOwnObservation(db, actor, observationId);
  assertObservable(db, visit);
  transaction(db, () => {
    run(db, "DELETE FROM observations WHERE id = ?", observationId);
    audit(db, actor, "observation.deleted", "observation", observationId, { visit_id: visit.id });
  });
}

export const tagDecisionSchema = z.object({
  confirm: z.array(z.string()).default([]),
  dismiss: z.array(z.string()).default([]),
  add: z.array(z.string()).default([]),
});

/** The mentor confirms, dismisses or manually adds tags. Nothing becomes confirmed without this call. */
export function decideTags(db: Db, actor: Actor, observationId: string, input: unknown): TagView[] {
  const { visit } = loadOwnObservation(db, actor, observationId);
  assertObservable(db, visit);
  const d = tagDecisionSchema.parse(input);
  const known = new Set(loadRubric(db).map((t) => t.code));
  for (const c of [...d.confirm, ...d.dismiss, ...d.add]) {
    if (!known.has(c)) throw invalid(`Unknown rubric tag: ${c}`);
  }
  const ts = nowIso();
  transaction(db, () => {
    for (const c of d.confirm) {
      run(
        db,
        "UPDATE observation_tags SET confirmed = 1, decided_by = ?, decided_at = ? WHERE observation_id = ? AND tag_code = ?",
        actor.id, ts, observationId, c,
      );
      audit(db, actor, "observation_tag.confirmed", "observation", observationId, { code: c });
    }
    for (const c of d.dismiss) {
      run(db, "DELETE FROM observation_tags WHERE observation_id = ? AND tag_code = ? AND source = 'suggested'", observationId, c);
      audit(db, actor, "observation_tag.dismissed", "observation", observationId, { code: c });
    }
    for (const c of d.add) {
      run(
        db,
        `INSERT INTO observation_tags (observation_id, tag_code, source, confirmed, decided_by, decided_at)
         VALUES (?, ?, 'mentor', 1, ?, ?)
         ON CONFLICT (observation_id, tag_code) DO UPDATE SET confirmed = 1, decided_by = excluded.decided_by, decided_at = excluded.decided_at`,
        observationId, c, actor.id, ts,
      );
      audit(db, actor, "observation_tag.confirmed", "observation", observationId, { code: c, manual: true });
    }
  });
  return tagsFor(db, observationId);
}
