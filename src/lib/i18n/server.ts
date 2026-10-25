import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createTranslator, type Translator } from "./translate";
import { en, hi } from "./messages";
import { getActor } from "../server/context";

const DICT = { en, hi } as const;

/** UI locale for this request: explicit cookie > signed-in profile preference > English. Cached per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const actor = await getActor();
  return actor?.uiLanguage ?? DEFAULT_LOCALE;
});

export const getI18n = cache(async (): Promise<Translator> => {
  const locale = await getLocale();
  return createTranslator(locale, DICT[locale], en, (key, l) => {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing ${l} translation: ${key}`);
  });
});

export const messagesFor = (locale: Locale): Record<string, string> => DICT[locale];
