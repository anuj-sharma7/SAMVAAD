import { z } from "zod";
import { daysBetween, isoDate } from "../util";
import { DUE_SOON_DAYS, NO_RECENT_VISIT_DAYS } from "../config";

/**
 * E1 - Visit prioritiser (explainable rules).
 *
 * Orders a mentor's SCHOOLS for planning using operational signals only: open follow-ups,
 * time since the last visit and visits already scheduled. It uses no demographic attributes and
 * produces no teacher score or ranking; the unit is the school's follow-up need, with plain-language reasons.
 *
 * There is no trained model here and none is claimed. `Prioritiser` is the seam where a validated
 * model could be plugged in later, once real labelled data, consent and an evaluation plan exist.
 */
export const priorityRulesSchema = z.object({
  overdue_commitment: z.number().int().min(0).max(100),
  due_soon_commitment: z.number().int().min(0).max(100),
  unreviewed_completed_action: z.number().int().min(0).max(100),
  no_recent_visit: z.number().int().min(0).max(100),
  no_recent_visit_days: z.number().int().min(7).max(365),
  visit_scheduled_soon: z.number().int().min(0).max(100),
  visit_scheduled_soon_days: z.number().int().min(1).max(30),
  high_threshold: z.number().int().min(1).max(200),
  medium_threshold: z.number().int().min(1).max(200),
});
export type PriorityRules = z.infer<typeof priorityRulesSchema>;

export const DEFAULT_PRIORITY_RULES: PriorityRules = {
  overdue_commitment: 50,
  due_soon_commitment: 30,
  unreviewed_completed_action: 20,
  no_recent_visit: 25,
  no_recent_visit_days: NO_RECENT_VISIT_DAYS,
  visit_scheduled_soon: 15,
  visit_scheduled_soon_days: 3,
  high_threshold: 50,
  medium_threshold: 25,
};

export interface PriorityInput {
  schoolId: string;
  schoolName: string;
  lastCompletedAt: string | null;
  nextVisit: { id: string; scheduled_at: string; status: string } | null;
  commitments: { id: string; action_text: string; target_date: string; status: "open" | "completed" }[];
}

export interface PriorityReason {
  code: "overdue_commitment" | "due_today" | "due_soon" | "teacher_done" | "never_visited" | "no_recent_visit" | "visit_today" | "visit_soon";
  params: Record<string, string | number>;
  text: string;
}

export interface PriorityItem {
  schoolId: string;
  schoolName: string;
  level: "high" | "medium" | "low";
  points: number;
  reasons: string[];
  /** Structured twin of `reasons` (same order) so the UI can translate: render with `dashboard.reason.<code>`; an `n` param means a plural key. */
  reasonDetails: PriorityReason[];
  nextVisit: PriorityInput["nextVisit"];
}

export type Prioritiser = (inputs: PriorityInput[], rules: PriorityRules, today?: Date) => PriorityItem[];

const quote = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

export const rulePrioritiser: Prioritiser = (inputs, rules, today = new Date()) => {
  const t = isoDate(today);
  const items: PriorityItem[] = inputs.map((i) => {
    let points = 0;
    const reasons: string[] = [];
    const reasonDetails: PriorityReason[] = [];
    const add = (code: PriorityReason["code"], params: PriorityReason["params"], text: string) => {
      reasons.push(text);
      reasonDetails.push({ code, params, text });
    };

    for (const c of i.commitments) {
      const d = daysBetween(t, c.target_date);
      if (c.status === "open" && d < 0) {
        points += rules.overdue_commitment;
        add("overdue_commitment", { n: -d, action: quote(c.action_text) }, `Follow-up overdue by ${-d} day${-d === 1 ? "" : "s"}: “${quote(c.action_text)}”`);
      } else if (c.status === "open" && d <= DUE_SOON_DAYS) {
        points += rules.due_soon_commitment;
        add(d === 0 ? "due_today" : "due_soon", d === 0 ? { action: quote(c.action_text) } : { n: d, action: quote(c.action_text) }, `Follow-up due ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}: “${quote(c.action_text)}”`);
      } else if (c.status === "completed") {
        points += rules.unreviewed_completed_action;
        add("teacher_done", { action: quote(c.action_text) }, `Teacher marked an action as done; verify it at the next visit: “${quote(c.action_text)}”`);
      }
    }
    if (!i.lastCompletedAt) {
      points += rules.no_recent_visit;
      add("never_visited", {}, "No completed visit recorded yet");
    } else {
      const since = daysBetween(i.lastCompletedAt, today);
      if (since >= rules.no_recent_visit_days) {
        points += rules.no_recent_visit;
        add("no_recent_visit", { n: since }, `No completed visit for ${since} days`);
      }
    }
    if (i.nextVisit) {
      const d = daysBetween(t, isoDate(i.nextVisit.scheduled_at));
      if (d >= 0 && d <= rules.visit_scheduled_soon_days) {
        points += rules.visit_scheduled_soon;
        add(d === 0 ? "visit_today" : "visit_soon", d === 0 ? {} : { n: d }, `Visit scheduled ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}`);
      }
    }
    const level = points >= rules.high_threshold ? "high" : points >= rules.medium_threshold ? "medium" : "low";
    return { schoolId: i.schoolId, schoolName: i.schoolName, level, points, reasons, reasonDetails, nextVisit: i.nextVisit };
  });
  return items.filter((i) => i.points > 0).sort((a, b) => b.points - a.points || a.schoolName.localeCompare(b.schoolName));
};
