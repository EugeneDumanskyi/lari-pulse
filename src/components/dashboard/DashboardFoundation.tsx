"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  DollarSign,
  Flame,
  Globe2,
  Layers,
  LineChart,
  Lock,
  RefreshCw,
  Scale,
  Shield,
  Zap
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  CrossMarketWidgetsApi,
  MarketCandleApi,
  MarketOverviewApi,
  RuntimeStatusApi,
  SymbolApi,
  WidgetResultApi,
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import {
  formatLocalDateTime,
  isIsoDateString,
  replaceIsoDatesWithLocalTime
} from "@/lib/utils/formatDateTime";
import {
  AppShell,
  EmptyState,
  GlassCard,
  GlassPanel,
  MetricPill,
  SectionHeader,
  StatusBadge
} from "./primitives";
import { SituationOverviewCard } from "./SituationOverviewCard";
import { useSituationOverview } from "./useSituationOverview";

const timeframes = ["15m", "1h", "4h", "1d"];
const chartRanges = ["1d", "7d", "30d", "90d"];

const widgetMeta = {
  trend_strength: { title: "Trend Strength", icon: LineChart },
  momentum_exhaustion: { title: "Momentum Exhaustion", icon: Zap },
  support_resistance_pressure: { title: "Support / Resistance Pressure", icon: Scale },
  volume_confirmation: { title: "Volume Confirmation", icon: BarChart3 },
  multi_timeframe_alignment: { title: "Multi-Timeframe Alignment", icon: Layers },
  liquidations: { title: "Liquidations", icon: Zap },
  macro_risk_pulse: { title: "Macro Risk Pulse", icon: Globe2 },
  dollar_pressure: { title: "Dollar Pressure", icon: DollarSign },
  gold_risk_hedge: { title: "Gold / Risk Hedge", icon: Shield },
  oil_inflation_pressure: { title: "Oil Inflation Pressure", icon: Flame },
  nasdaq_crypto_correlation: { title: "Nasdaq-Crypto Correlation", icon: LineChart },
  cross_market_divergence: { title: "Cross-Market Divergence", icon: Scale },
  risk_regime: { title: "Risk Regime", icon: Activity }
} as const;

type DashboardStatus = "loading" | "ready" | "error";
type WarningTone = "amber" | "red" | "cyan";
type Phase2Filter = "all" | "macro" | "correlation" | "divergence";

interface DashboardWarning {
  id: string;
  tone: WarningTone;
  title: string;
  message: string;
}

async function fetchApi<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

function emptyCrossMarketData(): CrossMarketWidgetsApi {
  return {
    timeframe: "1d",
    results: [],
    assetStatuses: [],
    correlations: [],
    warnings: [],
    updatedAt: new Date().toISOString()
  };
}

function formatPair(symbol: string) {
  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}/USDT`;
  }

  return symbol;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 1000 ? 0 : 2
  }).format(value);
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(value: string | null | undefined) {
  return formatLocalDateTime(value);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatMessage(value: string) {
  return replaceIsoDatesWithLocalTime(value);
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.74) {
    return "High";
  }

  if (confidence >= 0.5) {
    return "Medium";
  }

  return "Low";
}

function severityTone(severity: WidgetResultApi["severity"]) {
  return severity === "high" ? "red" : severity === "medium" ? "amber" : "green";
}

function warningToneClass(tone: WarningTone) {
  if (tone === "red") {
    return "border-rose-300/40 bg-rose-500/12 text-rose-100";
  }

  if (tone === "cyan") {
    return "border-cyan-200/32 bg-cyan-300/10 text-cyan-100";
  }

  return "border-amber-300/42 bg-amber-500/13 text-amber-100";
}

function hasConflictDetail(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized.includes("conflict") || normalized.includes("mixed") || normalized.includes("insufficient");
  }

  if (Array.isArray(value)) {
    return value.some(hasConflictDetail);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(hasConflictDetail);
  }

  return false;
}

function getWidgetWarnings(result: WidgetResultApi) {
  const warnings: DashboardWarning[] = [];
  const direction = result.direction.toLowerCase();

  if (result.confidence < 0.5) {
    warnings.push({
      id: `${result.widgetId}-low-confidence`,
      tone: "amber",
      title: "Low confidence",
      message: "Signal quality is reduced by limited or conflicting inputs."
    });
  }

  if (
    direction.includes("mixed") ||
    direction.includes("conflicting") ||
    direction.includes("insufficient") ||
    hasConflictDetail(result.details)
  ) {
    warnings.push({
      id: `${result.widgetId}-conflict`,
      tone: "cyan",
      title: "Conflicting signals",
      message: "The widget found disagreement inside its supporting indicators."
    });
  }

  return warnings;
}

function DashboardWarnings({ warnings }: { warnings: DashboardWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
      {warnings.map((warning) => (
        <div
          className={cn(
            "flex gap-3 rounded-2xl border px-5 py-3 text-sm leading-5 backdrop-blur-xl",
            warningToneClass(warning.tone)
          )}
          key={warning.id}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold text-white">{warning.title}</div>
            <div className="text-current/80">{formatMessage(warning.message)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function directionTone(direction: string) {
  const value = direction.toLowerCase();

  if (
    value.includes("bull") ||
    value.includes("support") ||
    value.includes("confirmation") ||
    value.includes("risk_on") ||
    value.includes("easing") ||
    value.includes("outperforming") ||
    value.includes("short_liquidations")
  ) {
    return "green";
  }

  if (
    value.includes("bear") ||
    value.includes("resistance") ||
    value.includes("oversold") ||
    value.includes("risk_off") ||
    value.includes("pressure") ||
    value.includes("underperforming") ||
    value.includes("long_liquidations")
  ) {
    return "red";
  }

  return "amber";
}

function widgetTitle(widgetId: string) {
  return widgetMeta[widgetId as keyof typeof widgetMeta]?.title ?? widgetId.replaceAll("_", " ");
}

function readableLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableText(value: string) {
  return replaceIsoDatesWithLocalTime(value).replaceAll("_", " ");
}

function formatDetailNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1000) {
    return formatCompact(value);
  }

  return formatNumber(value, absoluteValue < 10 ? 3 : 2);
}

function isPrimitiveDetail(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatPrimitiveDetail(value: string | number | boolean | null) {
  if (value === null) {
    return "--";
  }

  if (typeof value === "number") {
    return formatDetailNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (isIsoDateString(value)) {
    return formatLocalDateTime(value);
  }

  return readableText(value);
}

function summarizeDetailArray(values: unknown[]) {
  if (values.length === 0) {
    return "None";
  }

  if (values.every(isPrimitiveDetail)) {
    const visible = values.slice(0, 4).map(formatPrimitiveDetail).join(", ");
    return values.length > 4 ? `${visible} +${values.length - 4} more` : visible;
  }

  const summaries = values.slice(0, 3).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const label = [record.label, record.id, record.symbol].find((entry): entry is string => typeof entry === "string");
      const trend = [record.trend, record.direction].find((entry): entry is string => typeof entry === "string");

      return [label, trend ? readableText(trend) : null].filter(Boolean).join(": ") || "Structured item";
    }

    return "Structured item";
  });

  return values.length > 3 ? `${summaries.join("; ")} +${values.length - 3} more` : summaries.join("; ");
}

function summarizeDetailObject(value: Record<string, unknown>) {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);

  if (entries.length === 0) {
    return "No supporting values";
  }

  const symbolSummaries = entries
    .filter(([, item]) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 4)
    .map(([key, item]) => {
      const record = item as Record<string, unknown>;
      const trend = typeof record.trend === "string" ? readableText(record.trend) : null;
      const direction = typeof record.direction === "string" ? readableText(record.direction) : null;
      const change = typeof record.change5Pct === "number" ? `${formatDetailNumber(record.change5Pct)}%` : null;

      return [key, trend ?? direction, change].filter(Boolean).join(": ");
    });

  if (symbolSummaries.length > 0) {
    return entries.length > 4 ? `${symbolSummaries.join("; ")} +${entries.length - 4} more` : symbolSummaries.join("; ");
  }

  const primitiveSummaries = entries
    .filter(([, item]) => isPrimitiveDetail(item))
    .slice(0, 4)
    .map(([key, item]) => `${readableLabel(key)}: ${formatPrimitiveDetail(item as string | number | boolean | null)}`);

  if (primitiveSummaries.length > 0) {
    return entries.length > 4 ? `${primitiveSummaries.join("; ")} +${entries.length - 4} more` : primitiveSummaries.join("; ");
  }

  return `${entries.length} structured ${entries.length === 1 ? "value" : "values"}`;
}

function formatDetailValue(value: unknown) {
  if (isPrimitiveDetail(value)) {
    return formatPrimitiveDetail(value);
  }

  if (Array.isArray(value)) {
    return summarizeDetailArray(value);
  }

  if (value && typeof value === "object") {
    return summarizeDetailObject(value as Record<string, unknown>);
  }

  return "--";
}

function detailValueParts(value: string) {
  const delimiter = value.includes("; ") ? /;\s+/ : value.includes(", ") ? /,\s+/ : null;

  if (!delimiter) {
    return [value];
  }

  const parts = value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : [value];
}

function detailRows(details: Record<string, unknown>) {
  const priorityKeys = [
    "scoreMeaning",
    "direction",
    "latestClose",
    "ma7",
    "ma30",
    "priceVsMa30Pct",
    "structure",
    "drivers",
    "conflicts",
    "warnings",
    "longLiquidationUsd",
    "shortLiquidationUsd",
    "totalLiquidationUsd",
    "netPressure",
    "assets",
    "correlations"
  ];
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  const sorted = entries.sort(([leftKey], [rightKey]) => {
    const leftIndex = priorityKeys.indexOf(leftKey);
    const rightIndex = priorityKeys.indexOf(rightKey);
    const leftScore = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightScore = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return leftKey.localeCompare(rightKey);
  });

  return sorted.slice(0, 7).map(([key, value]) => {
    const formattedValue = formatDetailValue(value);

    return {
      key,
      label: readableLabel(key),
      value: formattedValue,
      parts: detailValueParts(formattedValue)
    };
  });
}

function WidgetIcon({ widgetId }: { widgetId: string }) {
  const Icon = widgetMeta[widgetId as keyof typeof widgetMeta]?.icon ?? Activity;
  return <Icon className="h-5 w-5 text-white/72" />;
}

function MiniSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <GlassCard className="h-[252px] animate-pulse p-5" key={index}>
          <div className="h-4 w-2/3 rounded-full bg-white/14" />
          <div className="mx-auto my-7 h-24 w-24 rounded-full bg-white/10" />
          <div className="space-y-3">
            <div className="h-3 rounded-full bg-white/12" />
            <div className="h-3 w-4/5 rounded-full bg-white/10" />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function PriceChart({
  candles,
  range,
  symbol,
  timeframe
}: {
  candles: MarketCandleApi[];
  range: string;
  symbol: string;
  timeframe: string;
}) {
  const { linePoints, areaPoints, volumeBars, min, max, latest } = useMemo(() => {
    const width = 880;
    const chartTop = 22;
    const chartHeight = 150;
    const volumeTop = 194;
    const volumeHeight = 38;
    const closes = candles.map((candle) => candle.close);
    const highs = candles.map((candle) => candle.high);
    const lows = candles.map((candle) => candle.low);
    const volumes = candles.map((candle) => candle.volume);
    const minClose = closes.length > 0 ? Math.min(...closes) : 0;
    const maxClose = closes.length > 0 ? Math.max(...closes) : 1;
    const periodHigh = highs.length > 0 ? Math.max(...highs) : null;
    const periodLow = lows.length > 0 ? Math.min(...lows) : null;
    const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
    const priceRange = maxClose - minClose || 1;
    const step = candles.length > 1 ? width / (candles.length - 1) : width;
    const points = candles.map((candle, index) => {
      const x = index * step;
      const y = chartTop + chartHeight - ((candle.close - minClose) / priceRange) * chartHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return {
      linePoints: points.join(" "),
      areaPoints: points.length > 0 ? `0,${chartTop + chartHeight} ${points.join(" ")} ${width},${chartTop + chartHeight}` : "",
      volumeBars: candles.map((candle, index) => ({
        x: index * step,
        y: volumeTop + volumeHeight - (candle.volume / maxVolume) * volumeHeight,
        width: Math.max(2, step * 0.42),
        height: Math.max(2, (candle.volume / maxVolume) * volumeHeight),
        up: candle.close >= candle.open
      })),
      min: periodLow,
      max: periodHigh,
      latest: candles.at(-1)?.close ?? null
    };
  }, [candles]);

  return (
    <GlassPanel className="mb-4 p-4">
      <div className="mb-3 flex flex-col gap-2 text-sm text-white/70 md:flex-row md:items-center">
        <div className="text-lg font-semibold text-white">{formatPair(symbol)} · {timeframe} signals · {range.toUpperCase()} chart</div>
        <span className="hidden h-2 w-2 rounded-full bg-emerald-300 md:block" />
        <span>High {formatNumber(max)}</span>
        <span>Low {formatNumber(min)}</span>
        <span className="text-emerald-300">Last {formatNumber(latest)}</span>
      </div>
      <div className="chart-grid relative h-[280px] overflow-hidden rounded-[24px] bg-slate-950/20 md:h-[330px]">
        {candles.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/60">
            No stored candles are available for this market yet.
          </div>
        ) : (
          <>
            <svg
              className="absolute inset-x-4 top-8 h-[235px] w-[calc(100%-32px)] overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 880 250"
            >
              <defs>
                <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(94 234 212)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="rgb(94 234 212)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon fill="url(#priceArea)" points={areaPoints} />
              <polyline fill="none" points={linePoints} stroke="rgb(103 232 249)" strokeLinecap="round" strokeWidth="3" />
              {volumeBars.map((bar, index) => (
                <rect
                  fill={bar.up ? "rgba(52, 211, 153, 0.48)" : "rgba(251, 113, 133, 0.44)"}
                  height={bar.height}
                  key={index}
                  rx="2"
                  width={bar.width}
                  x={bar.x}
                  y={bar.y}
                />
              ))}
            </svg>
            <div className="absolute right-0 top-16 rounded-l-xl bg-cyan-300 px-3 py-1 text-sm font-semibold text-slate-950">
              {formatNumber(latest)}
            </div>
            <div className="absolute inset-x-0 top-20 border-t border-dashed border-cyan-200/45" />
          </>
        )}
      </div>
    </GlassPanel>
  );
}

function WidgetResultCard({
  result,
  selected,
  onBack,
  onSelect
}: {
  result: WidgetResultApi;
  selected: boolean;
  onBack: () => void;
  onSelect: () => void;
}) {
  return (
    <GlassCard className="scroll-optimized-card h-[444px] p-5 [perspective:1200px]" selected={selected}>
      <AnimatePresence initial={false} mode="wait">
        {selected ? (
          <motion.div
            animate={{ opacity: 1, rotateY: 0 }}
            className="h-full"
            exit={{ opacity: 0, rotateY: -90 }}
            initial={{ opacity: 0, rotateY: 90 }}
            key="details"
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <WidgetResultCardBack onBack={onBack} result={result} />
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, rotateY: 0 }}
            className="h-full"
            exit={{ opacity: 0, rotateY: 90 }}
            initial={{ opacity: 0, rotateY: -90 }}
            key="summary"
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <WidgetResultCardFront onSelect={onSelect} result={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function WidgetResultCardFront({
  result,
  onSelect
}: {
  result: WidgetResultApi;
  onSelect: () => void;
}) {
  const tone = directionTone(result.direction);
  const warnings = getWidgetWarnings(result);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-start justify-between gap-4">
        <h3 className="max-w-[190px] text-sm font-semibold leading-5 text-white">{widgetTitle(result.widgetId)}</h3>
        <WidgetIcon widgetId={result.widgetId} />
      </div>
      <div className="mb-5 flex flex-col items-center gap-4">
        <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full border-[8px] border-white/14">
          <div
            className={cn(
              "absolute h-36 w-36 rounded-full border-[8px] border-transparent border-l-current border-t-current",
              tone === "green" && "text-emerald-300",
              tone === "red" && "text-rose-300",
              tone === "amber" && "text-amber-300"
            )}
          />
          <div className="relative text-center">
            <div className="text-4xl font-semibold text-white/90">{Math.round(result.score)}</div>
            <div className={cn("mx-auto mt-1 max-w-[116px] text-[10px] font-semibold uppercase leading-[1.12]", tone === "green" && "text-emerald-300", tone === "red" && "text-rose-300", tone === "amber" && "text-amber-300")}>
              {result.direction.replaceAll("_", " ")}
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 text-xs">
          <div>
            <div className="mb-1 text-white/58">Confidence</div>
            <StatusBadge tone={result.confidence >= 0.74 ? "green" : result.confidence >= 0.5 ? "amber" : "red"}>
              {confidenceLabel(result.confidence)} · {Math.round(result.confidence * 100)}%
            </StatusBadge>
          </div>
          <div>
            <div className="mb-1 text-white/58">Severity</div>
            <StatusBadge tone={severityTone(result.severity)}>{result.severity}</StatusBadge>
          </div>
        </div>
      </div>
      {warnings.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                warningToneClass(warning.tone)
              )}
              key={warning.id}
            >
              {warning.title}
            </span>
          ))}
        </div>
      ) : null}
      <p className="line-clamp-4 text-xs leading-5 text-white/68">{result.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-white/58">
        <span>{formatTime(result.updatedAt)}</span>
        <button
          className="rounded-xl border border-white/14 bg-white/10 px-3 py-2 font-semibold text-white/82 transition hover:bg-white/16"
          onClick={onSelect}
          type="button"
        >
          More details
        </button>
      </div>
    </div>
  );
}

function WidgetResultCardBack({
  result,
  onBack
}: {
  result: WidgetResultApi;
  onBack: () => void;
}) {
  const warnings = getWidgetWarnings(result);
  const details = detailRows(result.details);
  const primarySource = result.sources.at(0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <WidgetIcon widgetId={result.widgetId} />
          <div>
            <h3 className="text-sm font-semibold leading-5 text-white">{widgetTitle(result.widgetId)}</h3>
            <div className="mt-1 text-xs text-white/52">{formatTime(result.updatedAt)}</div>
          </div>
        </div>
        <button
          className="rounded-xl border border-white/14 bg-white/10 px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/16"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-white/52">Score</div>
          <div className="mt-1 text-xl font-semibold text-white">{Math.round(result.score)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-white/52">Confidence</div>
          <div className="mt-1 font-semibold text-white">{Math.round(result.confidence * 100)}%</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-white/52">Severity</div>
          <div className="mt-1 font-semibold capitalize text-white">{result.severity}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm leading-6 text-white/76">
        {warnings.length > 0 ? (
          <section className="space-y-2">
            {warnings.map((warning) => (
              <div
                className={cn("rounded-2xl border px-3 py-2 text-xs", warningToneClass(warning.tone))}
                key={warning.id}
              >
                <div className="font-semibold text-white">{warning.title}</div>
                <div className="text-sm text-current/82">{formatMessage(warning.message)}</div>
              </div>
            ))}
          </section>
        ) : null}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/46">Summary</h4>
          <p className="line-clamp-4">{result.summary}</p>
        </section>
        {details.length > 0 ? (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/46">Details</h4>
            <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              {details.map((detail) => (
                <div className="grid grid-cols-[minmax(84px,118px)_1fr] gap-3 px-3 py-2.5 text-xs" key={detail.key}>
                  <span className="break-words text-white/58">{detail.label}</span>
                  {detail.parts.length > 1 ? (
                    <ul className="ml-auto max-w-full space-y-1 text-right font-medium text-white/86">
                      {detail.parts.slice(0, 5).map((part) => (
                        <li className="break-words" key={part}>{part}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="line-clamp-3 break-words text-right font-medium text-white/86">
                      {detail.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {primarySource ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs">
            <div className="font-semibold text-white">{primarySource.source} · {primarySource.type}</div>
            <div className="mt-1 text-white/58">
              {[primarySource.symbol, primarySource.timeframe, primarySource.updatedAt ? formatTime(primarySource.updatedAt) : null].filter(Boolean).join(" · ")}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function phase2Group(widgetId: string): Phase2Filter {
  if (widgetId.includes("correlation")) {
    return "correlation";
  }

  if (widgetId.includes("divergence")) {
    return "divergence";
  }

  return "macro";
}

function CrossMarketOverview({
  data,
  filter,
  onFilterChange,
  selectedWidgetId,
  onSelectWidget,
  onBack
}: {
  data: CrossMarketWidgetsApi | null;
  filter: Phase2Filter;
  onFilterChange: (filter: Phase2Filter) => void;
  selectedWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  onBack: () => void;
}) {
  const filteredWidgets = useMemo(() => {
    if (!data) {
      return [];
    }

    if (filter === "all") {
      return data.results;
    }

    return data.results.filter((result) => phase2Group(result.widgetId) === filter);
  }, [data, filter]);
  const primaryAssets = data?.assetStatuses.filter((status) =>
    ["BTCUSDT", "NASDAQ100", "SPX", "DXY", "US10Y", "XAUUSD", "WTI", "VIX"].includes(status.symbol)
  ) ?? [];
  const primaryCorrelations = data?.correlations.slice(0, 4) ?? [];

  return (
    <GlassPanel className="mb-4 p-4 md:p-5">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <SectionHeader eyebrow="Cross-market context" title="Macro Context" />
        <div className="glass-surface flex w-fit overflow-hidden rounded-[18px] p-1">
          {(["all", "macro", "correlation", "divergence"] as Phase2Filter[]).map((item) => (
            <button
              className={cn(
                "h-9 rounded-[14px] px-3 text-xs font-semibold capitalize text-white/68 transition hover:bg-white/10",
                item === filter && "bg-white/18 text-white shadow-glass"
              )}
              key={item}
              onClick={() => onFilterChange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {data?.warnings.length ? (
        <div className="mb-4 rounded-2xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {formatMessage(data.warnings.slice(0, 2).join(" "))}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8">
        {primaryAssets.map((asset) => (
          <div className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-3 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.10)]" key={asset.symbol}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white/64">{asset.symbol}</div>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  asset.isMissing ? "bg-rose-300" : asset.isStale ? "bg-amber-300" : "bg-emerald-300"
                )}
              />
            </div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(asset.latestValue)}</div>
            <div className={cn("mt-1 text-xs font-semibold", (asset.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>
              {asset.changePercent === null ? "--" : `${asset.changePercent >= 0 ? "+" : ""}${formatNumber(asset.changePercent)}%`}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-4">
        {primaryCorrelations.map((pair) => (
          <div className="rounded-[20px] border border-white/10 bg-slate-950/18 px-4 py-3" key={pair.id}>
            <div className="text-xs font-semibold text-white/52">{pair.label}</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-2xl font-semibold text-white">
                {pair.latestCorrelation === null ? "--" : pair.latestCorrelation.toFixed(2)}
              </div>
              <div className={cn("text-xs font-semibold", (pair.divergencePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>
                {pair.divergencePercent === null ? "--" : `${pair.divergencePercent >= 0 ? "+" : ""}${formatNumber(pair.divergencePercent)}% div`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredWidgets.length === 0 ? (
        <EmptyState
          description="Run daily cross-market collection to populate macro context."
          title="No cross-market widget results available"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredWidgets.map((result) => (
            <WidgetResultCard
              key={result.widgetId}
              onBack={onBack}
              onSelect={() => onSelectWidget(result.widgetId)}
              result={result}
              selected={result.widgetId === selectedWidgetId}
            />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

export function DashboardFoundation() {
  const [symbols, setSymbols] = useState<SymbolApi[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [chartRange, setChartRange] = useState("1d");
  const [overview, setOverview] = useState<MarketOverviewApi | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusApi | null>(null);
  const [widgets, setWidgets] = useState<WidgetResultApi[]>([]);
  const [crossMarket, setCrossMarket] = useState<CrossMarketWidgetsApi | null>(null);
  const [authSession, setAuthSession] = useState<AuthSessionApi | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedCrossMarketWidgetId, setSelectedCrossMarketWidgetId] = useState<string | null>(null);
  const [phase2Filter, setPhase2Filter] = useState<Phase2Filter>("all");
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);
  const situationOverview = useSituationOverview({
    symbol,
    timeframe,
    refreshKey: refreshCounter
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadSymbols() {
      try {
        const data = await fetchApi<{ symbols: SymbolApi[]; count: number; session: AuthSessionApi }>("/api/symbols", controller.signal);
        setSymbols(data.symbols);
        setAuthSession(data.session);
        if (data.symbols.length > 0) {
          const unlockedSymbols = data.symbols.filter((item) => !item.isLocked);
          setSymbol((current) => unlockedSymbols.some((item) => item.symbol === current) ? current : unlockedSymbols[0]?.symbol ?? data.symbols[0].symbol);
        }
      } catch (loadError) {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load symbols");
        }
      }
    }

    void loadSymbols();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setStatus("loading");
      setError(null);

      try {
        const sessionData = await fetchApi<AuthSessionApi>("/api/auth/session", controller.signal);
        setAuthSession(sessionData);

        if (!sessionData.accessibleSymbols.includes(symbol)) {
          setSymbol(sessionData.accessibleSymbols[0] ?? "BTCUSDT");
          return;
        }

        const [marketData, widgetData, runtimeData, crossMarketData] = await Promise.all([
          fetchApi<MarketOverviewApi>(
            `/api/market/overview?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&interval=${encodeURIComponent(timeframe)}&range=${encodeURIComponent(chartRange)}&limit=120`,
            controller.signal
          ),
          fetchApi<{ results: WidgetResultApi[] }>(
            `/api/widgets/latest?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
            controller.signal
          ),
          fetchApi<RuntimeStatusApi>(
            "/api/runtime/status",
            controller.signal
          ),
          sessionData.isAdmin
            ? fetchApi<CrossMarketWidgetsApi>(
                "/api/widgets/cross-market?timeframe=1d",
                controller.signal
              )
            : Promise.resolve(emptyCrossMarketData())
        ]);

        setOverview(marketData);
        setWidgets(widgetData.results);
        setRuntimeStatus(runtimeData);
        setCrossMarket(crossMarketData);
        setSelectedWidgetId((current) => {
          if (current && widgetData.results.some((result) => result.widgetId === current)) {
            return current;
          }

          return null;
        });
        setSelectedCrossMarketWidgetId((current) => {
          if (current && crossMarketData.results.some((result) => result.widgetId === current)) {
            return current;
          }

          return null;
        });
        setStatus("ready");
      } catch (loadError) {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setStatus("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data");
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [symbol, timeframe, chartRange, refreshCounter]);

  async function refreshMarketData() {
    setIsCollecting(true);
    setError(null);

    try {
      const response = await fetch("/api/collect/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          symbols: [symbol],
          timeframes
        })
      });
      const body = (await response.json()) as { status?: string; message?: string };

      if (!response.ok || body.status === "error") {
        throw new Error(body.message ?? "Unable to refresh market data");
      }

      setRefreshCounter((current) => current + 1);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh market data");
    } finally {
      setIsCollecting(false);
    }
  }

  const metrics = overview?.metrics;
  const dashboardWarnings = useMemo<DashboardWarning[]>(() => {
    const warnings: DashboardWarning[] = [];

    if (overview?.metrics.isStale) {
      warnings.push({
        id: "stale-market-data",
        tone: "amber",
        title: "Stale market data",
        message: overview.metrics.staleReason ?? "Latest candle data is older than expected."
      });
    }

    if (overview?.source.warning) {
      warnings.push({
        id: "market-source-warning",
        tone: overview.source.isFallback ? "red" : "amber",
        title: overview.source.isFallback ? "Using local market data" : "Incomplete market range",
        message: overview.source.warning
      });
    }

    if (overview && overview.metrics.candleCount === 0) {
      warnings.push({
        id: "missing-market-data",
        tone: "red",
        title: "Missing candle data",
        message: "No candles are available for this symbol and chart range."
      });
    }

    if (status === "ready" && widgets.length === 0) {
      warnings.push({
        id: "missing-widget-data",
        tone: "red",
        title: "Missing widget results",
        message: "Collection may have run before widget calculation, or this pair has not been processed yet."
      });
    }

    if (runtimeStatus?.collection.hasCollectorFailure) {
      warnings.push({
        id: "collector-failure",
        tone: "red",
        title: "Collector failure",
        message: runtimeStatus.collection.warningMessages.join(" ")
      });
    }

    const lowConfidenceCount = widgets.filter((result) => result.confidence < 0.5).length;
    const conflictCount = widgets.filter((result) =>
      getWidgetWarnings(result).some((warning) => warning.id.endsWith("-conflict"))
    ).length;

    if (lowConfidenceCount > 0) {
      warnings.push({
        id: "low-confidence-signals",
        tone: "amber",
        title: "Low confidence signal",
        message: `${lowConfidenceCount} widget${lowConfidenceCount === 1 ? "" : "s"} currently report reduced confidence.`
      });
    }

    if (conflictCount > 0) {
      warnings.push({
        id: "conflicting-signals",
        tone: "cyan",
        title: "Conflicting signals",
        message: `${conflictCount} widget${conflictCount === 1 ? "" : "s"} show mixed or conflicting inputs.`
      });
    }

    return warnings;
  }, [overview, runtimeStatus, status, widgets]);

  return (
    <AppShell activeItem="dashboard">
      <section className="relative flex min-w-0 flex-1 gap-4 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Market Intelligence</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">LariPulse</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="glass-surface flex flex-wrap gap-1 rounded-[22px] p-1">
                {symbols.map((item) => (
                  <button
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-[18px] px-4 text-sm font-semibold text-white/74 transition hover:bg-white/10",
                      item.symbol === symbol && "bg-white/18 text-white shadow-glass",
                      item.isLocked && "cursor-not-allowed opacity-45 hover:bg-transparent"
                    )}
                    disabled={item.isLocked}
                    key={item.symbol}
                    onClick={() => {
                      if (!item.isLocked) {
                        setSymbol(item.symbol);
                      }
                    }}
                    title={item.isLocked ? "Locked in Basic access" : undefined}
                    type="button"
                  >
                    {formatPair(item.symbol)}
                    {item.isLocked ? <Lock className="h-4 w-4 text-white/54" /> : <ChevronDown className="h-4 w-4 text-white/46" />}
                  </button>
                ))}
              </div>
              <div className="glass-surface flex w-fit overflow-hidden rounded-[22px] p-1">
                {timeframes.map((item) => (
                  <button
                    className={cn(
                      "h-10 min-w-11 rounded-2xl px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10",
                      item === timeframe && "bg-indigo-300/24 text-white shadow-glow"
                    )}
                    key={item}
                    onClick={() => setTimeframe(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="glass-surface flex w-fit overflow-hidden rounded-[22px] p-1">
                {chartRanges.map((item) => (
                  <button
                    className={cn(
                      "h-10 min-w-12 rounded-2xl px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10",
                      item === chartRange && "bg-cyan-300/20 text-white shadow-glow"
                    )}
                    key={item}
                    onClick={() => setChartRange(item)}
                    type="button"
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                aria-label="Pull latest Binance data"
                className="glass-surface flex h-12 w-12 items-center justify-center rounded-2xl text-white/78 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isCollecting}
                onClick={() => void refreshMarketData()}
                title="Pull latest Binance data"
                type="button"
              >
                <RefreshCw className={cn("h-5 w-5", isCollecting && "animate-spin")} />
              </button>
            </div>
          </div>

          <DashboardWarnings warnings={dashboardWarnings} />

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-5 py-3 text-sm text-rose-100">
              {formatMessage(error)}
            </div>
          ) : null}

          <SituationOverviewCard
            error={situationOverview.error}
            onRefresh={situationOverview.refresh}
            overview={situationOverview.overview}
            status={situationOverview.status}
          />

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <MetricPill icon={<Activity className="h-8 w-8 rounded-full bg-black/60 p-1.5 text-cyan-200" />} label={`${formatPair(symbol)} Price`} value={formatNumber(metrics?.latestPrice)} />
            <MetricPill detail={metrics?.changePercent === null || metrics?.changePercent === undefined ? undefined : `${metrics.changePercent >= 0 ? "+" : ""}${formatNumber(metrics.changePercent)}%`} label="Latest Change" value={metrics?.change === null || metrics?.change === undefined ? "--" : `${metrics.change >= 0 ? "+" : ""}${formatNumber(metrics.change)}`} />
            <MetricPill label="Period High" value={formatNumber(metrics?.periodHigh)} />
            <MetricPill label="Period Low" value={formatNumber(metrics?.periodLow)} />
            <MetricPill label="Volume" value={formatCompact(metrics?.periodVolume)} />
            <MetricPill label="Updated" value={formatTime(metrics?.updatedAt)} />
          </div>

          <PriceChart candles={overview?.candles ?? []} range={chartRange} symbol={symbol} timeframe={timeframe} />

          {authSession?.isAdmin ? (
            <CrossMarketOverview
              data={crossMarket}
              filter={phase2Filter}
              onBack={() => setSelectedCrossMarketWidgetId(null)}
              onFilterChange={setPhase2Filter}
              onSelectWidget={setSelectedCrossMarketWidgetId}
              selectedWidgetId={selectedCrossMarketWidgetId}
            />
          ) : null}

          <div className="mb-4 flex items-center justify-between">
            <SectionHeader eyebrow="Signal engines" title="Widget Results" />
            <div className="flex flex-wrap justify-end gap-2">
              {runtimeStatus ? (
                <StatusBadge tone={runtimeStatus.scheduler.enabled ? "green" : "amber"}>
                  Scheduler {runtimeStatus.scheduler.enabled ? "enabled" : "off"}
                </StatusBadge>
              ) : null}
              {runtimeStatus ? (
                <StatusBadge tone={runtimeStatus.scheduler.phase2Enabled ? "green" : "amber"}>
                  Macro {runtimeStatus.scheduler.phase2Enabled ? "scheduled" : "manual"}
                </StatusBadge>
              ) : null}
              {runtimeStatus ? (
                <StatusBadge tone={runtimeStatus.liquidity.enabled ? "green" : "amber"}>
                  Liquidity {runtimeStatus.liquidity.enabled ? "live" : "manual"}
                </StatusBadge>
              ) : null}
              <StatusBadge tone={status === "ready" && widgets.length > 0 ? "green" : "amber"}>
                {status === "loading" ? "Loading" : `${widgets.length} active`}
              </StatusBadge>
            </div>
          </div>

          {status === "loading" ? (
            <MiniSkeleton />
          ) : widgets.length === 0 ? (
            <EmptyState
              description="Run collection and widget calculation for this symbol/timeframe to populate the dashboard."
              title="No widget results available"
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {widgets.map((result) => (
                <WidgetResultCard
                  key={result.id}
                  onBack={() => setSelectedWidgetId(null)}
                  onSelect={() => setSelectedWidgetId(result.widgetId)}
                  result={result}
                  selected={result.widgetId === selectedWidgetId}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
