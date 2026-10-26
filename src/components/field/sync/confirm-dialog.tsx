"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/**
 * Confirmation dialog on the native <dialog> element (focus trap, Esc, focus returns to the trigger on close).
 * Unlike the shared ConfirmButton it gives every dialog its own title id, because many can exist on one page.
 */
export function ConfirmDialog({ label, testId, title, description, confirmLabel, onConfirm, disabled }: {
  label: ReactNode; testId?: string; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<void>; disabled?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <Button variant="danger" className="h-auto! min-h-11 whitespace-normal! py-2 text-left" data-testid={testId} disabled={disabled} onClick={() => ref.current?.showModal()}>{label}</Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-card p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/40"
      >
        <div className="p-5">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-ink-700">{description}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-ink-50 px-5 py-3">
          <Button variant="secondary" className="h-auto! min-h-11 py-2" onClick={() => ref.current?.close()}>{t("common.cancel")}</Button>
          <Button variant="danger" className="h-auto! min-h-11 whitespace-normal! py-2" data-testid={testId ? `${testId}-confirm` : undefined} onClick={async () => { ref.current?.close(); await onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </dialog>
    </>
  );
}
