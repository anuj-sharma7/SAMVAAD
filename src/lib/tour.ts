import type { Role } from "./types";

/**
 * The steps of the first-run tour. Text lives in the `help.tour.<id>.title` and `.body` messages (English and Hindi).
 * A step may point at a menu item (`target` is that item's link) so the tour can highlight it on a wide screen, and may be
 * limited to some roles (supervisors and curators do not use Mentor Help or field mode).
 */
export interface TourStep {
  id: string;
  target?: string;
  roles?: readonly Role[];
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "s1" },
  { id: "s2" },
  { id: "s3" },
  { id: "s4" },
  { id: "s5", target: "/mentor-help", roles: ["mentor"] },
  { id: "s6", roles: ["mentor"] },
  { id: "s7", target: "/field", roles: ["mentor"] },
];

/** The steps this role should see, in order. */
export function stepsFor(role: Role): TourStep[] {
  return TOUR_STEPS.filter((s) => !s.roles || s.roles.includes(role));
}
