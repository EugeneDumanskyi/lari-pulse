"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Grid2X2,
  LineChart,
  LoaderCircle,
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
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LariPulseLogo } from "@/components/brand/LariPulseLogo";
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

export function ToolbarButton({
  children,
  active
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        "h-12 min-w-16 border-r border-white/10 px-5 text-sm font-semibold text-white/76 transition last:border-r-0 hover:bg-white/12",
        active && "bg-indigo-300/28 text-white shadow-glow"
      )}
      type="button"
    >
      {children}
    </button>
  );
}

export function SidebarNavItem({
  icon: Icon,
  label,
  active,
  disabled,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-12 w-full items-center gap-4 rounded-2xl px-4 text-left text-sm text-white/82 transition hover:bg-white/10",
        active && "border border-white/20 bg-white/16 text-white shadow-glass",
        disabled && "cursor-not-allowed opacity-42 hover:bg-transparent"
      )}
      disabled={disabled}
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

export function AppShell({
  children,
  activeItem = "dashboard"
}: {
  children: ReactNode;
  activeItem?: "dashboard" | "markets" | "alerts" | "radar" | "portfolio" | "settings";
}) {
  const router = useRouter();
  const nav: Array<{
    icon: LucideIcon;
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick?: () => void;
  }> = [
    { icon: Grid2X2, label: "Dashboard", active: activeItem === "dashboard", onClick: () => router.push("/dashboard") },
    { icon: BarChart3, label: "Markets", active: activeItem === "markets", onClick: () => router.push("/markets") },
    { icon: Bell, label: "Alerts", active: activeItem === "alerts", onClick: () => router.push("/alerts") },
    { icon: Radar, label: "Radar", active: activeItem === "radar", onClick: () => router.push("/radar") },
    { icon: WalletCards, label: "Portfolio", active: activeItem === "portfolio", onClick: () => router.push("/portfolio") },
    { icon: Star, label: "Watchlist", active: false, disabled: true },
    { icon: Search, label: "Scans", active: false, disabled: true },
    { icon: Sparkles, label: "Insights", active: false, disabled: true },
    { icon: Activity, label: "Reports", active: false, disabled: true },
    { icon: Settings, label: "Settings", active: activeItem === "settings", onClick: () => router.push("/settings") }
  ];

  return (
    <main className="min-h-screen p-3 text-white md:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1620px] overflow-hidden rounded-[28px] border border-white/14 bg-slate-950/22 shadow-[0_0_0_1px_rgba(119,156,255,0.18),0_32px_90px_rgba(0,5,18,0.5)] backdrop-blur-sm">
        <aside className="glass-surface hidden w-[236px] shrink-0 rounded-[28px] p-5 lg:flex lg:flex-col">
          <div className="mb-9 px-2">
            <LariPulseLogo />
          </div>
          <nav className="space-y-2">
            {nav.map((item) => (
              <SidebarNavItem
                active={item.active}
                disabled={item.disabled}
                icon={item.icon}
                key={item.label}
                label={item.label}
                onClick={item.onClick}
              />
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white/62">
            Local market workspace
          </div>
        </aside>
        {children}
      </div>
    </main>
  );
}

export function TopBar() {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <Button className="lg:hidden" size="icon" variant="ghost">
        <Menu className="h-6 w-6" />
      </Button>
      <div className="glass-surface hidden h-12 w-full max-w-[540px] items-center gap-3 rounded-2xl px-4 md:flex">
        <Search className="h-5 w-5 text-white/72" />
        <span className="text-white/62">Search markets...</span>
        <span className="ml-auto rounded-lg bg-white/12 px-2 py-1 text-xs text-white/76">⌘K</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <Bell className="h-6 w-6 text-white/82" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-white/14 text-sm font-semibold">
          LP
          <span className="absolute bottom-1 right-0 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-slate-900" />
        </div>
      </div>
    </div>
  );
}

export function SymbolTabs() {
  return (
    <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-3">
        {[
          ["₿", "BTC/USDT"],
          ["◆", "ETH/USDT"],
          ["≋", "SOL/USDT"]
        ].map(([icon, label], index) => (
          <button
            className={cn(
              "glass-surface flex h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-white/84",
              index === 2 && "shadow-glow ring-1 ring-indigo-300/50"
            )}
            key={label}
            type="button"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-base">
              {icon}
            </span>
            {label}
            <ChevronDown className="h-4 w-4 text-white/52" />
          </button>
        ))}
      </div>
      <div className="glass-surface flex w-fit overflow-hidden rounded-2xl">
        {["15m", "1h", "4h", "1d"].map((timeframe) => (
          <ToolbarButton active={timeframe === "1h"} key={timeframe}>
            {timeframe}
          </ToolbarButton>
        ))}
        <ToolbarButton>
          <CalendarDays className="h-5 w-5" />
        </ToolbarButton>
      </div>
    </div>
  );
}

export function StaleWarning() {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300/45 bg-amber-500/13 px-5 py-3 text-sm text-amber-100 backdrop-blur-xl md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-300" />
        <span>Some market data sources are delayed. SOL/USDT data may be stale.</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <Button size="sm" variant="warning">
          Retry now
        </Button>
        <button className="font-semibold text-amber-200 underline underline-offset-4" type="button">
          View status
        </button>
      </div>
    </div>
  );
}

export function LoadingToast() {
  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-6 right-6 z-50 hidden rounded-2xl border border-white/18 bg-slate-900/62 px-8 py-4 shadow-glass backdrop-blur-2xl lg:flex"
      initial={{ y: 18, opacity: 0 }}
    >
      <LoaderCircle className="mr-4 h-7 w-7 animate-spin text-sky-200" />
      <div>
        <div className="font-semibold text-white">Refreshing market data...</div>
        <div className="text-sm text-white/64">This may take a few seconds.</div>
      </div>
    </motion.div>
  );
}
