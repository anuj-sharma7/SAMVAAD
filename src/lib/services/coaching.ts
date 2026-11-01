import { z } from "zod";
import { get, type Db } from "../db/client";
import { AppError, notFound } from "../errors";
import { audit } from "./audit";
import { getAuthorizedVisit } from "./access";
import { containsEvaluativeLanguage, mapProviderError } from "./feedback";
import { getProvider, AI_TIMEOUT_MS } from "../ai";
import type { AiProvider } from "../ai/provider";
import { coachOutputSchema, type CoachOutput, type CoachTaskInput } from "../ai/schemas";
import { coachPrompts } from "../ai/help-prompts";
import { checkCard } from "../coach/checks";
import type { Actor, Lang } from "../types";

const text = (max: number) => z.string().trim().max(max).default("");
export const coachAdviceSchema = z.object({
  // The mentor's live (possibly unsaved) wording. When omitted, the saved card is used.
  strength: text(600).optional(),
  priority_practice: text(600).optional(),
  next_step: text(500).optional(),
  ask_question: text(600).optional(),
  describe_statement: text(800).optional(),
  ask_again_question: text(600).optional(),
  language: z.enum(["en", "hi"]).optional(),
  use_demo_provider: z.boolean().optional(),
});

export interface CoachAdvice extends CoachOutput {
  provider: string;
  model: string | null;
  is_simulated: boolean;
  weak_checks: string[];
}

interface FbRow {
  visit_id: string; language: Lang; strength: string | null; priority_practice: string | null; next_step: string | null;
  ask_question: string | null; describe_statement: string | null; ask_again_question: string | null;
}

/**
 * Advice for the coaching conversation itself (how to open, what to improve in the wording, what to say if the teacher disagrees, how to close).
 * It is not saved and never changes the card, its sources or its approval; the mentor stays in charge of every word.
 */
export async function coachAdvice(db: Db, actor: Actor, feedbackId: string, input: unknown = {}, deps: { provider?: AiProvider } = {}): Promise<CoachAdvice> {
  const fb = get<FbRow>(db, "SELECT * FROM feedback_drafts WHERE id = ?", feedbackId);
  if (!fb) throw notFound("Feedback draft");
  const visit = getAuthorizedVisit(db, actor, fb.visit_id, "write");
  const d = coachAdviceSchema.parse(input ?? {});
  const card = {
    strength: d.strength ?? fb.strength ?? "",
    priority_practice: d.priority_practice ?? fb.priority_practice ?? "",
    next_step: d.next_step ?? fb.next_step ?? "",
    ask_question: d.ask_question ?? fb.ask_question ?? "",
    describe_statement: d.describe_statement ?? fb.describe_statement ?? "",
    ask_again_question: d.ask_again_question ?? fb.ask_again_question ?? "",
  };
  const weak = checkCard(card).filter((c) => !c.ok).map((c) => c.id);
  const task: CoachTaskInput = { language: d.language ?? fb.language, grade: visit.grade, subject: visit.subject, card, weak_checks: weak };
  let out: CoachOutput;
  let meta: { provider: string; model: string | null; simulated: boolean };
  try {
    const provider = deps.provider ?? getProvider(process.env, d.use_demo_provider ? "demo" : undefined);
    const res = await provider.generate({ task: { task: "coach", input: task }, ...coachPrompts(task), timeoutMs: AI_TIMEOUT_MS, maxTokens: 1800 });
    meta = { provider: res.provider, model: res.model, simulated: res.simulated };
    const parsed = coachOutputSchema.safeParse(res.json);
    if (!parsed.success) throw new AppError(502, "invalid_model_output", "The AI response did not match the required structure.", parsed.error.issues.map((i) => i.message));
    out = parsed.data;
    if (containsEvaluativeLanguage([out.opening_line, out.if_disagrees, out.close_with, ...out.tips, ...out.watch_outs].join(" | "))) {
      throw new AppError(502, "unsafe_output", "The AI advice contained evaluative language about the teacher and was discarded.");
    }
  } catch (err) {
    throw mapProviderError(err);
  }
  audit(db, actor, "feedback.coach_advice", "feedback", feedbackId, { provider: meta.provider, simulated: meta.simulated, weak_checks: weak.join(",") });
  return { ...out, provider: meta.provider, model: meta.model, is_simulated: meta.simulated, weak_checks: weak };
}
