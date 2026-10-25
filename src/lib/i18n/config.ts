export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** UI language preference (separate from the coaching/content language chosen per visit). */
export const LOCALE_COOKIE = "samvaad_locale";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const LOCALE_NAME: Record<Locale, string> = { en: "English", hi: "हिन्दी" };
/** BCP-47 tags used for Intl formatting. */
export const INTL_TAG: Record<Locale, string> = { en: "en-IN", hi: "hi-IN" };
