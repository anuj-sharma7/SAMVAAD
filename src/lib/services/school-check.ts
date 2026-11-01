import { z } from "zod";
import { all, run, transaction, type Db } from "../db/client";
import { nowIso, parseJson } from "../util";
import { conflict, invalid } from "../errors";
import { audit } from "./audit";
import { getAuthorizedVisit } from "./access";
import { CHECK_SECTION_IDS, EXTRA, validOptionIds, type CheckAnswers } from "../school-check";
import type { Actor } from "../types";

const sectionAnswer = z.object({
  ids: z.array(z.string().max(40)).max(30),
  text: z.string().trim().max(600).default(""),
});

export const schoolCheckSchema = z.object({
  answers: z.record(z.string(), sectionAnswer),
});

export interface SchoolCheckView { answers: CheckAnswers; updated_at: string | null }

export function getSchoolCheck(db: Db, actor: Actor, visitId: string): SchoolCheckView {
  getAuthorizedVisit(db, actor, visitId, "content");
  const rows = all<{ section: string; option_ids: string; other_text: string; updated_at: string }>(
    db, "SELECT section, option_ids, other_text, updated_at FROM school_checks WHERE visit_id = ?", visitId,
  );
  const answers: CheckAnswers = {};
  let latest: string | null = null;
  for (const r of rows) {
    answers[r.section] = { ids: parseJson<string[]>(r.option_ids, []), text: r.other_text };
    if (!latest || r.updated_at > latest) latest = r.updated_at;
  }
  return { answers, updated_at: latest };
}

/**
 * Replaces the whole check for a visit. Unknown sections or option ids are refused (the options are a fixed list), so a client cannot
 * store arbitrary values in the option column; the mentor's own words go only in `text`.
 */
export function saveSchoolCheck(db: Db, actor: Actor, visitId: string, input: unknown): SchoolCheckView {
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  if (visit.status !== "in_progress" && visit.status !== "pending_review") {
    throw conflict("visit_not_observable", visit.status === "completed" ? "This visit is completed and read-only" : "Start the visit before recording the school check");
  }
  const d = schoolCheckSchema.parse(input);
  for (const [section, a] of Object.entries(d.answers)) {
    if (!CHECK_SECTION_IDS.includes(section)) throw invalid(`Unknown section: ${section}`);
    if (section === EXTRA) {
      if (a.ids.length) throw invalid("The closing note takes text only");
      continue;
    }
    const ok = validOptionIds(section);
    for (const id of a.ids) if (!ok.has(id)) throw invalid(`Unknown option for ${section}: ${id}`);
  }
  const ts = nowIso();
  transaction(db, () => {
    run(db, "DELETE FROM school_checks WHERE visit_id = ?", visitId);
    for (const [section, a] of Object.entries(d.answers)) {
      if (a.ids.length === 0 && !a.text) continue;
      run(
        db,
        "INSERT INTO school_checks (visit_id, section, option_ids, other_text, updated_by, updated_at) VALUES (?,?,?,?,?,?)",
        visitId, section, JSON.stringify([...new Set(a.ids)]), a.text, actor.id, ts,
      );
    }
    run(db, "UPDATE visits SET updated_at = ? WHERE id = ?", ts, visitId);
    // Audit records which sections were filled, never the mentor's words.
    audit(db, actor, "school_check.saved", "visit", visitId, { sections: Object.keys(d.answers).filter((k) => d.answers[k].ids.length || d.answers[k].text).join(",") });
  });
  return getSchoolCheck(db, actor, visitId);
}
