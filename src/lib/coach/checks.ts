/**
 * Instant wording check for a coaching card. Pure and client-safe: it looks only at how the mentor's draft is WRITTEN
 * (specific, one small step, a time cue, real questions, based on an observation, kind words). It never judges the teacher
 * and gives no score; each item is simply "looks fine" or "could be better".
 */
export interface CardText {
  strength: string;
  priority_practice: string;
  next_step: string;
  ask_question: string;
  describe_statement: string;
  ask_again_question: string;
}

export const CHECK_IDS = ["strength", "focus", "oneStep", "timeCue", "questions", "evidence", "kindWords"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

const TIME_CUE = /\b(before|next visit|this week|next week|daily|every (day|week|lesson|class|morning)|each day|tomorrow|today|within|\d+\s*(days?|minutes?|mins?|weeks?))\b|अगली|इस हफ़्ते|इस हफ्ते|रोज़|रोज|हर (दिन|हफ़्ते|हफ्ते|क्लास|कक्षा)|कल|आज|दिन|मिनट|हफ़्ते|हफ्ते|विज़िट|से पहले/i;
const CONNECTOR = /\b(and then|and|then|also|plus)\b|और फिर|फिर|तथा|साथ ही|और /gi;
const QUESTIONISH = /(\?|？|क्या|कैसे|कौन|क्यों|कब|कहाँ|कितना|what|how|which|why|when|where)/i;
const HARSH = /\b(bad|poor|weak|lazy|careless|useless|failed|failure|incompetent)\b|नालायक|लापरवाह|बेकार|निकम्मा|फेल|कमज़ोर टीचर|कमजोर टीचर/i;

export function checkCard(f: CardText): { id: CheckId; ok: boolean }[] {
  const next = f.next_step.trim();
  const joined = [f.strength, f.priority_practice, f.next_step, f.ask_question, f.describe_statement, f.ask_again_question].join(" ");
  return [
    { id: "strength", ok: f.strength.trim().length >= 30 },
    { id: "focus", ok: f.priority_practice.trim().length > 0 && f.priority_practice.trim().length <= 320 },
    { id: "oneStep", ok: next.length >= 10 && next.length <= 220 && (next.match(CONNECTOR)?.length ?? 0) <= 1 },
    { id: "timeCue", ok: TIME_CUE.test(next) },
    { id: "questions", ok: !!f.ask_question.trim() && !!f.ask_again_question.trim() && QUESTIONISH.test(f.ask_question) && QUESTIONISH.test(f.ask_again_question) },
    { id: "evidence", ok: f.describe_statement.trim().length >= 25 },
    { id: "kindWords", ok: !HARSH.test(joined) },
  ];
}
