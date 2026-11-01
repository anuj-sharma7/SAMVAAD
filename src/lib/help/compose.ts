/** Deterministic compose functions for the simulated provider's mentor-help tasks. Same input, same output. */
import type { IssueTaskInput, QuestionsTaskInput, ReviewTaskInput } from "../ai/schemas";
import { bandOf, type GroundTopic, type HelpSubject, type MealTopic } from "./catalog";
import { GROUND_BANK, ISSUE_ADVICE, MEAL_BANK, SUBJECT_BANK, SUBJECT_FIXES } from "./bank";

export function composeQuestions(i: QuestionsTaskInput) {
  if (i.kind === "subject") {
    const subject = i.subject as HelpSubject | null;
    const band = bandOf(i.grade ?? 1);
    const rows = (subject && SUBJECT_BANK[subject]?.[band]) || [];
    const fixes = subject ? SUBJECT_FIXES[subject] : [];
    return {
      questions: rows.slice(0, i.count).map(([q, hint], idx) => ({ q, hint, who: "students" as const, fix: fixes[idx % Math.max(fixes.length, 1)] ?? "" })),
      tip: "बच्चों से एक-एक करके नहीं, छोटे समूह में भी पूछ सकते हैं। सही-गलत बताने की जगह पूछो 'तुमने कैसे सोचा?'",
    };
  }
  const bank = i.kind === "meal" ? MEAL_BANK[i.topic as MealTopic] : GROUND_BANK[i.topic as GroundTopic];
  return {
    questions: (bank ?? []).slice(0, i.count).map((e) => ({ q: e.q, hint: e.hint, who: e.who, fix: e.fix })),
    tip: "जवाब के साथ अपनी आँख से भी देखो (रसोई, रजिस्टर, स्टॉक)। जो दिखे वही लिखो, अंदाज़ा नहीं।",
  };
}

export function composeReview(i: ReviewTaskInput) {
  const total = i.items.length;
  const weak = i.items.filter((x) => x.outcome === "weak");
  const some = i.items.filter((x) => x.outcome === "some");
  const good = i.items.filter((x) => x.outcome === "good");
  const needFix = [...weak, ...some];
  const subjectFixes = i.subject ? SUBJECT_FIXES[i.subject as HelpSubject] : undefined;

  const summary =
    needFix.length === 0
      ? `आपने ${total} में से सभी सवाल ठीक बताए। अच्छा रहा, अगली बार थोड़ा मुश्किल स्तर आज़माएँ।`
      : `${total} में से ${good.length} सवाल ठीक रहे, ${some.length} पर थोड़ी मदद चाहिए और ${weak.length} पर ज़्यादा मदद चाहिए।`;

  const suggestions = needFix.map((x, idx) => ({
    q: x.q,
    text: x.fix || subjectFixes?.[idx % subjectFixes.length] || "इस बात को अगली बार आसान उदाहरण और असली चीज़ों के साथ दोबारा पूछो।",
  }));

  return {
    summary,
    suggestions: suggestions.length ? suggestions : [{ q: "", text: "कोई समस्या नहीं बताई गई। इसी तरह नियमित जाँच करते रहो।" }],
    next_step:
      weak.length > 0
        ? `सबसे पहले इस पर काम करो: "${weak[0].q.slice(0, 120)}"। अगली विज़िट में यही दोबारा पूछकर देखो।`
        : some.length > 0
          ? `अगली विज़िट में "${some[0].q.slice(0, 120)}" दोबारा पूछो और देखो सुधार हुआ या नहीं।`
          : "अगली विज़िट में नए सवाल बनवाकर पूछो।",
  };
}

export function composeIssueSuggestion(i: IssueTaskInput) {
  const a = ISSUE_ADVICE[i.category] ?? ISSUE_ADVICE.other;
  return { suggestions: [...a.ideas], first_step: a.first };
}
