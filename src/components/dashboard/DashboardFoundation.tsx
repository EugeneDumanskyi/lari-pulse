"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Layers,
  LineChart,
  RefreshCw,
  Scale,
  Zap
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ApiEnvelope,
  MarketCandleApi,
  MarketOverviewApi,
  RuntimeStatusApi,
  SymbolApi,
  WidgetResultApi
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import {
  AppShell,
  EmptyState,
  GlassCard,
  GlassPanel,
  MetricPill,
  SectionHeader,
  StatusBadge
} from "./primitives";

const timeframes = ["15m", "1h", "4h", "1d"];

const widgetMeta = {
  trend_strength: { title: "Trend Strength", icon: LineChart },
  momentum_exhaustion: { title: "Momentum Exhaustion", icon: Zap },
  support_resistance_pressure: { title: "Support / Resistance Pressure", icon: Scale },
  volume_confirmation: { title: "Volume Confirmation", icon: BarChart3 },
  multi_timeframe_alignment: { title: "Multi-Timeframe Alignment", icon: Layers }
} as const;

type DashboardStatus = "loading" | "ready" | "error";
type WarningTone = "amber" | "red" | "cyan";

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
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
            <div className="text-current/80">{warning.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function directionTone(direction: string) {
  const value = direction.toLowerCase();

  if (value.includes("bull") || value.includes("support") || value.includes("confirmation")) {
    return "green";
  }

  if (value.includes("bear") || value.includes("resistance") || value.includes("oversold")) {
    return "red";
  }

  return "amber";
}

function widgetTitle(widgetId: string) {
  return widgetMeta[widgetId as keyof typeof widgetMeta]?.title ?? widgetId.replaceAll("_", " ");
}

function WidgetIcon({ widgetId }: { widgetId: string }) {
  const Icon = widgetMeta[widgetId as keyof typeof widgetMeta]?.icon ?? Activity;
  return <Icon className="h-5 w-5 text-white/72" />;
}

function MiniSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <GlassCard className="h-[238px] animate-pulse p-5" key={index}>
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
  symbol,
  timeframe
}: {
  candles: MarketCandleApi[];
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
    const volumes = candles.map((candle) => candle.volume);
    const minClose = closes.length > 0 ? Math.min(...closes) : 0;
    const maxClose = closes.length > 0 ? Math.max(...closes) : 1;
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
      min: minClose,
      max: maxClose,
      latest: candles.at(-1)?.close ?? null
    };
  }, [candles]);

  return (
    <GlassPanel className="mb-4 p-4">
      <div className="mb-3 flex flex-col gap-2 text-sm text-white/70 md:flex-row md:items-center">
        <div className="text-lg font-semibold text-white">{formatPair(symbol)} · {timeframe} · LariPulse</div>
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
    <GlassCard className={cn("scroll-optimized-card p-5 [perspective:1200px]", selected ? "min-h-[420px]" : "min-h-[324px]")} selected={selected}>
      <AnimatePresence initial={false} mode="wait">
        {selected ? (
          <motion.div
            animate={{ opacity: 1, rotateY: 0 }}
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
    <>
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
      <p className="line-clamp-3 min-h-[60px] text-xs leading-5 text-white/68">{result.summary}</p>
      <div className="mt-5 flex items-center justify-between gap-3 text-xs text-white/58">
        <span>{formatTime(result.updatedAt)}</span>
        <button
          className="rounded-xl border border-white/14 bg-white/10 px-3 py-2 font-semibold text-white/82 transition hover:bg-white/16"
          onClick={onSelect}
          type="button"
        >
          More details
        </button>
      </div>
    </>
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
  const detailEntries = Object.entries(result.details).slice(0, 5);
  const primarySource = result.sources.at(0);

  return (
    <div>
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
      <div className="space-y-4 text-sm leading-6 text-white/76">
        {warnings.length > 0 ? (
          <section className="space-y-2">
            {warnings.map((warning) => (
              <div
                className={cn("rounded-2xl border px-3 py-2 text-xs", warningToneClass(warning.tone))}
                key={warning.id}
              >
                <div className="font-semibold text-white">{warning.title}</div>
                <div className="text-sm text-current/82">{warning.message}</div>
              </div>
            ))}
          </section>
        ) : null}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/46">Summary</h4>
          <p className="line-clamp-4">{result.summary}</p>
        </section>
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/46">Details</h4>
          <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {detailEntries.map(([key, value]) => (
              <div className="grid grid-cols-[92px_1fr] gap-3 px-3 py-2.5 text-xs" key={key}>
                <span className="break-words text-white/58">{key}</span>
                <span className="line-clamp-2 break-words text-right font-medium text-white/86">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </section>
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

export function DashboardFoundation() {
  const [symbols, setSymbols] = useState<SymbolApi[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [overview, setOverview] = useState<MarketOverviewApi | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusApi | null>(null);
  const [widgets, setWidgets] = useState<WidgetResultApi[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSymbols() {
      try {
        const data = await fetchApi<{ symbols: SymbolApi[]; count: number }>("/api/symbols", controller.signal);
        setSymbols(data.symbols);
        if (data.symbols.length > 0) {
          setSymbol((current) => data.symbols.some((item) => item.symbol === current) ? current : data.symbols[0].symbol);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load symbols");
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
        const [marketData, widgetData, runtimeData] = await Promise.all([
          fetchApi<MarketOverviewApi>(
            `/api/market/overview?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=120`,
            controller.signal
          ),
          fetchApi<{ results: WidgetResultApi[] }>(
            `/api/widgets/latest?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
            controller.signal
          ),
          fetchApi<RuntimeStatusApi>(
            "/api/runtime/status",
            controller.signal
          )
        ]);

        setOverview(marketData);
        setWidgets(widgetData.results);
        setRuntimeStatus(runtimeData);
        setSelectedWidgetId((current) => {
          if (current && widgetData.results.some((result) => result.widgetId === current)) {
            return current;
          }

          return null;
        });
        setStatus("ready");
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setStatus("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data");
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [symbol, timeframe, refreshCounter]);

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

    if (overview && overview.metrics.candleCount === 0) {
      warnings.push({
        id: "missing-market-data",
        tone: "red",
        title: "Missing candle data",
        message: "No normalized candles are stored for this symbol and timeframe."
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
    <AppShell>
      <section className="relative flex min-w-0 flex-1 gap-4 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Phase 1 Crypto Signals</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">LariPulse</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="glass-surface flex flex-wrap gap-1 rounded-[22px] p-1">
                {symbols.map((item) => (
                  <button
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-[18px] px-4 text-sm font-semibold text-white/74 transition hover:bg-white/10",
                      item.symbol === symbol && "bg-white/18 text-white shadow-glass"
                    )}
                    key={item.symbol}
                    onClick={() => setSymbol(item.symbol)}
                    type="button"
                  >
                    {formatPair(item.symbol)}
                    <ChevronDown className="h-4 w-4 text-white/46" />
                  </button>
                ))}
              </div>
              <div className="glass-surface flex w-fit overflow-hidden rounded-[22px] p-1">
                {timeframes.map((item) => (
                  <button
                    className={cn(
                      "h-10 min-w-14 rounded-2xl px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10",
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
              <button
                className="glass-surface flex h-12 w-12 items-center justify-center rounded-2xl text-white/78 transition hover:bg-white/12"
                onClick={() => setRefreshCounter((current) => current + 1)}
                type="button"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>

          <DashboardWarnings warnings={dashboardWarnings} />

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-5 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            <MetricPill icon={<Activity className="h-8 w-8 rounded-full bg-black/60 p-1.5 text-cyan-200" />} label={`${formatPair(symbol)} Price`} value={formatNumber(metrics?.latestPrice)} />
            <MetricPill detail={metrics?.changePercent === null || metrics?.changePercent === undefined ? undefined : `${metrics.changePercent >= 0 ? "+" : ""}${formatNumber(metrics.changePercent)}%`} label="Latest Change" value={metrics?.change === null || metrics?.change === undefined ? "--" : `${metrics.change >= 0 ? "+" : ""}${formatNumber(metrics.change)}`} />
            <MetricPill label="Period High" value={formatNumber(metrics?.periodHigh)} />
            <MetricPill label="Period Low" value={formatNumber(metrics?.periodLow)} />
            <MetricPill label="Volume" value={formatCompact(metrics?.periodVolume)} />
            <MetricPill label="Updated" value={formatTime(metrics?.updatedAt)} />
          </div>

          <PriceChart candles={overview?.candles ?? []} symbol={symbol} timeframe={timeframe} />

          <div className="mb-4 flex items-center justify-between">
            <SectionHeader eyebrow="Signal engines" title="Widget Results" />
            <div className="flex flex-wrap justify-end gap-2">
              {runtimeStatus ? (
                <StatusBadge tone={runtimeStatus.scheduler.enabled ? "green" : "amber"}>
                  Scheduler {runtimeStatus.scheduler.enabled ? "enabled" : "off"}
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
