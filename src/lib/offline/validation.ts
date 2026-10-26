import { z } from "zod";

/**
 * Client-side mirror of the server rules (src/lib/services/{visits,observations,commitments}.ts). It exists so a mentor learns about
 * a mistake while still offline, instead of when the record is rejected later. The server remains the authority: tests in
 * tests/offline-validation.test.ts check that what passes here also passes the server schemas.
 */
export const SUBJECTS = ["Hindi", "English", "Mathematics", "EVS"] as const;

const blank = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const visitInput = z.object({
  school_id: z.string().min(1, "choose_school"),
  teacher_alias: z.string().trim().min(1, "alias_required").max(60).regex(/^[\p{L}\p{M}\p{N} .\-_]+$/u, "alias_chars"),
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "date_invalid").refine((v) => {
    const t = Date.parse(v);
    return t >= Date.now() - 366 * 86_400_000 && t <= Date.now() + 366 * 86_400_000;
  }, "date_range"),
  grade: z.coerce.number().int().min(1).max(8),
  subject: z.enum(SUBJECTS),
  language: z.enum(["en", "hi"]).default("hi"),
  purpose: z.string().trim().min(3, "purpose_required").max(200),
  coaching_focus: blank(300),
  prep_notes: blank(1000),
  previous_commitment_id: z.string().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});
export type VisitInput = z.infer<typeof visitInput>;

export const observationInput = z.object({
  practice_observed: z.string().trim().min(3, "practice_required").max(1500),
  evidence: z.string().trim().min(3, "evidence_required").max(2000),
  worked_well: blank(1500),
  improvement_area: blank(1500),
  context_note: blank(500),
});
export type ObservationInput = z.infer<typeof observationInput>;

export const commitmentInput = z.object({
  action_text: z.string().trim().min(5, "action_required").max(600),
  owner_role: z.enum(["teacher", "head_teacher", "mentor"]).default("teacher"),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid"),
  expected_evidence: z.string().trim().min(3, "evidence_required").max(600),
});
export type CommitmentInput = z.infer<typeof commitmentInput>;

/** Field name → message code map for forms (codes are translated by the UI). */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

/** Target date must lie between the visit date and 180 days after it (same rule as the server). */
export function commitmentDateProblem(visitDate: string, target: string): "before_visit" | "too_far" | null {
  const day = (d: string) => Math.round((new Date(d).getTime() - new Date(visitDate.slice(0, 10)).getTime()) / 86_400_000);
  const n = day(target);
  if (n < 0) return "before_visit";
  if (n > 180) return "too_far";
  return null;
}
