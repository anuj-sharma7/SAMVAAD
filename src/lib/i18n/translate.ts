import { INTL_TAG, type Locale } from "./config";

export type Params = Record<string, string | number>;
export type Messages = Record<string, string>;

/** Replace {name} placeholders. Unknown placeholders are left visible so a mistake is noticed, not hidden. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export interface Translator {
  locale: Locale;
  /** Translate a key. Falls back to the English text, then to the key itself, and reports the miss. */
  t: (key: string, params?: Params) => string;
  /** Plural-aware: uses `${key}_one` / `${key}_other` chosen by Intl.PluralRules for the locale; `{n}` is filled in. */
  tp: (key: string, n: number, params?: Params) => string;
}

export function createTranslator(
  locale: Locale,
  messages: Messages,
  fallback: Messages,
  onMissing: (key: string, locale: Locale) => void = () => {},
): Translator {
  const rules = new Intl.PluralRules(INTL_TAG[locale]);
  const t = (key: string, params?: Params) => {
    let text = messages[key];
    if (text === undefined || text === "") {
      onMissing(key, locale);
      text = fallback[key] ?? key;
    }
    return interpolate(text, params);
  };
  const tp = (key: string, n: number, params?: Params) => {
    const form = rules.select(n) === "one" ? "one" : "other";
    return t(`${key}_${form}`, { n, ...params });
  };
  return { locale, t, tp };
}
