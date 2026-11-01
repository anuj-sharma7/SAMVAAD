import { z } from "zod";
import { all, get, run, transaction, type Db } from "../db/client";
import { newId, nowIso, parseJson } from "../util";
import { AppError, conflict, invalid, notFound } from "../errors";
import { requireRole } from "../auth/policy";
import { audit } from "./audit";
import { isActivelyAssigned } from "./access";
import { containsEvaluativeLanguage, mapProviderError } from "./feedback";
import { getProvider, AI_TIMEOUT_MS } from "../ai";
import type { AiProvider } from "../ai/provider";
import {
  issueSuggestionSchema, questionsOutputSchema, reviewOutputSchema,
  type IssueSuggestion, type IssueTaskInput, type QuestionsOutput, type QuestionsTaskInput, type ReviewOutput, type ReviewTaskInput,
} from "../ai/schemas";
import { issuePrompts, questionsPrompts, reviewPrompts } from "../ai/help-prompts";
import {
  HELP_GRADES, HELP_SUBJECTS, ISSUE_CATEGORIES, ISSUE_STATUSES, OUTCOMES, SESSION_KINDS, subjectsForGrade, validTopic,
  type IssueCategory, type IssueStatus, type Outcome, type SessionKind,
} from "../help/catalog";
import type { Actor, Lang } from "../types";

type Deps = { provider?: AiProvider };
const providerFor = (deps: Deps, useDemo?: boolean) => deps.provider ?? getProvider(process.env, useDemo ? "demo" : undefined);

function guardOutput<T>(text: string, out: T): T {
  if (containsEvaluativeLanguage(text)) {
    throw new AppError(502, "unsafe_output", "The AI text contained evaluative language about a teacher, which SAMVAAD does not allow. It was discarded.");
  }
  return out;
}

function parseOutput<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, "invalid_model_output", "The AI response did not match the required structure.", parsed.error.issues.map((i) => i.message));
  }
  return parsed.data;
}

// =============================================================================================
// Academic problems
// =============================================================================================

export interface AcademicIssue {
  id: string;
  school_id: string | null;
  school_name: string | null;
  category: IssueCategory;
  grade: number | null;
  subject: string | null;
  description: string;
  status: IssueStatus;
  resolution_note: string;
  suggestion: IssueSuggestion | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface IssueRaw extends Omit<AcademicIssue, "suggestion" | "is_simulated"> { suggestion: string; is_simulated: number }

const ISSUE_SELECT = `SELECT i.*, s.name AS school_name FROM academic_issues i LEFT JOIN schools s ON s.id = i.school_id`;

function mapIssue(r: IssueRaw): AcademicIssue {
  const sug = parseJson<Partial<IssueSuggestion>>(r.suggestion, {});
  return { ...r, suggestion: sug.suggestions?.length && sug.first_step ? (sug as IssueSuggestion) : null, is_simulated: !!r.is_simulated };
}

const gradeField = z.coerce.number().int().refine((g) => (HELP_GRADES as readonly number[]).includes(g), "Class must be 1 to 8");
const subjectField = z.enum(HELP_SUBJECTS);

export const createIssueSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().trim().min(3).max(800),
  school_id: z.string().max(60).nullish(),
  grade: gradeField.nullish(),
  subject: subjectField.nullish(),
  language: z.enum(["en", "hi"]).optional(),
  use_demo_provider: z.boolean().optional(),
});

async function suggestFor(task: IssueTaskInput, deps: Deps, useDemo?: boolean) {
  const res = await providerFor(deps, useDemo).generate({ task: { task: "issue", input: task }, ...issuePrompts(task), timeoutMs: AI_TIMEOUT_MS });
  const out = parseOutput(issueSuggestionSchema, res.json);
  guardOutput(out.suggestions.join("\n") + out.first_step, out);
  return { out, meta: { provider: res.provider, model: res.model, simulated: res.simulated } };
}

/** Logs a problem. The AI suggestion is a bonus: if the model fails the problem is still saved and the suggestion can be requested again. */
export async function createIssue(db: Db, actor: Actor, input: unknown, deps: Deps = {}): Promise<AcademicIssue & { suggestion_error: string | null }> {
  requireRole(actor, "help:use");
  const d = createIssueSchema.parse(input);
  if (d.school_id && !isActivelyAssigned(db, actor.id, d.school_id)) throw notFound("School");
  const language: Lang = d.language ?? actor.preferredLanguage;
  const id = newId();
  const ts = nowIso();

  let suggestion: IssueSuggestion | null = null;
  let meta: { provider: string; model: string | null; simulated: boolean } | null = null;
  let suggestionError: string | null = null;
  try {
    const r = await suggestFor({ language, category: d.category, grade: d.grade ?? null, subject: d.subject ?? null, description: d.description }, deps, d.use_demo_provider);
    suggestion = r.out;
    meta = r.meta;
  } catch (err) {
    suggestionError = mapProviderError(err).message;
  }

  transaction(db, () => {
    run(
      db,
      `INSERT INTO academic_issues (id, mentor_id, school_id, category, grade, subject, description, status, suggestion, provider, model, is_simulated, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'open', ?,?,?,?,?,?)`,
      id, actor.id, d.school_id ?? null, d.category, d.grade ?? null, d.subject ?? null, d.description,
      suggestion ? JSON.stringify(suggestion) : "{}", meta?.provider ?? null, meta?.model ?? null, meta ? (meta.simulated ? 1 : 0) : 1, ts, ts,
    );
    audit(db, actor, "help_issue.created", "academic_issue", id, { category: d.category, has_suggestion: !!suggestion });
  });
  return { ...getIssue(db, actor, id), suggestion_error: suggestionError };
}

export function getIssue(db: Db, actor: Actor, id: string): AcademicIssue {
  requireRole(actor, "help:use");
  const row = get<IssueRaw>(db, `${ISSUE_SELECT} WHERE i.id = ? AND i.mentor_id = ?`, id, actor.id);
  if (!row) throw notFound("Problem");
  return mapIssue(row);
}

export interface IssueSummary {
  total: number;
  by_status: Record<IssueStatus, number>;
  by_category: Partial<Record<IssueCategory, number>>;
}

export function listIssues(db: Db, actor: Actor, filter: { status?: string | null } = {}): { items: AcademicIssue[]; summary: IssueSummary } {
  requireRole(actor, "help:use");
  const status = filter.status && (ISSUE_STATUSES as readonly string[]).includes(filter.status) ? filter.status : null;
  const rows = all<IssueRaw>(db, `${ISSUE_SELECT} WHERE i.mentor_id = ? ${status ? "AND i.status = ?" : ""} ORDER BY i.updated_at DESC LIMIT 200`, ...(status ? [actor.id, status] : [actor.id]));
  const everything = all<{ status: IssueStatus; category: IssueCategory; n: number }>(db, "SELECT status, category, count(*) AS n FROM academic_issues WHERE mentor_id = ? GROUP BY status, category", actor.id);
  const summary: IssueSummary = { total: 0, by_status: { open: 0, in_progress: 0, resolved: 0 }, by_category: {} };
  for (const r of everything) {
    summary.total += r.n;
    summary.by_status[r.status] += r.n;
    summary.by_category[r.category] = (summary.by_category[r.category] ?? 0) + r.n;
  }
  return { items: rows.map(mapIssue), summary };
}

export const updateIssueSchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  resolution_note: z.string().trim().max(500).optional(),
});

export function updateIssue(db: Db, actor: Actor, id: string, input: unknown): AcademicIssue {
  const current = getIssue(db, actor, id);
  const d = updateIssueSchema.parse(input);
  if (d.status === undefined && d.resolution_note === undefined) throw invalid("Nothing to update");
  const status = d.status ?? current.status;
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      "UPDATE academic_issues SET status = ?, resolution_note = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
      status, d.resolution_note ?? current.resolution_note, status === "resolved" ? (current.resolved_at ?? ts) : null, ts, id,
    );
    audit(db, actor, "help_issue.updated", "academic_issue", id, { status });
  });
  return getIssue(db, actor, id);
}

/** Ask for the suggestion again (e.g. after a failed or simulated one). */
export async function resuggestIssue(db: Db, actor: Actor, id: string, input: unknown = {}, deps: Deps = {}): Promise<AcademicIssue> {
  const issue = getIssue(db, actor, id);
  const o = z.object({ language: z.enum(["en", "hi"]).optional(), use_demo_provider: z.boolean().optional() }).parse(input ?? {});
  let r;
  try {
    r = await suggestFor({ language: o.language ?? actor.preferredLanguage, category: issue.category, grade: issue.grade, subject: issue.subject, description: issue.description }, deps, o.use_demo_provider);
  } catch (err) {
    throw mapProviderError(err);
  }
  run(db, "UPDATE academic_issues SET suggestion = ?, provider = ?, model = ?, is_simulated = ?, updated_at = ? WHERE id = ?", JSON.stringify(r.out), r.meta.provider, r.meta.model, r.meta.simulated ? 1 : 0, nowIso(), id);
  return getIssue(db, actor, id);
}

// =============================================================================================
// Question sets (subject by class, mid-day meal, school ground) and their review
// =============================================================================================

export interface HelpQuestion { q: string; hint: string; who: string; fix: string }
export interface HelpSession {
  id: string;
  kind: SessionKind;
  grade: number | null;
  subject: string | null;
  topic: string | null;
  language: Lang;
  questions: HelpQuestion[];
  tip: string;
  outcomes: Record<string, Outcome>;
  note: string;
  review: ReviewOutput | null;
  provider: string;
  model: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
}

interface SessionRaw extends Omit<HelpSession, "questions" | "outcomes" | "review" | "is_simulated"> {
  questions: string; outcomes: string; review: string | null; is_simulated: number; mentor_id: string;
}

function mapSession(r: SessionRaw): HelpSession {
  const { mentor_id: _m, ...rest } = r;
  void _m;
  return {
    ...rest,
    questions: parseJson<HelpQuestion[]>(r.questions, []),
    outcomes: parseJson<Record<string, Outcome>>(r.outcomes, {}),
    review: r.review ? parseJson<ReviewOutput | null>(r.review, null) : null,
    is_simulated: !!r.is_simulated,
  };
}

export const generateQuestionsSchema = z
  .object({
    kind: z.enum(SESSION_KINDS),
    grade: gradeField.nullish(),
    subject: subjectField.nullish(),
    topic: z.string().max(30).nullish(),
    count: z.coerce.number().int().min(1).max(10).default(5),
    language: z.enum(["en", "hi"]).optional(),
    use_demo_provider: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "subject") {
      if (!v.grade) ctx.addIssue({ code: "custom", message: "Choose a class", path: ["grade"] });
      else if (!v.subject) ctx.addIssue({ code: "custom", message: "Choose a subject", path: ["subject"] });
      else if (!subjectsForGrade(v.grade).includes(v.subject)) ctx.addIssue({ code: "custom", message: "This subject starts in a higher class", path: ["subject"] });
    }
    if (!validTopic(v.kind, v.topic)) ctx.addIssue({ code: "custom", message: "Choose a topic", path: ["topic"] });
  });

const ROLE_HOLDERS = new Set(["students", "cook", "teacher", "head", "smc"]);

export async function generateQuestions(db: Db, actor: Actor, input: unknown, deps: Deps = {}): Promise<HelpSession> {
  requireRole(actor, "help:use");
  const d = generateQuestionsSchema.parse(input);
  const language: Lang = d.language ?? actor.preferredLanguage;
  const task: QuestionsTaskInput = {
    language, kind: d.kind, grade: d.kind === "subject" ? d.grade! : null, subject: d.kind === "subject" ? d.subject! : null,
    topic: d.kind === "subject" ? null : d.topic!, count: d.count,
  };
  let out: QuestionsOutput;
  let meta: { provider: string; model: string | null; simulated: boolean };
  try {
    const res = await providerFor(deps, d.use_demo_provider).generate({ task: { task: "questions", input: task }, ...questionsPrompts(task), timeoutMs: AI_TIMEOUT_MS, maxTokens: 3000 });
    meta = { provider: res.provider, model: res.model, simulated: res.simulated };
    out = parseOutput(questionsOutputSchema, res.json);
    guardOutput(out.questions.map((x) => `${x.q} ${x.hint} ${x.fix}`).join("\n") + out.tip, out);
  } catch (err) {
    throw mapProviderError(err);
  }
  if (out.questions.length === 0) throw conflict("no_questions", "No questions are available for this choice yet. Try another class or subject.");
  const questions: HelpQuestion[] = out.questions.slice(0, d.count).map((x) => ({ q: x.q, hint: x.hint, who: ROLE_HOLDERS.has(x.who) ? x.who : "students", fix: x.fix }));
  const id = newId();
  const ts = nowIso();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO help_sessions (id, mentor_id, kind, grade, subject, topic, language, questions, tip, provider, model, is_simulated, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, actor.id, d.kind, task.grade, task.subject, task.topic, language, JSON.stringify(questions), out.tip, meta.provider, meta.model, meta.simulated ? 1 : 0, ts, ts,
    );
    audit(db, actor, "help_questions.generated", "help_session", id, { kind: d.kind, grade: task.grade, subject: task.subject, topic: task.topic, provider: meta.provider, simulated: meta.simulated, count: questions.length });
  });
  return getSession(db, actor, id);
}

export function getSession(db: Db, actor: Actor, id: string): HelpSession {
  requireRole(actor, "help:use");
  const row = get<SessionRaw>(db, "SELECT * FROM help_sessions WHERE id = ? AND mentor_id = ?", id, actor.id);
  if (!row) throw notFound("Question set");
  return mapSession(row);
}

export function listSessions(db: Db, actor: Actor, filter: { kind?: string | null } = {}): HelpSession[] {
  requireRole(actor, "help:use");
  const kind = filter.kind && (SESSION_KINDS as readonly string[]).includes(filter.kind) ? filter.kind : null;
  return all<SessionRaw>(db, `SELECT * FROM help_sessions WHERE mentor_id = ? ${kind ? "AND kind = ?" : ""} ORDER BY created_at DESC LIMIT 30`, ...(kind ? [actor.id, kind] : [actor.id])).map(mapSession);
}

export const reviewSchema = z.object({
  outcomes: z.record(z.string().max(3), z.enum(OUTCOMES)),
  note: z.string().trim().max(600).default(""),
  language: z.enum(["en", "hi"]).optional(),
  use_demo_provider: z.boolean().optional(),
});

/** Saves how each question went and returns an instant AI review with a suggestion per problem. */
export async function reviewSession(db: Db, actor: Actor, id: string, input: unknown, deps: Deps = {}): Promise<HelpSession> {
  const session = getSession(db, actor, id);
  const d = reviewSchema.parse(input);
  const outcomes: Record<string, Outcome> = {};
  for (const [k, v] of Object.entries(d.outcomes)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= session.questions.length) throw invalid(`Unknown question number: ${k}`);
    outcomes[String(idx)] = v;
  }
  const items = session.questions.flatMap((q, idx) => (outcomes[String(idx)] ? [{ q: q.q, hint: q.hint, fix: q.fix, outcome: outcomes[String(idx)] }] : []));
  if (items.length === 0) throw invalid("Tap how at least one question went");

  const task: ReviewTaskInput = { language: d.language ?? session.language, kind: session.kind, grade: session.grade, subject: session.subject, topic: session.topic, items, note: d.note };
  let out: ReviewOutput;
  let meta: { provider: string; model: string | null; simulated: boolean };
  try {
    const res = await providerFor(deps, d.use_demo_provider).generate({ task: { task: "review", input: task }, ...reviewPrompts(task), timeoutMs: AI_TIMEOUT_MS, maxTokens: 2000 });
    meta = { provider: res.provider, model: res.model, simulated: res.simulated };
    out = parseOutput(reviewOutputSchema, res.json);
    guardOutput([out.summary, out.next_step, ...out.suggestions.map((s) => s.text)].join("\n"), out);
  } catch (err) {
    throw mapProviderError(err);
  }
  const ts = nowIso();
  transaction(db, () => {
    run(db, "UPDATE help_sessions SET outcomes = ?, note = ?, review = ?, provider = ?, model = ?, is_simulated = ?, updated_at = ? WHERE id = ?", JSON.stringify(outcomes), d.note, JSON.stringify(out), meta.provider, meta.model, meta.simulated ? 1 : 0, ts, id);
    // Audit counts only; never the mentor's note.
    audit(db, actor, "help_review.generated", "help_session", id, { kind: session.kind, good: items.filter((x) => x.outcome === "good").length, some: items.filter((x) => x.outcome === "some").length, weak: items.filter((x) => x.outcome === "weak").length });
  });
  return getSession(db, actor, id);
}
