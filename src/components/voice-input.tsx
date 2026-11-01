"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./ui-base";

/**
 * Voice typing through the browser's own speech recognition (Web Speech API). Nothing is recorded or stored by SAMVAAD: the browser turns
 * speech into text and we append that text to the field, where the mentor can read and fix it before saving.
 * Honest limits: it only exists in some browsers (Chrome/Edge on Android and desktop), usually needs the internet because the browser
 * vendor's service does the recognising, and it is NOT available in offline field mode.
 */
interface SpeechAlt { transcript: string }
interface SpeechResultLike { isFinal: boolean; length: number; [i: number]: SpeechAlt }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True once mounted in a browser that has speech recognition. False on the server and during hydration, so markup always matches. */
export function useVoiceSupported(): boolean {
  return useSyncExternalStore(() => () => undefined, () => recognitionCtor() !== null, () => false);
}

const ERROR_KEY: Record<string, string> = {
  "not-allowed": "common.voice.denied", "service-not-allowed": "common.voice.denied",
  "no-speech": "common.voice.noSpeech", "audio-capture": "common.voice.noMic", network: "common.voice.network",
};

/** Mic button for one text field. `onText` receives each recognised sentence; the parent decides how to add it to the field. */
export function VoiceButton({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const { t, locale } = useI18n();
  const supported = useVoiceSupported();
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);
  useEffect(() => () => recRef.current?.abort(), []); // never leave the microphone open when the field goes away

  const toggle = useCallback(() => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setProblem(null);
    const rec = new Ctor();
    rec.lang = locale === "hi" ? "hi-IN" : "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      text = text.trim();
      if (text) onTextRef.current(text);
    };
    rec.onerror = (e) => setProblem(ERROR_KEY[e.error] ?? "common.voice.failed");
    rec.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setProblem("common.voice.failed"); }
  }, [listening, locale]);

  if (!supported) return null;
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        data-testid="voice-btn"
        aria-pressed={listening}
        onClick={toggle}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors",
          listening ? "border-red-600 bg-red-50 text-red-700" : "border-line-strong bg-card text-ink-900 hover:bg-ink-50",
        )}
      >
        {listening ? <Square size={16} aria-hidden className="animate-pulse" /> : <Mic size={17} aria-hidden />}
        {listening ? t("common.voice.stop") : t("common.voice.start")}
      </button>
      <span role="status" aria-live="polite" className="min-h-4 text-[13px] text-ink-600">
        {listening ? t("common.voice.listening") : problem ? t(problem) : ""}
      </span>
    </span>
  );
}

/** One line shown above a guided flow: explains voice typing honestly, or says it is unavailable in this browser. */
export function VoiceHint() {
  const { t } = useI18n();
  const supported = useVoiceSupported();
  return <p className="text-[13px] text-ink-600">{supported ? t("common.voice.hint") : t("common.voice.unsupported")}</p>;
}

/** Adds recognised speech to existing text with a single space between them. */
export const appendSpoken = (current: string, spoken: string): string => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken);
