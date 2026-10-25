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
