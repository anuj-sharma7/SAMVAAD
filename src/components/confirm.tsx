"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "./ui";
import { useI18n } from "@/lib/i18n/client";

/** Confirmation before consequential or destructive actions, built on the native <dialog> (focus trap + Esc for free). */
export function ConfirmButton({
  label, title, description, confirmLabel, onConfirm, variant = "secondary", size = "md", disabled, children,
}: {
  label: ReactNode; title: string; description?: ReactNode; confirmLabel?: string; onConfirm: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger" | "accent" | "ghost"; size?: "sm" | "md" | "lg"; disabled?: boolean; children?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => ref.current?.showModal()}>{label}</Button>
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/40"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="p-5">
          <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
          {description && <div className="mt-2 text-sm text-ink-600">{description}</div>}
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-ink-50 px-5 py-3">
          <Button variant="secondary" onClick={() => ref.current?.close()}>{t("common.cancel")}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={async () => { ref.current?.close(); await onConfirm(); }}>{confirmLabel ?? t("common.ui.confirm")}</Button>
        </div>
      </dialog>
    </>
  );
}
