import type { ComponentProps, ReactNode } from "react";
import { cn } from "./ui";

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-card px-3 text-sm text-ink-900 placeholder:text-ink-500 transition-colors focus:border-teal-600 disabled:bg-ink-50 disabled:text-ink-600 aria-[invalid=true]:border-red-600";

export function Field({ label, hint, error, htmlFor, children, required }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-900">
        {label}
        {required && <span className="text-red-700" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-[13px] text-ink-600">{hint}</p>}
      {error && <p id={`${htmlFor}-err`} role="alert" className="text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function Input({ className, error, id, ...props }: ComponentProps<"input"> & { error?: string }) {
  return <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={cn(CONTROL, "h-10", className)} {...props} />;
}
export function Textarea({ className, error, id, ...props }: ComponentProps<"textarea"> & { error?: string }) {
  return <textarea id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={cn(CONTROL, "min-h-[88px] py-2 leading-relaxed", className)} {...props} />;
}
export function Select({ className, error, id, ...props }: ComponentProps<"select"> & { error?: string }) {
  return <select id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={cn(CONTROL, "h-10 pr-8", className)} {...props} />;
}
