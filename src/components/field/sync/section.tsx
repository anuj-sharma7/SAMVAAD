"use client";

import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";

export const BTN = "h-auto! min-h-11 whitespace-normal! py-2";

/** A titled panel of the Sync Center. */
export function Section({ title, description, testId, id, children }: { title: string; description?: ReactNode; testId?: string; id?: string; children: ReactNode }) {
  return (
    <Card data-testid={testId} id={id} tabIndex={id ? -1 : undefined} className={id ? "outline-none" : undefined}>
      <CardHeader title={title} description={description} className="px-4 py-3" />
      <div className="space-y-3 px-4 py-4 text-sm text-ink-800">{children}</div>
    </Card>
  );
}

/** One label/value line (stacks on narrow screens so long Hindi labels never overflow). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-ink-600">{label}</dt>
      <dd className="min-w-0 break-words text-ink-900">{children}</dd>
    </div>
  );
}
