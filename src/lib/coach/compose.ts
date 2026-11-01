/** Deterministic coaching-conversation advice for the simulated provider, in everyday Hinglish (or simple English). */
import type { CoachTaskInput } from "../ai/schemas";

const snip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim().replace(/[.।]+$/u, "");
  return t.length <= n ? t : `${t.slice(0, Math.max(t.lastIndexOf(" ", n), 20))}…`;
};

const TIP_HI: Record<string, string> = {
  strength: "खूबी में कोई ख़ास बात लिखो: टीचर ने क्या किया और बच्चों ने क्या किया। सिर्फ़ 'अच्छा पढ़ाया' से टीचर को कुछ पता नहीं चलता।",
  focus: "एक ही चीज़ पर टिको। बहुत सारी बातें एक साथ बोलोगे तो टीचर एक भी याद नहीं रख पाएँगे।",
  oneStep: "अगला कदम एक ही और छोटा रखो, जो एक क्लास में हो सके। 'और फिर...' वाली दो-तीन बातें अलग-अलग विज़िट के लिए रखो।",
  timeCue: "अगले कदम के साथ समय जोड़ो: 'इस हफ़्ते दो दिन' या 'अगली विज़िट से पहले'। इससे फ़ॉलो-अप में जाँच आसान हो जाती है।",
  questions: "पूछने वाले हिस्से में खुले सवाल रखो ('क्या', 'कैसे' वाले), हाँ-ना वाले नहीं। पहले टीचर को बोलने दो।",
  evidence: "'बताएँ' वाले हिस्से में वही लिखो जो तुमने क्लास में खुद देखा: बच्चे क्या बोले या क्या किया। अंदाज़ा या राय नहीं।",
  kindWords: "कुछ शब्द टीचर पर फ़ैसले जैसे लग सकते हैं। उनकी जगह लिखो कि तुमने क्या देखा और उससे बच्चों पर क्या असर पड़ा।",
};
const TIP_EN: Record<string, string> = {
  strength: "Make the strength specific: what the teacher did and what the children did. 'Taught well' tells the teacher nothing.",
  focus: "Stay on one thing. Too many points at once and the teacher will not remember even one.",
  oneStep: "Keep the next step to one small action that fits in one lesson. Save the 'and then...' items for other visits.",
  timeCue: "Add a time to the next step: 'two days this week' or 'before my next visit'. It makes the follow-up check easy.",
  questions: "Use open questions ('what', 'how') in the asking parts, not yes/no. Let the teacher speak first.",
  evidence: "In the 'describe' part write only what you saw in class: what children said or did. No guesses or opinions.",
  kindWords: "Some words may sound like a judgement on the teacher. Write what you saw and what it did for the children instead.",
};

export function composeCoach(i: CoachTaskInput) {
  const hi = i.language === "hi";
  const tips = i.weak_checks.map((id) => (hi ? TIP_HI : TIP_EN)[id]).filter(Boolean);
  const generic = hi
    ? ["पहले टीचर से पूछो कि उन्हें क्लास कैसी लगी। अपनी बात उसके बाद रखो।", "बात ऐसे जगह करो जहाँ बच्चे या दूसरे टीचर न सुन रहे हों, और 5 से 10 मिनट से ज़्यादा मत लो।"]
    : ["First ask the teacher how the lesson felt to them. Share your view after that.", "Talk where children and other teachers cannot hear, and keep it to 5 to 10 minutes."];
  const strength = snip(i.card.strength, 140);
  const step = snip(i.card.next_step, 160);

  return {
    opening_line: hi
      ? `"आज आपकी क्लास में ${strength || "बच्चों की भागीदारी"} मुझे अच्छा लगा। पहले आप बताइए, आपको क्या लगा कि सबसे अच्छा गया?"`
      : `"I liked this in your class today: ${strength || "how the children took part"}. First tell me, what do you think went best?"`,
    tips: [...tips, ...generic].slice(0, 6),
    if_disagrees: hi
      ? `"ठीक है, आप क्लास को मुझसे बेहतर जानते हैं। चलिए इसे बस एक बार, छोटे रूप में आज़माकर देखते हैं और अगली विज़िट में साथ बैठकर देखेंगे।" बहस मत करो; आज़माने की बात रखो।`
      : `"You know this class better than I do. Let us try it just once, in a small way, and look at it together at my next visit." Do not argue; offer a small trial.`,
    close_with: hi
      ? `बात ऐसे ख़त्म करो: "तो अगली विज़िट तक आप यह करेंगे: ${step || "यह एक छोटा कदम"}। मैं तय तारीख़ को आकर आपके साथ देखूँगा/देखूँगी कि कैसा रहा।" टीचर से कहलवाओ कि वे इसे अपने शब्दों में दोहराएँ।`
      : `Close like this: "So before my next visit you will try: ${step || "this one small step"}. I will come on the agreed date and we will look at how it went together." Ask the teacher to say it back in their own words.`,
    watch_outs: hi
      ? ["टीचर की तुलना दूसरे टीचर से मत करो।", "किसी बच्चे का नाम लेकर कमी मत बताओ।", "अगर टीचर चुप हो जाएँ तो कुछ देर रुको, फिर खुला सवाल पूछो।"]
      : ["Do not compare the teacher with another teacher.", "Do not name a child while describing a gap.", "If the teacher goes quiet, wait a moment, then ask an open question."],
  };
}
