import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "./ui-base";
import { BreadcrumbNav, PaginationView } from "./ui-i18n";

// Shared primitives live in ui-base (no text) and ui-i18n (text-bearing client components); this module is the public entry.
export { cn, buttonClass, Button, LinkButton, Chip, type Tone } from "./ui-base";
export {
  VisitStatusChip, CommitmentChip, FeedbackChip, SimulatedBadge, AiDraftBadge, DemoTag, OriginBadge, WorkflowStepper,
} from "./ui-i18n";

// ---- Surfaces ------------------------------------------------------------------------------------
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-card shadow-[0_1px_0_rgba(15,27,51,0.03)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 && <BreadcrumbNav crumbs={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-card/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-500" aria-hidden>{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---- Notices -------------------------------------------------------------------------------------
const NOTICE = {
  info: { cls: "border-ink-100 bg-ink-50 text-ink-800", Icon: Info },
  success: { cls: "border-teal-100 bg-teal-50 text-teal-700", Icon: CheckCircle2 },
  warning: { cls: "border-amber-100 bg-amber-50 text-amber-800", Icon: AlertTriangle },
  error: { cls: "border-red-600/20 bg-red-50 text-red-700", Icon: ShieldAlert },
} as const;

export function Notice({ tone = "info", title, children, className }: { tone?: keyof typeof NOTICE; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon } = NOTICE[tone];
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

// ---- Workflow ------------------------------------------------------------------------------------
/** Stage keys in order. Visible labels are translated inside WorkflowStepper (common.step.*). */
export const STAGE_META = [
  { key: "plan", label: "Plan" },
  { key: "observe", label: "Observe" },
  { key: "coach", label: "Coach" },
  { key: "demonstrate", label: "Demonstrate" },
  { key: "follow_up", label: "Follow up" },
] as const;

export function DefinitionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-600">{label}</dt>
      <dd className="min-w-0 text-ink-900">{children}</dd>
    </div>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <PaginationView
      page={page}
      pages={pages}
      total={total}
      prevHref={page > 1 ? hrefFor(page - 1) : undefined}
      nextHref={page < pages ? hrefFor(page + 1) : undefined}
    />
  );
}
