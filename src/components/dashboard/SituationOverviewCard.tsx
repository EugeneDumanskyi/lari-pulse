"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleDot,
  Gauge,
  Info,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import type {
  SituationConfidence,
  SituationDriver,
  SituationOverview,
  SituationRiskLevel
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { GlassPanel, StatusBadge } from "./primitives";

type SituationOverviewStatus = "idle" | "loading" | "ready" | "error";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function toneForBias(bias: SituationOverview["bias"]) {
  if (bias.includes("bullish")) {
    return "green" as const;
  }

  if (bias.includes("bearish")) {
    return "red" as const;
  }

  if (bias === "unknown") {
    return "amber" as const;
  }

  return "blue" as const;
}

function toneForRisk(risk: SituationRiskLevel) {
  if (risk === "high" || risk === "extreme") {
    return "red" as const;
  }

  if (risk === "elevated" || risk === "moderate" || risk === "unknown") {
    return "amber" as const;
  }

  return "green" as const;
}

function toneForConfidence(confidence: SituationConfidence) {
  if (confidence === "high") {
    return "green" as const;
  }

  if (confidence === "medium") {
    return "amber" as const;
  }

  return "red" as const;
}

function directionTone(direction: SituationDriver["direction"]) {
  if (direction === "bullish" || direction === "risk_on") {
    return "text-emerald-200";
  }

  if (direction === "bearish" || direction === "risk_off") {
    return "text-rose-200";
  }

  if (direction === "mixed") {
    return "text-cyan-100";
  }

  return "text-white/68";
}

function scoreTone(score: number) {
  if (score >= 25) {
    return "text-emerald-200";
  }

  if (score <= -25) {
    return "text-rose-200";
  }

  return "text-cyan-100";
}

function LoadingOverview() {
  return (
    <GlassPanel className="mb-4 p-5 md:p-6">
      <div className="animate-pulse">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-3">
            <div className="h-3 w-40 rounded-full bg-white/12" />
            <div className="h-7 w-72 rounded-full bg-white/14" />
          </div>
          <div className="h-10 w-10 rounded-2xl bg-white/10" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="h-4 rounded-full bg-white/12" />
            <div className="h-4 w-5/6 rounded-full bg-white/10" />
            <div className="h-4 w-2/3 rounded-full bg-white/10" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="h-20 rounded-2xl bg-white/[0.06]" key={index} />
            ))}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function DriverList({
  title,
  icon,
  items
}: {
  title: string;
  icon: ReactNode;
  items: SituationDriver[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
        {icon}
        {title}
      </div>
      <div className="space-y-2.5">
        {items.slice(0, 4).map((item) => (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" key={item.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{item.label}</span>
              <span className={cn("text-xs font-semibold capitalize", directionTone(item.direction))}>
                {readable(item.direction)}
              </span>
              <span className="text-xs text-white/42">· {item.strength}</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-white/64">{item.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SituationOverviewCard({
  overview,
  status,
  error,
  onRefresh
}: {
  overview: SituationOverview | null;
  status: SituationOverviewStatus;
  error: string | null;
  onRefresh: () => void;
}) {
  const [showSources, setShowSources] = useState(false);

  if (status === "loading" && !overview) {
    return <LoadingOverview />;
  }

  if (status === "error" && !overview) {
    return (
      <GlassPanel className="mb-4 p-5">
        <div className="flex items-start gap-3 text-rose-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold text-white">Situation overview unavailable</div>
            <div className="mt-1 text-sm text-rose-100/78">{error ?? "Unable to load situation overview."}</div>
          </div>
        </div>
      </GlassPanel>
    );
  }

  if (!overview) {
    return null;
  }

  const showConflicts = overview.conflictingSignals.length > 0;
  const showWatchConditions = overview.watchConditions.length > 0;
  const showDataWarnings = overview.dataWarnings.length > 0;

  return (
    <GlassPanel className="mb-4 p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/48">
            <Sparkles className="h-4 w-4" />
            Market State
          </div>
          <h2 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight text-white md:text-3xl">
            {overview.title}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={toneForBias(overview.bias)}>Bias: {readable(overview.bias)}</StatusBadge>
          <StatusBadge tone={toneForRisk(overview.riskLevel)}>Risk: {overview.riskLevel}</StatusBadge>
          <StatusBadge tone={toneForConfidence(overview.confidence)}>Confidence: {overview.confidence}</StatusBadge>
          {overview.meta.isPartial ? <StatusBadge tone="amber">Partial data</StatusBadge> : null}
          <button
            aria-label="Refresh situation overview"
            className="glass-surface flex h-8 w-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/12"
            onClick={onRefresh}
            title="Refresh situation overview"
            type="button"
          >
            <RefreshCw className={cn("h-4 w-4", status === "loading" && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
              <Info className="h-4 w-4" />
              Why this matters
            </div>
            <p className="max-w-5xl text-sm leading-6 text-white/76 md:text-base md:leading-7">
              {overview.summary}
            </p>
          </section>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/52">
                <Gauge className="h-4 w-4" />
                Direction
              </div>
              <div className={cn("mt-2 text-2xl font-semibold", scoreTone(overview.score))}>
                {overview.score > 0 ? "+" : ""}{overview.score}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-white/52">
                <ShieldAlert className="h-4 w-4" />
                Risk
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">{overview.riskScore}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-xs text-white/52">Drivers</div>
              <div className="mt-2 text-2xl font-semibold text-white">{overview.mainDrivers.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-xs text-white/52">Conflicts</div>
              <div className="mt-2 text-2xl font-semibold text-white">{overview.conflictingSignals.length}</div>
            </div>
          </div>

          {overview.changedSincePrevious && overview.changedSincePrevious.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-200/24 bg-cyan-300/8 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/58">
                Changed since previous
              </div>
              <div className="space-y-2">
                {overview.changedSincePrevious.slice(0, 3).map((change) => (
                  <div className="text-sm leading-5 text-white/72" key={change.id}>
                    <span className="font-semibold text-white">{change.label}:</span> {change.explanation}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-1">
          <DriverList
            icon={<ListChecks className="h-4 w-4" />}
            items={overview.mainDrivers}
            title="Main drivers"
          />
          {showConflicts ? (
            <DriverList
              icon={<AlertTriangle className="h-4 w-4" />}
              items={overview.conflictingSignals}
              title="Conflicting signals"
            />
          ) : null}
        </div>
      </div>

      {showWatchConditions || showDataWarnings ? (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {showWatchConditions ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                <CircleDot className="h-4 w-4" />
                Watch conditions
              </div>
              <div className="space-y-2.5">
                {overview.watchConditions.map((item) => (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3" key={item.id}>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      {item.label}
                      <span className={cn("text-xs capitalize", item.severity === "critical" ? "text-rose-200" : item.severity === "warning" ? "text-amber-200" : "text-cyan-100")}>
                        {item.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/64">{item.condition}</div>
                    <div className="mt-1 text-xs leading-5 text-white/50">{item.implication}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showDataWarnings ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                <AlertTriangle className="h-4 w-4" />
                Data quality
              </div>
              <div className="space-y-2.5">
                {overview.dataWarnings.map((item) => (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3" key={item.id}>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      {item.label}
                      <span className={cn("text-xs capitalize", item.severity === "critical" ? "text-rose-200" : item.severity === "warning" ? "text-amber-200" : "text-cyan-100")}>
                        {item.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/58">{item.explanation}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 border-t border-white/10 pt-4">
        <button
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48 transition hover:text-white/70"
          onClick={() => setShowSources((current) => !current)}
          type="button"
        >
          <ChevronDown className={cn("h-4 w-4 transition", showSources && "rotate-180")} />
          Source widgets
        </button>
        {showSources ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {overview.sourceWidgets.map((source) => (
              <span
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize",
                  source.status === "used" && "border-emerald-200/30 bg-emerald-300/10 text-emerald-100",
                  source.status === "stale" && "border-amber-200/34 bg-amber-300/10 text-amber-100",
                  source.status === "missing" && "border-white/12 bg-white/[0.04] text-white/52",
                  source.status === "error" && "border-rose-200/34 bg-rose-300/10 text-rose-100",
                  source.status === "fallback" && "border-cyan-200/30 bg-cyan-300/10 text-cyan-100"
                )}
                key={source.id}
              >
                {source.name}: {source.status}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 text-xs text-white/38">Market-state analysis only. Not financial advice.</div>
      </div>
    </GlassPanel>
  );
}
