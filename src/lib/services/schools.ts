import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, isoDate } from "../util";
import { conflict, invalid, notFound } from "../errors";
import { requireRole } from "../auth/policy";
import { audit } from "./audit";
import { listVisits } from "./visits";
import { listCommitments } from "./commitments";
import { can } from "../auth/policy";
import type { Actor, SchoolRow } from "../types";

export interface SchoolListItem extends SchoolRow {
  mentors: string | null;
  last_visit_at: string | null;
  next_visit_at: string | null;
  open_followups: number;
  overdue_followups: number;
}

export const schoolFilterSchema = z.object({
  id: z.string().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  block: z.string().trim().max(100).optional(),
  attention: z.enum(["overdue", "no_recent_visit"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type SchoolFilter = z.infer<typeof schoolFilterSchema>;

const NO_RECENT_VISIT_DAYS = 45;

export function listSchools(db: Db, actor: Actor, rawFilter: Partial<SchoolFilter> = {}) {
  requireRole(actor, "school:read");
  const f = schoolFilterSchema.parse(rawFilter);
  const today = isoDate(new Date());
  const where: string[] = [];
  const params: (string | number)[] = [today, today];

  if (actor.role === "mentor") {
    where.push(
      "s.id IN (SELECT school_id FROM school_assignments WHERE profile_id = ? AND status = 'active')",
    );
    params.push(actor.id);
  }
  if (f.id) {
    where.push("s.id = ?");
    params.push(f.id);
  }
  if (f.q) {
    where.push("(s.name LIKE ? OR s.code LIKE ?)");
    params.push(`%${f.q}%`, `%${f.q}%`);
  }
  if (f.block) {
    where.push("s.block = ?");
    params.push(f.block);
  }
  const base = `
    SELECT s.*,
      (SELECT group_concat(p.display_name, ', ') FROM school_assignments a
         JOIN profiles p ON p.id = a.profile_id
        WHERE a.school_id = s.id AND a.status = 'active') AS mentors,
      (SELECT max(v.scheduled_at) FROM visits v WHERE v.school_id = s.id AND v.status = 'completed') AS last_visit_at,
      (SELECT min(v.scheduled_at) FROM visits v WHERE v.school_id = s.id
          AND v.status IN ('draft','planned','in_progress') AND substr(v.scheduled_at,1,10) >= ?) AS next_visit_at,
      (SELECT count(*) FROM commitments c JOIN visits v ON v.id = c.visit_id
        WHERE v.school_id = s.id AND c.status IN ('open','completed')) AS open_followups,
      (SELECT count(*) FROM commitments c JOIN visits v ON v.id = c.visit_id
        WHERE v.school_id = s.id AND c.status = 'open' AND c.target_date < ?) AS overdue_followups
    FROM schools s`;
  let rows = all<SchoolListItem>(
    db,
    `${base} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.name`,
    ...params,
  );

  if (f.attention === "overdue") rows = rows.filter((r) => r.overdue_followups > 0);
  if (f.attention === "no_recent_visit") {
    const cutoff = Date.now() - NO_RECENT_VISIT_DAYS * 86_400_000;
    rows = rows.filter((r) => !r.last_visit_at || new Date(r.last_visit_at).getTime() < cutoff);
  }
  const total = rows.length;
  const items = rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
  return { items, total, page: f.page, pageSize: f.pageSize };
}

export function listBlocks(db: Db, actor: Actor): string[] {
  return listSchools(db, actor, { pageSize: 50 }).items
    .map((s) => s.block)
    .filter((b, i, a) => a.indexOf(b) === i)
    .sort();
}

export function getSchool(db: Db, actor: Actor, id: string): SchoolListItem {
  // listSchools already restricts mentors to their assigned schools, so access rules live in one place.
  const hit = listSchools(db, actor, { id }).items[0];
  if (!hit) throw notFound('School');
  return hit;
}

export const createSchoolSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  name: z.string().trim().min(2).max(160),
  state: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(80),
  block: z.string().trim().min(2).max(80),
  cluster: z.string().trim().max(80).optional(),
});

export function createSchool(db: Db, actor: Actor, input: unknown): SchoolRow {
  requireRole(actor, "school:create");
  const data = createSchoolSchema.parse(input);
  if (get(db, "SELECT 1 AS x FROM schools WHERE code = ?", data.code)) {
    throw conflict("duplicate_school_code", `A school with code ${data.code} already exists`);
  }
  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO schools (id, code, name, state, district, block, cluster, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id, data.code, data.name, data.state, data.district, data.block, data.cluster ?? null, ts, ts,
    );
    audit(db, actor, "school.created", "school", id, { code: data.code });
  });
  return get<SchoolRow>(db, "SELECT * FROM schools WHERE id = ?", id)!;
}

export function assignMentor(db: Db, actor: Actor, schoolId: string, mentorId: string) {
  requireRole(actor, "school:assign");
  if (!get(db, "SELECT 1 AS x FROM schools WHERE id = ?", schoolId)) throw notFound("School");
  const mentor = get<{ role: string }>(db, "SELECT role FROM profiles WHERE id = ?", mentorId);
  if (!mentor) throw notFound("Mentor");
  if (mentor.role !== "mentor") throw invalid("Only mentors can be assigned to schools");
  transaction(db, () => {
    run(
      db,
      `INSERT INTO school_assignments (id, profile_id, school_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)
       ON CONFLICT (profile_id, school_id) DO UPDATE SET status = 'active'`,
      newId(), mentorId, schoolId, nowIso(),
    );
    audit(db, actor, "school.assigned", "school", schoolId, { mentor_id: mentorId });
  });
}

/** School profile extras: visit history for everyone allowed to see schools; coaching content only for the owning mentor. */
export function schoolExtras(db: Db, actor: Actor, schoolId: string) {
  // Curators may see that a school exists but never its visits.
  const visits = actor.role === "mentor" || actor.role === "supervisor" ? listVisits(db, actor, { school_id: schoolId, pageSize: 50 }).items : [];
  const content = can(actor, 'visit:read_content');
  return {
    visits,
    commitments: content ? listCommitments(db, actor, { school_id: schoolId }) : [],
  };
}
