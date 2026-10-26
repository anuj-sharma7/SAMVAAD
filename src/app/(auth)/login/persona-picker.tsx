"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, GraduationCap, Library, UserCog } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useToast } from "@/components/toast";
import { roleKey } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";

const ICON = { mentor: GraduationCap, supervisor: UserCog, diet_admin: Library } as const;

export function PersonaPicker({ personas, next = "/dashboard" }: { next?: string; personas: { id: string; name: string; role: string; designation: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(id: string) {
    setBusy(id);
    try {
      await api("POST", "/session", { profile_id: id });
      router.push(next);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? errorText(e, i18n) : t("login.signInFailed"));
      setBusy(null);
    }
  }

  return (
    <ul className="mt-6 space-y-3">
      {personas.map((p) => {
        const Icon = ICON[p.role as keyof typeof ICON];
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => pick(p.id)}
              className="group flex w-full items-start gap-4 rounded-xl border border-line-strong bg-card p-4 text-left transition hover:border-ink-700 hover:shadow-sm disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-700"><Icon size={20} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">{p.name}</span>
                <span className="block text-[13px] text-ink-600">{t(roleKey(p.role))} · {p.designation}</span>
                <span className="mt-1.5 block text-[13px] text-ink-600">{t(`login.blurb.${p.role}`)}</span>
              </span>
              <ArrowRight size={18} className="mt-1 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-ink-900" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
