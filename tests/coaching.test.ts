import { describe, expect, it } from "vitest";
import { asha, freshDb, rakesh, meena } from "./helpers";
import { addObservation } from "@/lib/services/observations";
import { transitionVisit, listVisits } from "@/lib/services/visits";
import { generateFeedback } from "@/lib/services/feedback";
import { coachAdvice } from "@/lib/services/coaching";
import { checkCard, CHECK_IDS, type CardText } from "@/lib/coach/checks";
import type { AiProvider } from "@/lib/ai/provider";

const good: CardText = {
  strength: "You asked the children to retell the story in their own words and four of them took part.",
  priority_practice: "Asking why-questions after reading.",
  next_step: "Ask two why-questions after one story, on two days this week.",
  ask_question: "What did you notice about how the children answered?",
  describe_statement: "I saw that when you asked why, three children gave full sentences instead of one word.",
  ask_again_question: "Which why-question could you try before my next visit?",
};

describe("coaching card wording check", () => {
  it("passes a clear card and names every check", () => {
    const r = checkCard(good);
    expect(r.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(r.filter((c) => !c.ok)).toEqual([]);
  });

  it("flags vague strength, long multi-step plans, no time, closed questions and harsh words", () => {
    const bad = checkCard({
      strength: "Good.", priority_practice: "", next_step: "Do group work and then use TLM and also change the seating and plan better lessons for everything",
      ask_question: "", describe_statement: "Bad teacher.", ask_again_question: "Fine.",
    });
    const failed = bad.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["strength", "focus", "oneStep", "timeCue", "questions", "evidence", "kindWords"]));
  });

  it("understands Hinglish cards too", () => {
    const hi = checkCard({
      strength: "आपने बच्चों से कहानी अपने शब्दों में दोबारा सुनाने को कहा और चार बच्चों ने हिस्सा लिया।",
      priority_practice: "पढ़ने के बाद 'क्यों' वाले सवाल पूछना।",
      next_step: "इस हफ़्ते दो दिन एक कहानी के बाद दो 'क्यों' वाले सवाल पूछें।",
      ask_question: "बच्चों के जवाब में आपने क्या देखा?", describe_statement: "मैंने देखा कि 'क्यों' पूछने पर तीन बच्चों ने पूरे वाक्य में जवाब दिया।",
      ask_again_question: "अगली विज़िट से पहले आप कौन-सा सवाल आज़माएँगे?",
    });
    expect(hi.filter((c) => !c.ok)).toEqual([]);
  });
});

async function draft() {
  const db = freshDb();
  const me = asha(db);
  const v = listVisits(db, me, { status: "planned" }).items[0];
  transitionVisit(db, me, v.id, "in_progress");
  addObservation(db, me, v.id, { practice_observed: "Teacher read a story aloud and asked recall questions", evidence: "Children answered in single words when asked what happened." });
  const fb = await generateFeedback(db, me, v.id, { language: "hi", use_demo_provider: true });
  return { db, me, fb, visitId: v.id };
}

describe("coaching conversation advice", () => {
  it("gives Hinglish advice from the live wording, flags weak checks, and changes nothing", async () => {
    const { db, me, fb } = await draft();
    const a = await coachAdvice(db, me, fb.id, { strength: "Good.", next_step: "Try it", use_demo_provider: true, language: "hi" });
    expect(a.is_simulated).toBe(true);
    expect(a.weak_checks).toEqual(expect.arrayContaining(["strength", "timeCue"]));
    expect(a.opening_line).toMatch(/[ऀ-ॿ]/);
    expect(a.tips.length).toBeGreaterThan(1);
    expect(a.if_disagrees).toBeTruthy();
    expect(a.close_with).toBeTruthy();
    // the saved card is untouched
    const { get } = await import("@/lib/db/client");
    expect(get<{ status: string; strength: string }>(db, "SELECT status, strength FROM feedback_drafts WHERE id = ?", fb.id)!.strength).toBe(fb.strength);
  });

  it("works on the saved card when no wording is sent, and in English", async () => {
    const { db, me, fb } = await draft();
    const a = await coachAdvice(db, me, fb.id, { use_demo_provider: true, language: "en" });
    expect(a.opening_line).toMatch(/^"I liked this/);
  });

  it("is private to the mentor who owns the visit", async () => {
    const { db, fb } = await draft();
    await expect(coachAdvice(db, rakesh(db), fb.id, { use_demo_provider: true })).rejects.toThrow(/not found/i);
    await expect(coachAdvice(db, meena(db), fb.id, { use_demo_provider: true })).rejects.toThrow();
  });

  it("discards model advice that judges or scores the teacher, and malformed output", async () => {
    const { db, me, fb } = await draft();
    const judging: AiProvider = { id: "x", label: "x", simulated: false, generate: async () => ({ json: { opening_line: "This is a poor teacher overall", tips: ["Be firm with them"], if_disagrees: "Insist on it", close_with: "Give a 3/5 rating", watch_outs: [] }, provider: "x", model: "m", simulated: false }) };
    await expect(coachAdvice(db, me, fb.id, {}, { provider: judging })).rejects.toThrow(/evaluative/i);
    const broken: AiProvider = { id: "x", label: "x", simulated: false, generate: async () => ({ json: { nope: 1 }, provider: "x", model: "m", simulated: false }) };
    await expect(coachAdvice(db, me, fb.id, {}, { provider: broken })).rejects.toThrow(/required structure/i);
  });
});
