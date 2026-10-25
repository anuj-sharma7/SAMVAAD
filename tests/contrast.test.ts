import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** WCAG 2.x contrast checks for the colour tokens defined in globals.css. */
const css = fs.readFileSync(path.join(import.meta.dirname, "../src/app/globals.css"), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`missing token ${name}`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(token(a)), lum(token(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS: [string, string, number][] = [
  ["ink-900", "paper", 4.5],
  ["ink-900", "card", 4.5],
  ["ink-600", "paper", 4.5],
  ["ink-600", "card", 4.5],
  ["ink-700", "ink-50", 4.5],
  ["ink-600", "ink-50", 4.5],
  ["teal-700", "card", 4.5],
  ["teal-700", "teal-50", 4.5],
  ["amber-800", "amber-50", 4.5],
  ["red-700", "red-50", 4.5],
  ["red-700", "card", 4.5],
  ["card", "ink-900", 4.5],
  ["card", "teal-700", 4.5], // white text on the accent button
  ["card", "ink-700", 4.5],
  ["ink-100", "ink-900", 4.5], // sidebar link text
  ["ink-900", "teal-100", 4.5],
];

describe("design tokens meet WCAG AA contrast", () => {
  for (const [fg, bg, min] of PAIRS) {
    it(`${fg} on ${bg} >= ${min}:1`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  }
});
