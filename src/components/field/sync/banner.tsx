"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/components/ui";

const TONE = {
  info: { cls: "border-ink-200 bg-ink-50 text-ink-900", Icon: Info },
  warning: { cls: "border-amber-300 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  error: { cls: "border-red-300 bg-red-50 text-red-900", Icon: ShieldAlert },
} as const;

/** A message that stays until the situation is resolved (never auto-dismisses). The icon is decorative; the meaning is in the text. */
export function Banner({ tone, role, testId, title, children, action }: {
  tone: keyof typeof TONE; role: "status" | "alert"; testId?: string; title?: string; children: ReactNode; action?: ReactNode;
}) {
  const { cls, Icon } = TONE[tone];
  return (
    <div role={role} data-testid={testId} className={cn("rounded-lg border px-3 py-2.5 text-sm", cls)}>
      <div className="flex gap-2.5">
        <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 break-words">
          {title && <p className="font-semibold">{title}</p>}
          <div>{children}</div>
          {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}
