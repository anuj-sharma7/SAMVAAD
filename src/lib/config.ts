/** Tunable operational constants. Kept in one place so they are inspectable (see Settings page). */

/** A pending commitment is "due soon" when its target date is within this many days. */
export const DUE_SOON_DAYS = 5;

/** Days without a completed visit after which a school is flagged as "no recent visit". */
export const NO_RECENT_VISIT_DAYS = 45;

/** Default coaching commitment window: target date = visit date + this many days. */
export const DEFAULT_COMMITMENT_DAYS = 14;
