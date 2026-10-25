"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createTranslator, type Messages, type Translator } from "./translate";

const Ctx = createContext<Translator | null>(null);

/** Receives only the active locale's dictionary from the server layout; the key-parity test guarantees no missing keys. */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => createTranslator(locale, messages, messages), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Translator {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}
