"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ShieldAlert, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

type ToastItem = { id: number; tone: "success" | "error"; message: string };
const Ctx = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: tr } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastItem["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);
  const api = useMemo(() => ({ success: (m: string) => push("success", m), error: (m: string) => push("error", m) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.tone === "success" ? "border-teal-100 bg-white text-ink-900" : "border-red-600/30 bg-red-50 text-red-700"
            }`}
          >
            {t.tone === "success" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden /> : <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />}
            <span>{t.message}</span>
            <button type="button" aria-label={tr("common.ui.dismiss")} className="ml-1 text-ink-500 hover:text-ink-900" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return c;
}
