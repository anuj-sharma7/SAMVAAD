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
  | { task: "demonstration"; input: DemonstrationTaskInput }
  | { task: "questions"; input: QuestionsTaskInput }
  | { task: "review"; input: ReviewTaskInput }
  | { task: "issue"; input: IssueTaskInput }
  | { task: "coach"; input: CoachTaskInput };

// ---- mentor help: question generation, review and problem suggestions -----------------------

export const questionsOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string().trim().min(5).max(300),
        hint: z.string().trim().max(300).default(""),
        who: z.enum(["students", "cook", "teacher", "head", "smc"]).default("students"),
        fix: z.string().trim().max(300).default(""),
      }),
    )
    .min(1)
    .max(12),
  tip: z.string().trim().max(400).default(""),
});
export type QuestionsOutput = z.infer<typeof questionsOutputSchema>;

export const reviewOutputSchema = z.object({
  summary: z.string().trim().min(5).max(500),
  suggestions: z.array(z.object({ q: z.string().trim().max(300).default(""), text: z.string().trim().min(5).max(400) })).min(1).max(12),
  next_step: z.string().trim().min(5).max(400),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export const issueSuggestionSchema = z.object({
  suggestions: z.array(z.string().trim().min(5).max(400)).min(1).max(5),
  first_step: z.string().trim().min(5).max(400),
});
export type IssueSuggestion = z.infer<typeof issueSuggestionSchema>;

export type HelpKind = "subject" | "meal" | "ground";

export interface QuestionsTaskInput {
  language: Lang;
  kind: HelpKind;
  grade: number | null;
  subject: string | null;
  topic: string | null;
  count: number;
}

export interface ReviewTaskInput {
  language: Lang;
  kind: HelpKind;
  grade: number | null;
  subject: string | null;
  topic: string | null;
  items: { q: string; hint: string; fix: string; outcome: "good" | "some" | "weak" }[];
  note: string;
}

export interface IssueTaskInput {
  language: Lang;
  category: string;
  grade: number | null;
  subject: string | null;
  description: string;
}

// ---- coaching conversation advice ------------------------------------------------------------

export const coachOutputSchema = z.object({
  opening_line: z.string().trim().min(5).max(400),
  tips: z.array(z.string().trim().min(5).max(300)).min(1).max(6),
  if_disagrees: z.string().trim().min(5).max(400),
  close_with: z.string().trim().min(5).max(400),
  watch_outs: z.array(z.string().trim().min(5).max(300)).max(4).default([]),
});
export type CoachOutput = z.infer<typeof coachOutputSchema>;

export interface CoachTaskInput {
  language: Lang;
  grade: number;
  subject: string;
  card: { strength: string; priority_practice: string; next_step: string; ask_question: string; describe_statement: string; ask_again_question: string };
  /** Wording checks that did not pass (ids from `coach/checks.ts`). */
  weak_checks: string[];
}
