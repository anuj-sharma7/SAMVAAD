/** Plain text of a question set, for pasting into WhatsApp or a notes app. Labels come in already translated. */
export interface ShareQuestion { q: string; hint: string; who: string }

export interface ShareLabels {
  /** "Ask the children", "Ask the cook"... keyed by the `who` value. */
  who: Record<string, string>;
  hint: string;
  tip: string;
}

export function questionSetText(title: string, tip: string, questions: readonly ShareQuestion[], labels: ShareLabels): string {
  const lines: string[] = [title, ""];
  questions.forEach((x, i) => {
    lines.push(`${i + 1}. ${x.q}`);
    lines.push(`   (${labels.who[x.who] ?? x.who})`);
    if (x.hint.trim()) lines.push(`   ${labels.hint}: ${x.hint.trim()}`);
    lines.push("");
  });
  if (tip.trim()) lines.push(`${labels.tip}: ${tip.trim()}`);
  return lines.join("\n").trimEnd() + "\n";
}
