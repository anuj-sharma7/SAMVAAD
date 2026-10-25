import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, parseJson } from "../util";
import { AppError, conflict, notFound } from "../errors";
import { audit } from "./audit";
import { assertNotStale, getAuthorizedVisit } from "./access";
import { getCardInternal } from "./practice-cards";
import { currentFeedbackInternal, mapProviderError, toCardContext } from "./feedback";
import { demonstrationOutputSchema, type DemonstrationOutput, type DemonstrationTaskInput } from "../ai/schemas";
import { demonstrationPrompts } from "../ai/prompts";
import { getProvider, AI_TIMEOUT_MS } from "../ai";
import { containsEvaluativeLanguage } from "./feedback";
import type { AiProvider } from "../ai/provider";
import type { Actor, Lang, PracticeCard } from "../types";

export interface DemonstrationScript {
  id: string;
  visit_id: string;
  feedback_id: string | null;
  practice_card_id: string;
  card_version: number;
  status: "draft" | "edited" | "approved" | "superseded";
  language: Lang;
  grade: number;
  duration_minutes: number;
  objective: string;
  materials: string[];
  steps: { minutes: string; action: string }[];
  mentor_script: string;
  example_interaction: string;
  variation: string | null;
  reflection_question: string;
  provider: string;
  model: string | null;
  is_simulated: boolean;
  mentor_edited: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  source: { title: string; org: string; section: string | null; url: string | null; card_title: string; card_version: number };
}

interface Raw extends Omit<DemonstrationScript, "materials" | "steps" | "is_simulated" | "mentor_edited" | "source"> {
  materials: string; steps: string; is_simulated: number; mentor_edited: number;
}

function map(db: Db, r: Raw): DemonstrationScript {
  const card = getCardInternal(db, r.practice_card_id);
  return {
    ...r,
    materials: parseJson<string[]>(r.materials, []),
    steps: parseJson<DemonstrationScript["steps"]>(r.steps, []),
    is_simulated: !!r.is_simulated,
    mentor_edited: !!r.mentor_edited,
    source: {
      title: card?.source_title ?? "(card removed)", org: card?.source_org ?? "", section: card?.source_section ?? null,
      url: card?.source_url ?? null, card_title: card?.title ?? r.practice_card_id, card_version: r.card_version,
    },
  };
}

export function getCurrentDemonstration(db: Db, actor: Actor, visitId: string): DemonstrationScript | null {
  getAuthorizedVisit(db, actor, visitId, "content");
  return currentDemoInternal(db, visitId);
}

export function currentDemoInternal(db: Db, visitId: string): DemonstrationScript | null {
  const row = get<Raw>(db, "SELECT * FROM demonstration_scripts WHERE visit_id = ? AND status IN ('draft','edited','approved')", visitId);
  return row ? map(db, row) : null;
}

export const generateDemoSchema = z.object({
  practice_card_id: z.string().optional(),
  language: z.enum(["en", "hi"]).optional(),
  duration_minutes: z.coerce.number().int().min(3).max(10).default(5),
  use_demo_provider: z.boolean().optional(),
});

export function validateDemonstrationOutput(raw: unknown, card: PracticeCard): DemonstrationOutput {
  const parsed = demonstrationOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, "invalid_model_output", "The AI response did not match the required structure.", parsed.error.issues.map((i) => i.message));
  }
  for (const c of parsed.data.citations) {
    if (c.practice_card_id !== card.id) {
      throw new AppError(502, "invalid_citation", `The AI cited "${c.practice_card_id}", which is not the approved card this script is based on. The draft was discarded.`);
    }
  }
  const text = [parsed.data.objective, parsed.data.mentor_script, parsed.data.example_interaction].join("\n");
  if (containsEvaluativeLanguage(text)) {
    throw new AppError(502, "unsafe_output", "The draft contained evaluative language about the teacher and was discarded.");
  }
  return parsed.data;
}

export async function generateDemonstration(
  db: Db,
  actor: Actor,
  visitId: string,
  input: unknown = {},
  deps: { provider?: AiProvider } = {},
): Promise<DemonstrationScript> {
  const opts = generateDemoSchema.parse(input ?? {});
  const visit = getAuthorizedVisit(db, actor, visitId, "write");
  if (visit.status === "completed") throw conflict("visit_locked", "Completed visits are read-only");
  const feedback = currentFeedbackInternal(db, visitId);
  if (!feedback || feedback.status !== "approved") {
    throw conflict("feedback_not_approved", "Approve the feedback card first. The demonstration is built from its approved practice.");
  }
  if (get(db, "SELECT 1 AS x FROM demonstration_scripts WHERE visit_id = ? AND status = 'approved'", visitId)) {
    throw conflict("demonstration_already_approved", "The demonstration for this visit is already approved");
  }
  const cardId = opts.practice_card_id ?? feedback.citations.find((c) => c.is_primary)?.practice_card_id;
  if (!cardId || !feedback.citations.some((c) => c.practice_card_id === cardId)) {
    throw conflict("card_not_cited", "Choose one of the practice cards cited by the approved feedback");
  }
  const card = getCardInternal(db, cardId);
  if (!card || card.approval_status !== "approved") {
    throw conflict("source_not_approved", "That practice card is no longer approved; the library curator must re-approve it.");
  }
  const language = opts.language ?? visit.language;
  const task: DemonstrationTaskInput = {
    language, grade: visit.grade, subject: visit.subject, duration_minutes: opts.duration_minutes, card: toCardContext(card),
  };

  let output: DemonstrationOutput;
  let meta: { provider: string; model: string | null; simulated: boolean };
  try {
    const provider = deps.provider ?? getProvider(process.env, opts.use_demo_provider ? "demo" : undefined);
    const res = await provider.generate({ task: { task: "demonstration", input: task }, ...demonstrationPrompts(task), timeoutMs: AI_TIMEOUT_MS });
    meta = { provider: res.provider, model: res.model, simulated: res.simulated };
    output = validateDemonstrationOutput(res.json, card);
  } catch (err) {
    throw mapProviderError(err);
  }

  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE demonstration_scripts SET status='superseded', updated_at=? WHERE visit_id=? AND status IN ('draft','edited')", ts, visitId);
    run(
      db,
      `INSERT INTO demonstration_scripts (id, visit_id, feedback_id, practice_card_id, card_version, status, language, grade,
         duration_minutes, objective, materials, steps, mentor_script, example_interaction, variation, reflection_question,
         provider, model, is_simulated, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?, 'draft', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, visitId, feedback.id, card.id, card.version, language, visit.grade, opts.duration_minutes, output.objective,
      JSON.stringify(output.materials), JSON.stringify(output.steps), output.mentor_script, output.example_interaction,
      output.variation || null, output.reflection_question, meta.provider, meta.model, meta.simulated ? 1 : 0,
      actor.id, ts, ts,
    );
    audit(db, actor, "demonstration.generated", "demonstration", id, {
      visit_id: visitId, card_id: card.id, provider: meta.provider, simulated: meta.simulated,
    });
  });
  return map(db, get<Raw>(db, "SELECT * FROM demonstration_scripts WHERE id = ?", id)!);
}

export const demoEditSchema = z.object({
  expected_updated_at: z.string().max(40).optional(),
  objective: z.string().trim().min(5).max(500).optional(),
  materials: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  steps: z.array(z.object({ minutes: z.string().trim().min(1).max(20), action: z.string().trim().min(3).max(500) })).min(2).max(10).optional(),
  mentor_script: z.string().trim().min(10).max(2500).optional(),
  example_interaction: z.string().trim().min(10).max(2000).optional(),
  variation: z.string().trim().max(800).optional(),
  reflection_question: z.string().trim().min(5).max(400).optional(),
});

function loadEditable(db: Db, actor: Actor, id: string) {
  const row = get<Raw>(db, "SELECT * FROM demonstration_scripts WHERE id = ?", id);
  if (!row) throw notFound("Demonstration script");
  getAuthorizedVisit(db, actor, row.visit_id, "write");
  return row;
}

export function editDemonstration(db: Db, actor: Actor, id: string, input: unknown): DemonstrationScript {
  const row = loadEditable(db, actor, id);
  if (row.status === "approved" || row.status === "superseded") {
    throw conflict("demonstration_locked", `A ${row.status} demonstration cannot be edited`);
  }
  const d = demoEditSchema.parse(input);
  assertNotStale(row.updated_at, d.expected_updated_at);
  transaction(db, () => {
    run(
      db,
      `UPDATE demonstration_scripts SET status='edited', mentor_edited=1, objective=COALESCE(?, objective),
         materials=COALESCE(?, materials), steps=COALESCE(?, steps), mentor_script=COALESCE(?, mentor_script),
         example_interaction=COALESCE(?, example_interaction), variation=COALESCE(?, variation),
         reflection_question=COALESCE(?, reflection_question), updated_at=? WHERE id=?`,
      d.objective ?? null, d.materials ? JSON.stringify(d.materials) : null, d.steps ? JSON.stringify(d.steps) : null,
      d.mentor_script ?? null, d.example_interaction ?? null, d.variation ?? null, d.reflection_question ?? null,
      nowIso(), id,
    );
    audit(db, actor, "demonstration.edited", "demonstration", id, { visit_id: row.visit_id, fields: Object.keys(d).filter((k) => k !== "expected_updated_at").join(",") });
  });
  return map(db, get<Raw>(db, "SELECT * FROM demonstration_scripts WHERE id = ?", id)!);
}

export function approveDemonstration(db: Db, actor: Actor, id: string): DemonstrationScript {
  const row = loadEditable(db, actor, id);
  if (row.status === "approved") return map(db, row);
  if (row.status === "superseded") throw conflict("demonstration_locked", "This script was replaced by a newer draft");
  const card = getCardInternal(db, row.practice_card_id);
  if (!card || card.approval_status !== "approved") {
    throw conflict("source_not_approved", "The source practice card is no longer approved");
  }
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE demonstration_scripts SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?", actor.id, ts, ts, id);
    audit(db, actor, "demonstration.approved", "demonstration", id, { visit_id: row.visit_id, card_id: row.practice_card_id });
  });
  return map(db, get<Raw>(db, "SELECT * FROM demonstration_scripts WHERE id = ?", id)!);
}

export function listApprovedDemonstrations(db: Db, actor: Actor): DemonstrationScript[] {
  // Mentors see their own scripts across visits (used by the /demonstrate index).
  return all<Raw>(
    db,
    `SELECT d.* FROM demonstration_scripts d JOIN visits v ON v.id = d.visit_id
      WHERE v.mentor_id = ? AND d.status IN ('draft','edited','approved') ORDER BY d.updated_at DESC`,
    actor.id,
  ).map((r) => map(db, r));
}
