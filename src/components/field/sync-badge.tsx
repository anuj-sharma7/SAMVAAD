"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, Clock3, GitCompareArrows } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { SyncState } from "@/lib/offline/types";
import { cn } from "@/components/ui";

const LOOK: Record<SyncState | "notSaved", { icon: typeof Clock3; cls: string }> = {
  pending: { icon: Clock3, cls: "border-amber-200 bg-amber-50 text-amber-900" },
  synced: { icon: CheckCircle2, cls: "border-teal-200 bg-teal-50 text-teal-900" },
  failed: { icon: AlertTriangle, cls: "border-red-200 bg-red-50 text-red-900" },
  conflict: { icon: GitCompareArrows, cls: "border-violet-200 bg-violet-50 text-violet-900" },
  notSaved: { icon: CircleSlash, cls: "border-red-300 bg-red-50 text-red-900" },
};

/**
 * The one place a record's save/sync state is shown. The meaning is always in the TEXT (never colour alone), the icon is decorative,
 * and "Synced to server" can only appear for a record whose latest local change the server has acknowledged.
 */
export function SyncBadge({ state, short = false, className }: { state: SyncState | "notSaved"; short?: boolean; className?: string }) {
  const { t } = useI18n();
  const { icon: Icon, cls } = LOOK[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium leading-tight", cls, className)}>
      <Icon size={14} aria-hidden className="shrink-0" />
      {t(short ? `sync.state.${state}.short` : `sync.state.${state}`)}
    </span>
  );
}
