import { describe, expect, it } from "vitest";
import { BY_NAMESPACE, NAMESPACES, en, hi } from "@/lib/i18n/messages";
import { createTranslator, interpolate } from "@/lib/i18n/translate";
import { fmtDate, fmtNumber, relativeDaysT } from "@/lib/format";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /[A-Za-z]{4,}/;

describe("message dictionaries", () => {
  const keys = Object.keys(en);

  it("every English key has a Hindi translation and vice versa", () => {
    expect(Object.keys(hi).sort()).toEqual([...keys].sort());
  });

  it("no empty strings and no leftover TODO placeholders", () => {
    for (const [lang, dict] of [["en", en], ["hi", hi]] as const) {
      for (const [k, v] of Object.entries(dict)) {
        expect(v.trim(), `${lang}:${k} is empty`).not.toBe("");
        expect(v, `${lang}:${k} is a TODO placeholder`).not.toBe("TODO");
      }
    }
  });

  it("placeholders ({name}) match between English and Hindi for every key", () => {
    for (const k of keys) {
      expect(placeholders((hi as Record<string, string>)[k]), `placeholders differ for ${k}`).toEqual(placeholders((en as Record<string, string>)[k]));
    }
  });

  it("Hindi strings are actually Hindi (Devanagari) unless they are only symbols, numbers, acronyms or short brand words", () => {
    const offenders = keys.filter((k) => {
      const v = (hi as Record<string, string>)[k];
      return LATIN_WORD.test(v.replace(/\{\w+\}/g, "")) && !DEVANAGARI.test(v);
    });
    expect(offenders, `Hindi values with no Devanagari: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keys are unique across namespaces and start with their namespace name", () => {
    const seen = new Map<string, string>();
    for (const ns of NAMESPACES) {
      for (const k of Object.keys(BY_NAMESPACE[ns].en)) {
        expect(k.startsWith(`${ns}.`), `${k} should start with "${ns}."`).toBe(true);
        expect(seen.get(k), `${k} defined in both ${seen.get(k)} and ${ns}`).toBeUndefined();
        seen.set(k, ns);
      }
    }
  });

  it("plural keys come in complete _one/_other pairs", () => {
    for (const k of keys) {
      if (k.endsWith("_one")) expect(keys, `${k} has no _other`).toContain(k.replace(/_one$/, "_other"));
      if (k.endsWith("_other")) expect(keys, `${k} has no _one`).toContain(k.replace(/_other$/, "_one"));
    }
  });
});

describe("translator", () => {
  it("interpolates, pluralises and falls back with a report instead of silently showing nothing", () => {
    const missing: string[] = [];
    const tr = createTranslator("en", { "a.b": "Hello {name}", "a.c_one": "{n} item", "a.c_other": "{n} items" }, {}, (k) => missing.push(k));
    expect(tr.t("a.b", { name: "Asha" })).toBe("Hello Asha");
    expect(tr.tp("a.c", 1)).toBe("1 item");
    expect(tr.tp("a.c", 5)).toBe("5 items");
    expect(tr.t("a.nope")).toBe("a.nope");
    expect(missing).toEqual(["a.nope"]);
    expect(interpolate("x {y}", {})).toBe("x {y}"); // unknown placeholder stays visible
  });

  it("falls back to English text when a Hindi key is missing", () => {
    const missing: string[] = [];
    const tr = createTranslator("hi", {}, { "k.x": "English text" }, (k) => missing.push(k));
    expect(tr.t("k.x")).toBe("English text");
    expect(missing).toEqual(["k.x"]);
  });

  it("Hindi plural rules treat 0 and 1 as singular", () => {
    const tr = createTranslator("hi", hi, en);
    expect(tr.tp("common.rel.ago", 3)).toBe("3 दिन पहले");
  });
});

describe("locale-aware formatting", () => {
  it("formats dates and numbers per language and keeps India time", () => {
    const d = "2026-03-05T20:00:00Z"; // 6 Mar 2026, 01:30 IST
    expect(fmtDate(d, "en")).toMatch(/6 Mar 2026/);
    expect(fmtDate(d, "hi")).toMatch(/[ऀ-ॿ]/);
    expect(fmtDate(d, "hi")).toMatch(/6/);
    expect(fmtNumber(1471473, "en")).toBe("14,71,473"); // Indian digit grouping
    expect(fmtNumber(1471473, "hi")).toBe("14,71,473");
  });

  it("relative days are translated and pluralised", () => {
    const now = new Date("2026-03-10T05:00:00Z");
    const en_ = createTranslator("en", en, en);
    const hi_ = createTranslator("hi", hi, en);
    expect(relativeDaysT("2026-03-11T05:00:00Z", en_, now)).toBe("tomorrow");
    expect(relativeDaysT("2026-03-07T05:00:00Z", en_, now)).toBe("3 days ago");
    expect(relativeDaysT("2026-03-07T05:00:00Z", hi_, now)).toBe("3 दिन पहले");
    expect(relativeDaysT(null, hi_, now)).toBe("कभी नहीं");
  });
});
