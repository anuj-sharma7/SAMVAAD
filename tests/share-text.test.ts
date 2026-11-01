import { describe, expect, it } from "vitest";
import { questionSetText } from "@/lib/help/share-text";

const labels = { who: { students: "Ask the children", cook: "Ask the cook" }, hint: "Good answer", tip: "Tip" };

describe("question set as plain text", () => {
  it("numbers the questions and adds who to ask and what a good answer sounds like", () => {
    const text = questionSetText("Class 3 · Maths", "Ask how they thought", [
      { q: "46 + 27?", hint: "73", who: "students" },
      { q: "Where is the grain stored?", hint: "", who: "cook" },
    ], labels);
    expect(text).toBe([
      "Class 3 · Maths", "",
      "1. 46 + 27?", "   (Ask the children)", "   Good answer: 73", "",
      "2. Where is the grain stored?", "   (Ask the cook)", "",
      "Tip: Ask how they thought", "",
    ].join("\n"));
  });

  it("leaves out an empty tip and falls back to the raw role name", () => {
    const text = questionSetText("T", "  ", [{ q: "Q?", hint: " ", who: "smc" }], labels);
    expect(text).toContain("(smc)");
    expect(text).not.toContain("Tip");
    expect(text.endsWith("\n")).toBe(true);
  });
});
