import { z } from "zod";
import type { Lang } from "../types";

/** What the model is asked to return for a feedback card. Citation METADATA is never trusted from the model. */
export const feedbackOutputSchema = z
  .object({
    strength: z.string().trim().max(600).default(""),
    priority_practice: z.string().trim().max(600).default(""),
    next_step: z.string().trim().max(500).default(""),
    coaching_questions: z
      .object({
        ask: z.string().trim().max(400).default(""),
        describe: z.string().trim().max(600).default(""),
        ask_again: z.string().trim().max(400).default(""),
      })
      .default({ ask: "", describe: "", ask_again: "" }),
    evidence: z
      .array(z.object({ observation_id: z.string().min(1), quote_or_summary: z.string().trim().min(1).max(400) }))
      .max(6)
      .default([]),
    citations: z
      .array(z.object({ practice_card_id: z.string().min(1) }).passthrough())
      .max(4)
      .default([]),
    needs_mentor_review: z.boolean().default(true),
    insufficient_evidence: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.insufficient_evidence) return;
    const need: [string, string][] = [
      ["strength", v.strength],
      ["priority_practice", v.priority_practice],
      ["next_step", v.next_step],
      ["coaching_questions.ask", v.coaching_questions.ask],
      ["coaching_questions.describe", v.coaching_questions.describe],
      ["coaching_questions.ask_again", v.coaching_questions.ask_again],
    ];
    for (const [path, value] of need) {
      if (!value) ctx.addIssue({ code: "custom", message: `${path} is required`, path: path.split(".") });
    }
    if (v.citations.length === 0) ctx.addIssue({ code: "custom", message: "At least one citation is required", path: ["citations"] });
    if (v.evidence.length === 0) ctx.addIssue({ code: "custom", message: "At least one evidence reference is required", path: ["evidence"] });
  });
export type FeedbackOutput = z.infer<typeof feedbackOutputSchema>;

export const demonstrationOutputSchema = z.object({
  objective: z.string().trim().min(5).max(500),
  materials: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  steps: z
    .array(
      z.object({
        minutes: z.string().trim().min(1).max(20),
        action: z.string().trim().min(3).max(500),
      }),
    )
    .min(2)
    .max(10),
  mentor_script: z.string().trim().min(10).max(2500),
  example_interaction: z.string().trim().min(10).max(2000),
  variation: z.string().trim().max(800).default(""),
  reflection_question: z.string().trim().min(5).max(400),
  citations: z.array(z.object({ practice_card_id: z.string().min(1) }).passthrough()).min(1).max(3),
});
export type DemonstrationOutput = z.infer<typeof demonstrationOutputSchema>;

// ---- structured task inputs (what a provider receives) --------------------------------------

export interface CardContext {
  id: string;
  version: number;
  title: string;
  description: string;
  steps: string[];
  example_prompts: string[];
  example_dialogue: string[];
  next_step: string;
  variation: string | null;
  tlm: string[];
  hi?: { title: string; summary: string; next_step: string; steps: string[]; prompts: string[]; dialogue: string[] };
  score?: number;
  /** Verbatim excerpts of the official source (official-source cards only). Untrusted data. */
  excerpts?: { chunk_id: string; page: number; text: string }[];
  origin?: "illustrative" | "official_source";
}

export interface FeedbackTaskInput {
  language: Lang;
  visit: { grade: number; subject: string; purpose: string; coaching_focus: string | null };
  observations: {
    id: string;
    practice_observed: string;
    evidence: string;
    worked_well: string | null;
    improvement_area: string | null;
  }[];
  cards: CardContext[]; // retrieved, approved, ranked
}

export interface DemonstrationTaskInput {
  language: Lang;
  grade: number;
  subject: string;
  duration_minutes: number;
  card: CardContext;
}

export type AiTask =
  | { task: "feedback"; input: FeedbackTaskInput }
  | { task: "demonstration"; input: DemonstrationTaskInput };
