"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenCheck, CalendarCheck, Globe2, CircleHelp, ClipboardList, FileText, LayoutDashboard, Library, LogOut, Menu,
  MessageSquareText, Presentation, School, Settings, X,
} from "lucide-react";
import { cn } from "./ui";
import { LanguageSwitcher } from "./language-switcher";
import { api } from "@/lib/client/api";
import { roleKey } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Role = "mentor" | "supervisor" | "diet_admin";
const NAV: { href: string; labelKey: string; icon: typeof School; roles: Role[] }[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["mentor", "supervisor", "diet_admin"] },
  { href: "/schools", labelKey: "nav.schools", icon: School, roles: ["mentor", "supervisor", "diet_admin"] },
  { href: "/visits", labelKey: "nav.visits", icon: ClipboardList, roles: ["mentor", "supervisor"] },
  { href: "/feedback", labelKey: "nav.feedback", icon: MessageSquareText, roles: ["mentor"] },
  { href: "/demonstrate", labelKey: "nav.demonstrations", icon: Presentation, roles: ["mentor"] },
  { href: "/follow-ups", labelKey: "nav.followUps", icon: CalendarCheck, roles: ["mentor"] },
  { href: "/reports", labelKey: "nav.reports", icon: FileText, roles: ["mentor"] },
  { href: "/public-data", labelKey: "nav.publicContext", icon: Globe2, roles: ["mentor", "supervisor", "diet_admin"] },
  { href: "/practice-library", labelKey: "nav.practiceLibrary", icon: Library, roles: ["mentor", "supervisor", "diet_admin"] },
  { href: "/help", labelKey: "nav.help", icon: CircleHelp, roles: ["mentor", "supervisor", "diet_admin"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, roles: ["mentor", "supervisor", "diet_admin"] },
];

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t("nav.primary")} className="flex-1 space-y-0.5 overflow-y-auto px-3">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/15 text-white" : "text-ink-100/85 hover:bg-white/10 hover:text-white",
            )}
          >
            <n.icon size={17} aria-hidden />
            {t(n.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-6 py-5 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
        <BookOpenCheck size={18} aria-hidden />
      </span>
      <span>
        <span className="block text-[17px] font-semibold leading-none tracking-tight">SAMVAAD</span>
        <span lang="hi" className="mt-1 block text-[11px] leading-none text-ink-100/75">
          {t("nav.tagline")}
        </span>
      </span>
    </Link>
  );
}

function UserBox({ name, role }: { name: string; role: Role }) {
  const { t } = useI18n();
  return (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3"><LanguageSwitcher tone="dark" /></div>
      <p className="truncate text-sm font-medium text-white">{name}</p>
      <p className="text-xs text-ink-100/75">{t(roleKey(role))}</p>
      <button
        type="button"
        onClick={async () => {
          await api("DELETE", "/session");
          // Full navigation: guarantees no signed-in page or client cache is left behind.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-100/85 hover:bg-white/10 hover:text-white"
      >
        <LogOut size={15} aria-hidden className="shrink-0" /> {t("nav.signOut")}
      </button>
    </div>
  );
}

export function Sidebar({ name, role }: { name: string; role: Role }) {
  const { t } = useI18n();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const path = usePathname();
  // The drawer is tied to the route it was opened on, so navigating closes it without an effect.
  const open = openPath === path;
  const setOpen = (v: boolean) => setOpenPath(v ? path : null);
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    document.addEventListener("keydown", onKey);
    drawer.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ink-900 lg:flex">
        <Brand />
        <NavList role={role} />
        <UserBox name={name} role={role} />
      </aside>

      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-2.5 text-white lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <BookOpenCheck size={18} aria-hidden /> SAMVAAD
        </Link>
        <button
          type="button"
          aria-label={t("nav.open")}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 hover:bg-white/10"
        >
          <Menu size={20} />
        </button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.drawer")}>
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div ref={drawer} id="mobile-nav" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900">
            <button
              type="button"
              aria-label={t("nav.close")}
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-2 text-white hover:bg-white/10"
            >
              <X size={18} />
            </button>
            <Brand />
            <NavList role={role} onNavigate={() => setOpen(false)} />
            <UserBox name={name} role={role} />
          </div>
        </div>
      )}
    </>
  );
}
