import { get, run, transaction, type Db } from "../db/client";
import { nowIso, parseJson } from "../util";
import { invalid } from "../errors";
import { requireRole } from "../auth/policy";
import { audit } from "./audit";
import { DEFAULT_PRIORITY_RULES, priorityRulesSchema, type PriorityRules } from "../engines/prioritizer";
import { z } from "zod";
import type { Actor } from "../types";

export function getPriorityRules(db: Db): PriorityRules {
  const row = get<{ value: string }>(db, "SELECT value FROM app_settings WHERE key = 'priority_rules'");
  const parsed = priorityRulesSchema.safeParse({ ...DEFAULT_PRIORITY_RULES, ...parseJson<object>(row?.value, {}) });
  return parsed.success ? parsed.data : DEFAULT_PRIORITY_RULES;
}

export function setPriorityRules(db: Db, actor: Actor, input: unknown): PriorityRules {
  requireRole(actor, "settings:write_rules");
  const rules = priorityRulesSchema.parse(input);
  if (rules.medium_threshold > rules.high_threshold) {
    throw invalid("The medium threshold cannot be higher than the high threshold");
  }
  transaction(db, () => {
    run(
      db,
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('priority_rules', ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      JSON.stringify(rules), actor.id, nowIso(),
    );
    audit(db, actor, "settings.priority_rules_updated", "settings", "priority_rules", {});
  });
  return rules;
}

export const preferencesSchema = z
  .object({ preferred_language: z.enum(["en", "hi"]).optional(), ui_language: z.enum(["en", "hi"]).optional() })
  .refine((v) => v.preferred_language || v.ui_language, "Choose a language");

/** preferred_language = default language for coaching drafts; ui_language = interface language. They are independent. */
export function updatePreferences(db: Db, actor: Actor, input: unknown) {
  const d = preferencesSchema.parse(input);
  if (d.preferred_language) run(db, "UPDATE profiles SET preferred_language = ?, updated_at = ? WHERE id = ?", d.preferred_language, nowIso(), actor.id);
  if (d.ui_language) run(db, "UPDATE profiles SET ui_language = ?, updated_at = ? WHERE id = ?", d.ui_language, nowIso(), actor.id);
  return { preferred_language: d.preferred_language, ui_language: d.ui_language };
}
