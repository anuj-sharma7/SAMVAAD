export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (negative if `to` is earlier). Uses calendar-day rounding. */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / DAY_MS);
}

export function addDays(date: Date | string, days: number): Date {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/** YYYY-MM-DD in UTC. */
export function isoDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Offline clients generate their own record ids (UUIDs); anything else is refused. */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
