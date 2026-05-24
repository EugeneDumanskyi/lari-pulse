"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Gem,
  Globe2,
  Landmark,
  LineChart,
  Lock,
  Shield
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  CrossMarketWidgetsApi,
  MarketCandleApi,
  MarketOverviewApi,
  MarketsApi,
  MarketSummaryApi,
  WidgetResultApi
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { AppShell, EmptyState, GlassCard, GlassPanel, MetricPill, SectionHeader, StatusBadge } from "@/components/dashboard/primitives";

type LoadStatus = "loading" | "ready" | "error";

async function fetchApi<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.abs(value) > 1000 ? 0 : 2
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

function displaySymbol(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function groupIcon(group: string) {
  if (group === "Crypto") {
    return CircleDollarSign;
  }

  if (group === "Commodity") {
    return Gem;
  }

  if (group === "Equity / Index") {
    return LineChart;
  }

  if (group === "FX / Yield") {
    return Landmark;
  }

  return Globe2;
}

function directionTone(direction: string) {
  const value = direction.toLowerCase();

  if (value.includes("bull") || value.includes("risk_on") || value.includes("support") || value.includes("easing")) {
    return "text-emerald-300";
  }

  if (value.includes("bear") || value.includes("risk_off") || value.includes("pressure") || value.includes("resistance")) {
    return "text-rose-300";
  }

  return "text-amber-300";
}

function chartPoints(candles: MarketCandleApi[]) {
  const width = 760;
  const height = 176;
  const closes = candles.map((candle) => candle.close);
  const min = closes.length > 0 ? Math.min(...closes) : 0;
  const max = closes.length > 0 ? Math.max(...closes) : 1;
  const range = max - min || 1;
  const step = candles.length > 1 ? width / (candles.length - 1) : width;
  const points = candles.map((candle, index) => {
    const x = index * step;
    const y = height - ((candle.close - min) / range) * height;

    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return {
    line: points.join(" "),
    area: points.length > 0 ? `0,${height} ${points.join(" ")} ${width},${height}` : "",
    min,
    max
  };
}

function relatedCrossMarketWidgets(symbol: string, widgets: WidgetResultApi[]) {
  const relatedIds: Record<string, string[]> = {
    BTCUSDT: ["risk_regime", "macro_risk_pulse", "nasdaq_crypto_correlation", "cross_market_divergence"],
    ETHUSDT: ["risk_regime", "nasdaq_crypto_correlation", "cross_market_divergence"],
    SOLUSDT: ["risk_regime", "nasdaq_crypto_correlation", "cross_market_divergence"],
    NASDAQ100: ["risk_regime", "macro_risk_pulse", "nasdaq_crypto_correlation", "cross_market_divergence"],
    SPX: ["risk_regime", "macro_risk_pulse"],
    DXY: ["dollar_pressure", "macro_risk_pulse", "gold_risk_hedge", "cross_market_divergence"],
    US10Y: ["risk_regime", "macro_risk_pulse", "gold_risk_hedge", "oil_inflation_pressure"],
    XAUUSD: ["gold_risk_hedge", "macro_risk_pulse", "cross_market_divergence"],
    WTI: ["oil_inflation_pressure", "macro_risk_pulse"],
    VIX: ["risk_regime", "macro_risk_pulse"]
  };
  const ids = new Set(relatedIds[symbol] ?? []);

  return widgets.filter((widget) => ids.has(widget.widgetId));
}

function MarketSparkline({ candles }: { candles: MarketCandleApi[] }) {
  const points = useMemo(() => chartPoints(candles), [candles]);

  return (
    <div className="chart-grid relative h-[300px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/20">
      {candles.length === 0 ? (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/58">
          No stored candles are available for this market yet.
        </div>
      ) : (
        <>
          <svg className="absolute inset-x-5 top-10 h-[210px] w-[calc(100%-40px)] overflow-visible" preserveAspectRatio="none" viewBox="0 0 760 186">
            <defs>
              <linearGradient id="marketArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(125 211 252)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="rgb(125 211 252)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon fill="url(#marketArea)" points={points.area} />
            <polyline fill="none" points={points.line} stroke="rgb(103 232 249)" strokeLinecap="round" strokeWidth="3" />
          </svg>
          <div className="absolute left-5 top-5 text-xs text-white/48">High {formatNumber(points.max)}</div>
          <div className="absolute bottom-5 left-5 text-xs text-white/48">Low {formatNumber(points.min)}</div>
        </>
      )}
    </div>
  );
}

function MarketListItem({
  market,
  selected,
  onSelect
}: {
  market: MarketSummaryApi;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = groupIcon(market.group);

  return (
    <button
      className={cn(
        "group min-h-[96px] rounded-[22px] border px-4 py-3 text-left transition",
        selected ? "border-sky-200/34 bg-sky-200/14 shadow-glass" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.075]",
        market.isLocked && "cursor-not-allowed opacity-50 hover:bg-white/[0.045]"
      )}
      disabled={market.isLocked}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
            <Icon className="h-5 w-5 text-sky-100" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{displaySymbol(market.symbol)}</div>
            <div className="mt-1 truncate text-xs text-white/52">{market.displayName}</div>
          </div>
        </div>
        {market.isLocked ? <Lock className="h-4 w-4 text-white/58" /> : <ChevronRight className="h-4 w-4 text-white/42" />}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-white/76">{formatNumber(market.latestValue)}</span>
        <span className={cn("font-semibold", (market.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>
          {market.changePercent === null ? "--" : `${market.changePercent >= 0 ? "+" : ""}${formatNumber(market.changePercent)}%`}
        </span>
      </div>
    </button>
  );
}

function RelatedWidget({ widget }: { widget: WidgetResultApi }) {
  return (
    <GlassCard className="min-h-[156px] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{widget.widgetId.replaceAll("_", " ")}</div>
          <div className={cn("mt-1 text-xs font-semibold capitalize", directionTone(widget.direction))}>
            {widget.direction.replaceAll("_", " ")}
          </div>
        </div>
        <div className="text-2xl font-semibold text-white">{Math.round(widget.score)}</div>
      </div>
      <p className="line-clamp-3 text-xs leading-5 text-white/62">{widget.summary}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-white/48">
        <span>{Math.round(widget.confidence * 100)}% confidence</span>
        <span>{formatTime(widget.updatedAt)}</span>
      </div>
    </GlassCard>
  );
}

export function MarketsFoundation() {
  const [marketsData, setMarketsData] = useState<MarketsApi | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [overview, setOverview] = useState<MarketOverviewApi | null>(null);
  const [cryptoWidgets, setCryptoWidgets] = useState<WidgetResultApi[]>([]);
  const [crossMarket, setCrossMarket] = useState<CrossMarketWidgetsApi | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarkets() {
      setStatus("loading");
      setError(null);

      try {
        const data = await fetchApi<MarketsApi>("/api/markets", controller.signal);
        const firstUnlocked = data.markets.find((market) => !market.isLocked);

        setMarketsData(data);
        setSelectedSymbol((current) => {
          const currentMarket = data.markets.find((market) => market.symbol === current);

          return currentMarket && !currentMarket.isLocked ? current : firstUnlocked?.symbol ?? "BTCUSDT";
        });
        setStatus("ready");
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setStatus("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load markets");
        }
      }
    }

    void loadMarkets();

    return () => controller.abort();
  }, []);

  const selectedMarket = marketsData?.markets.find((market) => market.symbol === selectedSymbol) ?? null;
  const groupedMarkets = useMemo(() => {
    const groups = new Map<string, MarketSummaryApi[]>();

    for (const market of marketsData?.markets ?? []) {
      groups.set(market.group, [...(groups.get(market.group) ?? []), market]);
    }

    return [...groups.entries()];
  }, [marketsData]);

  useEffect(() => {
    if (!selectedMarket || selectedMarket.isLocked) {
      setOverview(null);
      setCryptoWidgets([]);
      return;
    }

    const controller = new AbortController();
    const market = selectedMarket;

    async function loadMarketDetail() {
      try {
        const marketOverview = await fetchApi<MarketOverviewApi>(
          `/api/markets/overview?symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(market.timeframe)}&limit=160`,
          controller.signal
        );

        setOverview(marketOverview);

        if (market.assetType === "crypto") {
          const widgetData = await fetchApi<{ results: WidgetResultApi[] }>(
            `/api/widgets/latest?symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(market.timeframe)}`,
            controller.signal
          );

          setCryptoWidgets(widgetData.results);
        } else {
          setCryptoWidgets([]);
        }

        if (marketsData?.session.isAdmin) {
          const macroData = await fetchApi<CrossMarketWidgetsApi>("/api/widgets/cross-market?timeframe=1d", controller.signal);
          setCrossMarket(macroData);
        } else {
          setCrossMarket(null);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load market detail");
        }
      }
    }

    void loadMarketDetail();

    return () => controller.abort();
  }, [marketsData?.session.isAdmin, selectedMarket]);

  const relatedWidgets = useMemo(() => {
    if (!selectedMarket) {
      return [];
    }

    return [
      ...cryptoWidgets,
      ...relatedCrossMarketWidgets(selectedMarket.symbol, crossMarket?.results ?? [])
    ];
  }, [cryptoWidgets, crossMarket, selectedMarket]);

  const metrics = overview?.metrics;

  return (
    <AppShell activeItem="markets">
      <section className="relative flex min-w-0 flex-1 gap-4 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Market Directory</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Markets</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Browse normalized local market series, source freshness, and related signal engines.
              </p>
            </div>
            {marketsData ? (
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={marketsData.session.isAdmin ? "green" : "amber"}>
                  {marketsData.session.isAdmin ? "Enterprise" : "Basic"}
                </StatusBadge>
                <StatusBadge tone="blue">{marketsData.count} markets</StatusBadge>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mb-4 flex gap-3 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-5 py-3 text-sm text-rose-100">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[390px_1fr]">
            <GlassPanel className="p-4">
              <SectionHeader eyebrow="Available series" title="Market List" />
              <div className="mt-5 space-y-5">
                {status === "loading" ? (
                  Array.from({ length: 7 }).map((_, index) => (
                    <div className="h-[96px] animate-pulse rounded-[22px] bg-white/8" key={index} />
                  ))
                ) : (
                  groupedMarkets.map(([group, markets]) => (
                    <section key={group}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">{group}</div>
                      <div className="space-y-2">
                        {markets.map((market) => (
                          <MarketListItem
                            key={market.symbol}
                            market={market}
                            onSelect={() => setSelectedSymbol(market.symbol)}
                            selected={market.symbol === selectedSymbol}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </GlassPanel>

            <div className="min-w-0">
              {!selectedMarket ? (
                <EmptyState description="Select a market from the list to inspect local data and related widgets." title="No market selected" />
              ) : selectedMarket.isLocked ? (
                <EmptyState description="Sign in from Settings to unlock this market and its related intelligence." title={`${displaySymbol(selectedMarket.symbol)} is locked`} />
              ) : (
                <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }}>
                  <GlassPanel className="mb-4 p-5">
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-3xl font-semibold text-white">{displaySymbol(selectedMarket.symbol)}</h2>
                          <StatusBadge tone={selectedMarket.isStale ? "amber" : "green"}>
                            {selectedMarket.isStale ? "Delayed" : "Current"}
                          </StatusBadge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/62">{selectedMarket.displayName}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-right text-sm text-white/62">
                        <div className="font-semibold text-white">{selectedMarket.source.toUpperCase()}</div>
                        <div>{selectedMarket.providerSymbol}</div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricPill icon={<Activity className="h-8 w-8 rounded-full bg-black/60 p-1.5 text-cyan-200" />} label="Latest Value" value={formatNumber(metrics?.latestPrice)} />
                      <MetricPill detail={metrics?.changePercent === null || metrics?.changePercent === undefined ? undefined : `${metrics.changePercent >= 0 ? "+" : ""}${formatNumber(metrics.changePercent)}%`} label="Latest Change" value={metrics?.change === null || metrics?.change === undefined ? "--" : `${metrics.change >= 0 ? "+" : ""}${formatNumber(metrics.change)}`} />
                      <MetricPill icon={<BarChart3 className="h-8 w-8 rounded-full bg-black/60 p-1.5 text-sky-200" />} label="Candles" value={formatCompact(metrics?.candleCount)} />
                      <MetricPill label="Updated" value={formatTime(metrics?.updatedAt)} />
                    </div>

                    <MarketSparkline candles={overview?.candles ?? []} />

                    {selectedMarket.sourceNote ? (
                      <div className="mt-4 flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white/62">
                        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-sky-100" />
                        {selectedMarket.sourceNote}
                      </div>
                    ) : null}
                  </GlassPanel>

                  <div className="mb-4">
                    <SectionHeader eyebrow="Related intelligence" title="Related Widgets" />
                  </div>

                  {relatedWidgets.length === 0 ? (
                    <EmptyState description="No related widget results are available yet for this market. Run collection or enable more widgets in Settings." title="No related widgets" />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {relatedWidgets.map((widget) => (
                        <RelatedWidget key={`${widget.widgetId}-${widget.symbol ?? "macro"}`} widget={widget} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
