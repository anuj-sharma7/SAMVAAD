import type { Translator } from "./translate";

/**
 * Turns an API error into text in the interface language.
 * Server messages are written in English. English users keep that exact (often more specific) text;
 * Hindi users get the translated message for every known code, and the English server message only for unknown codes.
 */
export function errorText(err: { code?: string; message: string; status?: number }, tr: Pick<Translator, "t" | "locale">): string {
  if (tr.locale === "en" && err.message) return err.message;
  const code = err.code ?? "";
  const known = (c: string) => {
    const key = `errors.code.${c}`;
    const text = tr.t(key);
    return text === key ? null : text;
  };
  const byCode = code ? known(code) : null;
  if (byCode) return byCode;
  if (err.status === 503) return known("db_busy") ?? err.message;
  if (err.status === 429) return known("rate_limited") ?? err.message;
  if (err.status === 413) return known("payload_too_large") ?? err.message;
  if (err.status === 415) return known("unsupported_media_type") ?? err.message;
  return err.message || tr.t("errors.generic");
}
