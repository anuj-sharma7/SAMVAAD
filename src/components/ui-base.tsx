import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

// ---- Buttons -------------------------------------------------------------------------------------
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
const BTN_VARIANT = {
  primary: "bg-ink-900 text-white hover:bg-ink-700 active:bg-ink-800",
  accent: "bg-teal-700 text-white hover:bg-teal-600",
  secondary: "border border-line-strong bg-card text-ink-900 hover:bg-ink-50",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "border border-red-600/40 bg-card text-red-700 hover:bg-red-50",
} as const;
const BTN_SIZE = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-[15px]" } as const;

type Variant = keyof typeof BTN_VARIANT;
type Size = keyof typeof BTN_SIZE;

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---- Chips ---------------------------------------------------------------------------------------
const TONES = {
  neutral: "bg-ink-50 text-ink-700 border-ink-100",
  teal: "bg-teal-50 text-teal-700 border-teal-100",
  amber: "bg-amber-50 text-amber-800 border-amber-100",
  red: "bg-red-50 text-red-700 border-red-600/20",
  ink: "bg-ink-900 text-white border-ink-900",
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}
