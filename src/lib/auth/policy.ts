import type { Actor, Role } from "../types";
import { forbidden } from "../errors";

/**
 * Central authorization policy. Every service function that touches records calls one of these;
 * hiding a button in the UI is only a convenience on top, never the control itself.
 *
 *  mentor      - full access to visits they own, for schools they are actively assigned to.
 *  supervisor  - operational metadata and aggregates only. NO observation text, feedback text or
 *                commitment evidence. Aggregates use a minimum group size (see analytics.ts).
 *  diet_admin  - practice-card library management and the library audit trail. No visit content.
 */
export const MIN_GROUP_SIZE = 5;

export type Action =
  | "school:read"
  | "school:create"
  | "school:assign"
  | "visit:create"
  | "visit:read_content"
  | "visit:write"
  | "card:read_approved"
  | "card:read_all"
  | "card:write"
  | "card:review"
  | "audit:read_all"
  | "audit:read_library"
  | "analytics:read"
  | "settings:write_rules";

const MATRIX: Record<Action, Role[]> = {
  "school:read": ["mentor", "supervisor", "diet_admin"],
  "school:create": ["supervisor"],
  "school:assign": ["supervisor"],
  "visit:create": ["mentor"],
  "visit:read_content": ["mentor"],
  "visit:write": ["mentor"],
  "card:read_approved": ["mentor", "supervisor", "diet_admin"],
  "card:read_all": ["diet_admin"],
  "card:write": ["diet_admin"],
  "card:review": ["diet_admin"],
  "audit:read_all": ["supervisor"],
  "audit:read_library": ["diet_admin"],
  "analytics:read": ["supervisor"],
  "settings:write_rules": ["supervisor"],
};

export function can(actor: Actor, action: Action): boolean {
  return MATRIX[action].includes(actor.role);
}

export function requireRole(actor: Actor, action: Action): void {
  if (!can(actor, action)) {
    throw forbidden(`Your role (${actor.role}) is not permitted to perform "${action}"`);
  }
}
