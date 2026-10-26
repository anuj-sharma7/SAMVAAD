/**
 * `?next=` after sign-in may only point to a path on THIS site. Anything else (another host, `//host`, backslashes, schemes,
 * control characters) falls back to the default, so the login page cannot be used as an open redirect.
 */
export function safeNext(raw: string | string[] | undefined | null, fallback = "/dashboard"): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 200) return fallback;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(v)) return fallback;
  if (v.startsWith("//") || v.includes("\\") || /%2f%2f|%5c|%0[0-9a-f]/i.test(v)) return fallback;
  return v;
}
