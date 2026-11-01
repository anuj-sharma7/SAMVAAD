import type { AiProvider, AiRequest, AiResponse } from "./provider";
import type { CardContext, DemonstrationTaskInput, FeedbackTaskInput } from "./schemas";
import { composeIssueSuggestion, composeQuestions, composeReview } from "../help/compose";

/**
 * Deterministic, offline "provider". It assembles output from the mentor's own words and the
 * retrieved approved cards using fixed templates. It is NOT a language model and every response
 * is flagged `simulated: true`; the UI labels it "Simulated AI output".
 * Same input always yields the same output, which keeps demos and tests reproducible.
 *
 * Hindi text is written the way mentors talk: Devanagari with everyday English words (टीचर, स्टेप, क्लास, ट्राई),
 * not formal textbook Hindi.
 */

const snip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim().replace(/[.।]+$/u, "");
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}…`;
};
const firstSentence = (s: string) => snip(s.split(/(?<=[.।])\s/u)[0] ?? s, 220);
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;

export function composeFeedback(i: FeedbackTaskInput) {
  const hi = i.language === "hi";
  const [primary, ...rest] = i.cards;
  if (!primary) {
    return { insufficient_evidence: true, needs_mentor_review: true, citations: [], evidence: [] };
  }
  const L = hi ? primary.hi : undefined;
  const strengthSource =
    i.observations.find((o) => o.worked_well)?.worked_well ?? i.observations[0]?.practice_observed ?? "";
  const evidenceText = i.observations[0]?.evidence ?? "";

  const citations = [primary, ...rest.filter((c) => (c.score ?? 0) >= 0.6 * (primary.score ?? 1))]
    .slice(0, 2)
    .map((c) => ({ practice_card_id: c.id }));

  return {
    strength: hi ? `अच्छी बात: ${snip(strengthSource, 220)}।` : `${snip(strengthSource, 240)}.`,
    priority_practice: hi && L ? `${L.title}: ${snip(L.summary, 240)}` : `${primary.title}: ${firstSentence(primary.description)}`,
    next_step: hi && L ? L.next_step : primary.next_step,
    coaching_questions: hi
      ? {
          ask: "आपने जैसा प्लान किया था, क्लास उससे कितनी मिली? बच्चों का रिएक्शन कैसा लगा?",
          describe: `मैंने देखा कि ${snip(evidenceText, 160)}। इसी पर हम आगे काम कर सकते हैं।`,
          ask_again: `"${L?.title ?? primary.title}" में से कौन-सा एक छोटा स्टेप आप अगली विज़िट से पहले ट्राई कर सकते हैं? और हमें कैसे पता चलेगा कि वो काम कर रहा है?`,
        }
      : {
          ask: "How did the lesson go compared with what you had planned? What did you notice about how learners responded?",
          describe: `I noticed that ${snip(evidenceText, 160)}. This is something we can build on.`,
          ask_again: `What is one small step from "${primary.title}" you could try before my next visit, and how will we both know it is working?`,
        },
    evidence: i.observations.slice(0, 2).map((o) => ({ observation_id: o.id, quote_or_summary: snip(o.evidence, 140) })),
    citations,
    needs_mentor_review: true,
    insufficient_evidence: false,
  };
}

export function composeDemonstration(i: DemonstrationTaskInput) {
  const hi = i.language === "hi";
  const c: CardContext = i.card;
  const L = hi ? c.hi : undefined;
  const steps = (L?.steps?.length ? L.steps : c.steps) as string[];
  const prompts = (L?.prompts?.length ? L.prompts : c.example_prompts) as string[];
  const dialogue = (L?.dialogue?.length ? L.dialogue : c.example_dialogue) as string[];
  const title = L?.title ?? c.title;
  const total = i.duration_minutes * 60;
  const per = total / Math.max(steps.length, 1);

  return {
    objective: hi
      ? `"${title}" को लगभग ${i.duration_minutes} मिनट में करके दिखाओ, ताकि टीचर इसे अपनी अगली क्लास में ट्राई कर सकें।`
      : `Model "${c.title}" in about ${i.duration_minutes} minutes so the teacher can try it in their next lesson.`,
    materials: c.tlm.length ? c.tlm : [hi ? "कोई ख़ास सामान नहीं चाहिए" : "No special material needed"],
    steps: steps.map((action, idx) => ({ minutes: `${mmss(idx * per)}–${mmss((idx + 1) * per)}`, action })),
    mentor_script: hi
      ? `टीचर से बोलो: "चलिए, मैं ${i.duration_minutes} मिनट में “${title}” करके दिखाता/दिखाती हूँ। पहले देखिए मैं क्या करता/करती हूँ, फिर आप ट्राई कीजिए।"\n${steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}${prompts.length ? `\nये सवाल पूछ सकते हो: ${prompts.join(" / ")}` : ""}`
      : `Say to the teacher: "Let me show you ${c.title} in about ${i.duration_minutes} minutes. Watch what I do, then you try it."\n${steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}${prompts.length ? `\nSample prompts: ${prompts.join(" / ")}` : ""}`,
    example_interaction: dialogue.length
      ? dialogue.join("\n")
      : prompts.length
        ? prompts.map((p) => `${hi ? "टीचर" : "Teacher"}: ${p}`).join("\n")
        : hi
          ? "इस कार्ड में कोई example बातचीत नहीं है। ऊपर के स्टेप्स और अपनी क्लास के हिसाब से करो।"
          : "This card documents no example dialogue. Use the steps above and your own classroom context.",
    variation: c.variation ?? (hi ? "इस कार्ड में कोई दूसरा तरीका नहीं लिखा है।" : "No variation is documented on this card."),
    reflection_question: hi
      ? "बच्चों का रिएक्शन कैसा था, आपने क्या देखा? इनमें से कौन-सा स्टेप अगली क्लास में सबसे आसानी से ट्राई कर पाएँगे?"
      : "What did you notice about how learners responded? Which step would be easiest to try in your next lesson?",
    citations: [{ practice_card_id: c.id }],
  };
}

export const demoProvider: AiProvider = {
  id: "demo",
  label: "Demo provider (simulated, deterministic)",
  simulated: true,
  async generate(req: AiRequest): Promise<AiResponse> {
    const t = req.task;
    const json =
      t.task === "feedback" ? composeFeedback(t.input)
      : t.task === "demonstration" ? composeDemonstration(t.input)
      : t.task === "questions" ? composeQuestions(t.input)
      : t.task === "review" ? composeReview(t.input)
      : composeIssueSuggestion(t.input);
    return { json, provider: "demo", model: null, simulated: true };
  },
};
