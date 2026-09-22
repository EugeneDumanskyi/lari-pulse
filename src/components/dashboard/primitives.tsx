"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  Grid2X2,
  LineChart,
  LogIn,
  LogOut,
  LucideIcon,
  Menu,
  Radar,
  Search,
  Settings,
  Sparkles,
  Star,
  WalletCards,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LariPulseLogo } from "@/components/brand/LariPulseLogo";
import { roleLabel, sessionHasRole, useAuthSession } from "@/components/auth/SessionProvider";
import { cn } from "@/lib/utils/cn";

export function GlassPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-surface glass-panel glass-highlight rounded-[28px]", className)} {...props}>
      <div className="glass-content">{children}</div>
    </div>
  );
}

export function GlassCard({
  className,
  children,
  selected,
  ...props
}: HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn(
        "glass-surface glass-card glass-highlight rounded-[22px] transition-[background-color,border-color,box-shadow] duration-200",
        selected && "shadow-glow ring-1 ring-indigo-300/45",
        className
      )}
      {...props}
    >
      <div className="glass-content h-full">{children}</div>
    </div>
  );
}

export function StatusBadge({
  tone = "default",
  children
}: {
  tone?: "default" | "green" | "amber" | "red" | "blue";
  children: ReactNode;
}) {
  return <Badge variant={tone}>{children}</Badge>;
}

export function MetricPill({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <GlassCard className="scroll-optimized-card h-[92px] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <div className="text-xs font-medium text-white/68">{label}</div>
          <div className="mt-1.5 break-words text-lg font-semibold leading-tight tracking-normal text-white">
            {value}
          </div>
          {detail ? <div className="text-xs font-medium text-emerald-300">{detail}</div> : null}
        </div>
      </div>
    </GlassCard>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <GlassCard className="p-6">
      <Sparkles className="mb-4 h-6 w-6 text-sky-200" />
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/64">{description}</p>
    </GlassCard>
  );
}

export function SidebarNavItem({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-12 w-full items-center gap-4 rounded-2xl px-4 text-left text-sm text-white/82 transition hover:bg-white/10",
        active && "border border-white/20 bg-white/16 text-white shadow-glass"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

export function WidgetCard({
  title,
  icon: Icon,
  score,
  direction,
  confidence,
  severity,
  tone,
  selected,
  unavailable
}: {
  title: string;
  icon: LucideIcon;
  score: string;
  direction: string;
  confidence: string;
  severity: string;
  tone: "green" | "red" | "amber";
  selected?: boolean;
  unavailable?: boolean;
}) {
  const toneClass = {
    green: "text-emerald-300 border-emerald-300",
    red: "text-rose-300 border-rose-300",
    amber: "text-amber-300 border-amber-300"
  }[tone];

  return (
    <GlassCard className="min-h-[238px] p-4" selected={selected}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <h3 className="max-w-[160px] text-sm font-semibold leading-5 text-white">
          {title}
        </h3>
        <Icon className={cn("h-5 w-5", tone === "red" ? "text-rose-300" : "text-white/72")} />
      </div>
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border-[7px] border-white/14">
        <div
          className={cn(
            "absolute h-24 w-24 rounded-full border-[7px] border-transparent border-t-current border-l-current",
            toneClass
          )}
        />
        <div className="relative text-center">
          <div className="text-4xl font-semibold text-white/88">{score}</div>
          <div className={cn("text-sm font-semibold", toneClass)}>{direction}</div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="mb-1 text-white/58">Confidence</div>
          <StatusBadge tone={confidence === "High" ? "green" : confidence === "Low" ? "amber" : "amber"}>
            {confidence}
          </StatusBadge>
        </div>
        <div>
          <div className="mb-1 text-white/58">Severity</div>
          <StatusBadge tone={severity === "High" ? "red" : severity === "Low" ? "green" : "amber"}>
            {severity}
          </StatusBadge>
        </div>
      </div>
      <p className="text-xs leading-5 text-white/68">
        {unavailable
          ? "Mixed signals across timeframes; data delayed or insufficient."
          : "Strong uptrend with higher highs and higher lows across key EMAs."}
      </p>
    </GlassCard>
  );
}

export function DrawerPanel() {
  return (
    <GlassPanel className="hidden w-[360px] shrink-0 p-5 2xl:block">
      <div className="mb-7 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <LineChart className="h-6 w-6 text-white/76" />
          <h2 className="text-xl font-semibold text-white">Trend Strength</h2>
        </div>
        <button className="rounded-full bg-white/12 p-2 text-white/72" type="button">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-5 border-b border-white/12 pb-6">
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[9px] border-white/14">
          <div className="absolute h-36 w-36 rounded-full border-[9px] border-transparent border-l-emerald-300 border-t-emerald-300" />
          <div className="relative text-center">
            <div className="text-5xl font-semibold text-white/88">78</div>
            <div className="text-xl font-semibold text-emerald-300">Bullish</div>
          </div>
        </div>
        <div className="space-y-5 pt-4 text-sm">
          <div>
            <div className="text-white/64">Confidence</div>
            <div className="mt-2 font-semibold text-emerald-300">High</div>
          </div>
          <div>
            <div className="text-white/64">Severity</div>
            <div className="mt-2 font-semibold text-amber-300">Moderate</div>
          </div>
        </div>
      </div>
      <div className="space-y-6 py-6 text-sm leading-6 text-white/76">
        <section>
          <h3 className="mb-3 font-semibold text-white">Summary</h3>
          <p>Strong uptrend with higher highs and higher lows across key EMAs.</p>
        </section>
        <section>
          <h3 className="mb-3 font-semibold text-white">Why This Matters</h3>
          <ul className="space-y-2">
            {[
              "Price is above key moving averages",
              "Higher highs and higher lows pattern intact",
              "Short-term momentum supports continuation",
              "Low risk of major reversal in current structure"
            ].map((item) => (
              <li className="flex gap-2" key={item}>
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 font-semibold text-white">Key Indicator Values</h3>
          <div className="divide-y divide-white/10">
            {[
              ["Price vs 20 EMA", "+2.45%"],
              ["Price vs 50 EMA", "+4.87%"],
              ["Price vs 200 EMA", "+11.32%"],
              ["ADX (14)", "28.6"]
            ].map(([label, value]) => (
              <div className="flex justify-between py-2" key={label}>
                <span>{label}</span>
                <span className="font-semibold text-emerald-300">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </GlassPanel>
  );
}

function AppNavList({
  items,
  onNavigate
}: {
  items: AppNavItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-2">
      {items.filter((item) => !item.hidden).map((item) => (
        <SidebarNavItem
          active={item.active}
          icon={item.icon}
          key={item.label}
          label={item.label}
          onClick={
            item.onClick
              ? () => {
                  item.onClick?.();
                  onNavigate?.();
                }
              : undefined
          }
        />
      ))}
    </nav>
  );
}

function AccountPanel({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const session = useAuthSession();
  const isSignedIn = session?.isAuthenticated === true;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white/62">
      {isSignedIn ? (
        <>
          <div className="truncate font-semibold text-white/86" title={session?.email ?? undefined}>
            {session?.email}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-white/46">{roleLabel(session?.role ?? null)}</span>
            <button
              className="flex items-center gap-1 text-xs font-semibold text-white/62 transition hover:text-white"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="font-semibold text-white/80">Read-only view</div>
          <button
            className="mt-1 flex items-center gap-1 text-xs font-semibold text-sky-100/80 transition hover:text-white"
            onClick={() => {
              onNavigate?.();
              router.push("/login");
            }}
            type="button"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </button>
        </>
      )}
    </div>
  );
}

interface AppNavItem {
  icon: LucideIcon;
  label: string;
  active: boolean;
  hidden?: boolean;
  onClick?: () => void;
}

export function AppShell({
  children,
  activeItem = "dashboard"
}: {
  children: ReactNode;
  activeItem?:
    | "dashboard"
    | "markets"
    | "alerts"
    | "radar"
    | "portfolio"
    | "watchlist"
    | "scans"
    | "insights"
    | "reports"
    | "settings";
}) {
  const router = useRouter();
  const session = useAuthSession();
  const isAnalyst = sessionHasRole(session, "analyst");
  const isSignedIn = session?.isAuthenticated === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const nav: AppNavItem[] = [
    { icon: Grid2X2, label: "Dashboard", active: activeItem === "dashboard", onClick: () => router.push("/dashboard") },
    { icon: BarChart3, label: "Markets", active: activeItem === "markets", onClick: () => router.push("/markets") },
    { icon: Bell, label: "Alerts", active: activeItem === "alerts", hidden: !isAnalyst, onClick: () => router.push("/alerts") },
    { icon: Radar, label: "Radar", active: activeItem === "radar", onClick: () => router.push("/radar") },
    { icon: WalletCards, label: "Portfolio", active: activeItem === "portfolio", hidden: !isAnalyst, onClick: () => router.push("/portfolio") },
    { icon: Star, label: "Watchlist", active: activeItem === "watchlist", hidden: !isSignedIn, onClick: () => router.push("/watchlist") },
    { icon: Search, label: "Scans", active: activeItem === "scans", onClick: () => router.push("/scans") },
    { icon: Sparkles, label: "Insights", active: activeItem === "insights", onClick: () => router.push("/insights") },
    { icon: Activity, label: "Reports", active: activeItem === "reports", onClick: () => router.push("/reports") },
    { icon: Settings, label: "Settings", active: activeItem === "settings", hidden: !isSignedIn, onClick: () => router.push("/settings") }
  ];

  // The drawer is the only navigation below `lg`, so Escape must always be able
  // to give the page back.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <main className="min-h-screen p-3 text-white md:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1620px] flex-col overflow-hidden rounded-[28px] border border-white/14 bg-slate-950/22 shadow-[0_0_0_1px_rgba(119,156,255,0.18),0_32px_90px_rgba(0,5,18,0.5)] backdrop-blur-sm lg:flex-row">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 lg:hidden">
          <LariPulseLogo />
          <Button
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        <aside className="glass-surface hidden w-[236px] shrink-0 rounded-[28px] p-5 lg:flex lg:flex-col">
          <div className="mb-9 px-2">
            <LariPulseLogo />
          </div>
          <AppNavList items={nav} />
          <div className="mt-auto">
            <AccountPanel />
          </div>
        </aside>
        {children}
      </div>
      <AnimatePresence>
        {menuOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.button
              animate={{ opacity: 1 }}
              aria-label="Close navigation"
              className="absolute inset-0 h-full w-full bg-slate-950/70 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              type="button"
            />
            <motion.div
              animate={{ x: 0 }}
              aria-label="Navigation"
              aria-modal="true"
              className="glass-surface absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col rounded-r-[28px] p-5"
              exit={{ x: "-100%" }}
              initial={{ x: "-100%" }}
              role="dialog"
              transition={{ type: "tween", duration: 0.2 }}
            >
              <div className="mb-8 flex items-center justify-between gap-3 px-2">
                <LariPulseLogo />
                <Button
                  aria-label="Close navigation"
                  onClick={() => setMenuOpen(false)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <AppNavList items={nav} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-auto">
                <AccountPanel onNavigate={() => setMenuOpen(false)} />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
