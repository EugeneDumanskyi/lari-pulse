"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  LoaderCircle,
  Radar,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Zap
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  OpportunityRadarItem,
  OpportunityRadarResponse,
  SituationBias,
  SituationConfidence,
  SituationRiskLevel
} from "@/lib/api/types";
import { AppShell, GlassPanel, StatusBadge } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils/cn";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const timeframes = ["15m", "1h", "4h", "1d"];
const biasFilters: Array<"all" | SituationBias> = ["all", "strong_bullish", "bullish", "neutral", "mixed", "bearish", "strong_bearish"];
const riskFilters: Array<"all" | SituationRiskLevel> = ["all", "low", "moderate", "elevated", "high", "extreme"];
const confidenceFilters: Array<"all" | SituationConfidence> = ["all", "high", "medium", "low"];

async function fetchApi<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readablePair(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function scoreTone(score: number) {
  if (score >= 72) {
    return "green";
  }

  if (score >= 48) {
    return "amber";
  }

  return "red";
}

function riskTone(risk: SituationRiskLevel) {
  if (risk === "low" || risk === "moderate") {
    return risk === "low" ? "green" : "blue";
  }

  if (risk === "elevated") {
    return "amber";
  }

  return "red";
}

function confidenceTone(confidence: SituationConfidence) {
  return confidence === "high" ? "green" : confidence === "medium" ? "amber" : "blue";
}

function biasTone(bias: SituationBias) {
  if (bias.includes("bullish")) {
    return "green";
  }

  if (bias.includes("bearish")) {
    return "red";
  }

  return "amber";
}

function filterLabel(value: string) {
  return value === "all" ? "All" : readable(value);
}

export function OpportunityRadarFoundation() {
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [radar, setRadar] = useState<OpportunityRadarResponse | null>(null);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["15m", "1h", "4h", "1d"]);
  const [biasFilter, setBiasFilter] = useState<"all" | SituationBias>("all");
  const [riskFilter, setRiskFilter] = useState<"all" | SituationRiskLevel>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | SituationConfidence>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accessibleSymbols = useMemo(() => {
    const allowed = new Set(session?.accessibleSymbols ?? ["BTCUSDT"]);
    return symbols.filter((symbol) => allowed.has(symbol));
  }, [session]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    const sessionData = await fetchApi<AuthSessionApi>("/api/auth/session", signal);
    const activeSymbols = selectedSymbols.filter((symbol) => sessionData.accessibleSymbols.includes(symbol));
    const query = new URLSearchParams({
      symbols: (activeSymbols.length > 0 ? activeSymbols : [sessionData.accessibleSymbols[0] ?? "BTCUSDT"]).join(","),
      timeframes: selectedTimeframes.join(","),
      limit: "50"
    });
    const radarData = await fetchApi<OpportunityRadarResponse>(`/api/radar/opportunities?${query.toString()}`, signal);

    setSession(sessionData);
    setRadar(radarData);
    setSelectedSymbols((current) => {
      const filtered = current.filter((symbol) => sessionData.accessibleSymbols.includes(symbol));
      return filtered.length > 0 ? filtered : [sessionData.accessibleSymbols[0] ?? "BTCUSDT"];
    });
  }, [selectedSymbols, selectedTimeframes]);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);

      try {
        await load(controller.signal);
      } catch (loadError) {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load opportunity radar");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => controller.abort();
  }, [load]);

  const filteredItems = useMemo(() => {
    return (radar?.items ?? []).filter((item) =>
      (biasFilter === "all" || item.bias === biasFilter) &&
      (riskFilter === "all" || item.riskLevel === riskFilter) &&
      (confidenceFilter === "all" || item.confidence === confidenceFilter)
    );
  }, [biasFilter, confidenceFilter, radar, riskFilter]);

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        const next = current.filter((item) => item !== symbol);
        return next.length > 0 ? next : current;
      }

      return [...current, symbol];
    });
  }

  function toggleTimeframe(timeframe: string) {
    setSelectedTimeframes((current) => {
      if (current.includes(timeframe)) {
        const next = current.filter((item) => item !== timeframe);
        return next.length > 0 ? next : current;
      }

      return [...current, timeframe];
    });
  }

  async function refresh() {
    setIsLoading(true);

    try {
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh opportunity radar");
    } finally {
      setIsLoading(false);
    }
  }

  const topItem = filteredItems[0];

  return (
    <AppShell activeItem="radar">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Opportunity Scan</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Radar</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Ranked market states from Situation Overview, scored by alignment, confidence, risk, freshness, and blockers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={session?.isAdmin ? "green" : "amber"}>{session?.isAdmin ? "Enterprise" : "Basic"}</StatusBadge>
              <StatusBadge tone="blue">{radar?.scannedSymbols.length ?? 0} markets</StatusBadge>
              <StatusBadge tone="blue">{radar?.scannedTimeframes.length ?? 0} frames</StatusBadge>
            </div>
          </motion.div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
              {replaceIsoDatesWithLocalTime(error)}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <GlassPanel className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10">
                  <SlidersHorizontal className="h-5 w-5 text-sky-100" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Filters</div>
                  <div className="mt-1 text-lg font-semibold text-white">Scan scope</div>
                </div>
              </div>

              <div className="space-y-5">
                <section>
                  <div className="mb-2 text-xs font-semibold text-white/54">Symbols</div>
                  <div className="grid grid-cols-3 gap-2">
                    {symbols.map((symbol) => {
                      const locked = !accessibleSymbols.includes(symbol);
                      return (
                        <button
                          className={cn(
                            "h-10 rounded-2xl border border-white/12 bg-white/[0.06] text-xs font-semibold text-white/72 transition hover:bg-white/12",
                            selectedSymbols.includes(symbol) && !locked && "border-sky-200/34 bg-sky-200/16 text-sky-50",
                            locked && "cursor-not-allowed opacity-38"
                          )}
                          disabled={locked}
                          key={symbol}
                          onClick={() => toggleSymbol(symbol)}
                          type="button"
                        >
                          {symbol.slice(0, -4)}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="mb-2 text-xs font-semibold text-white/54">Timeframes</div>
                  <div className="grid grid-cols-4 gap-2">
                    {timeframes.map((timeframe) => (
                      <button
                        className={cn(
                          "h-10 rounded-2xl border border-white/12 bg-white/[0.06] text-xs font-semibold text-white/72 transition hover:bg-white/12",
                          selectedTimeframes.includes(timeframe) && "border-sky-200/34 bg-sky-200/16 text-sky-50"
                        )}
                        key={timeframe}
                        onClick={() => toggleTimeframe(timeframe)}
                        type="button"
                      >
                        {timeframe}
                      </button>
                    ))}
                  </div>
                </section>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-white/54">Bias</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium capitalize text-slate-950 outline-none"
                    onChange={(event) => setBiasFilter(event.target.value as "all" | SituationBias)}
                    value={biasFilter}
                  >
                    {biasFilters.map((filter) => <option key={filter} value={filter}>{filterLabel(filter)}</option>)}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Risk</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium capitalize text-slate-950 outline-none"
                      onChange={(event) => setRiskFilter(event.target.value as "all" | SituationRiskLevel)}
                      value={riskFilter}
                    >
                      {riskFilters.map((filter) => <option key={filter} value={filter}>{filterLabel(filter)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Confidence</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium capitalize text-slate-950 outline-none"
                      onChange={(event) => setConfidenceFilter(event.target.value as "all" | SituationConfidence)}
                      value={confidenceFilter}
                    >
                      {confidenceFilters.map((filter) => <option key={filter} value={filter}>{filterLabel(filter)}</option>)}
                    </select>
                  </label>
                </div>

                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:opacity-55"
                  disabled={isLoading}
                  onClick={() => void refresh()}
                  type="button"
                >
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  Refresh Radar
                </button>
              </div>
            </GlassPanel>

            <div className="space-y-4">
              <GlassPanel className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Rankings</div>
                    <h2 className="mt-1 text-2xl font-semibold text-white">Current opportunities</h2>
                  </div>
                  {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-100" /> : <Radar className="h-5 w-5 text-white/48" />}
                </div>

                {topItem ? (
                  <div className="mb-4 rounded-2xl border border-sky-200/18 bg-sky-200/[0.08] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={scoreTone(topItem.setupScore)}>Top setup {topItem.setupScore}</StatusBadge>
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
                            {readablePair(topItem.symbol)} {topItem.timeframe}
                          </span>
                        </div>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">{topItem.primaryReason}</p>
                      </div>
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.06] text-2xl font-semibold text-white">
                        #{topItem.rank}
                      </div>
                    </div>
                  </div>
                ) : null}

                {filteredItems.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm leading-6 text-white/58">
                    No radar results match the selected filters.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map((item) => <RadarRow item={item} key={`${item.symbol}-${item.timeframe}`} />)}
                  </div>
                )}
              </GlassPanel>
            </div>
          </div>

          {radar ? (
            <div className="mt-4 text-xs text-white/38">
              Generated {formatLocalDateTime(radar.generatedAt)}
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function RadarRow({ item }: { item: OpportunityRadarItem }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/[0.045] p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[88px_1fr_220px] lg:items-start">
        <div className="flex items-center gap-3 lg:block">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/14 bg-slate-950/20 text-xl font-semibold text-white">
            #{item.rank}
          </div>
          <div className="lg:mt-3">
            <div className="text-xs text-white/42">Setup</div>
            <div className={cn(
              "text-2xl font-semibold",
              item.setupScore >= 72 ? "text-emerald-200" : item.setupScore >= 48 ? "text-amber-200" : "text-rose-200"
            )}>
              {item.setupScore}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={biasTone(item.bias)}>{readable(item.bias)}</StatusBadge>
            <StatusBadge tone={riskTone(item.riskLevel)}>{readable(item.riskLevel)} risk</StatusBadge>
            <StatusBadge tone={confidenceTone(item.confidence)}>{item.confidence} confidence</StatusBadge>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
              {readablePair(item.symbol)} {item.timeframe}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/70">{item.primaryReason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topDrivers.map((driver) => (
              <span className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white/56" key={driver.id}>
                {driver.label}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/8 bg-slate-950/18 px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-white/58">
              <Zap className="h-3.5 w-3.5" />
              Attention
            </div>
            <div className="text-lg font-semibold text-white">{item.attentionScore}</div>
          </div>
          {item.blockingRisks.length > 0 ? (
            <div className="rounded-2xl border border-amber-200/12 bg-amber-200/[0.055] px-3 py-2">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-100/72">
                <ShieldAlert className="h-3.5 w-3.5" />
                Blockers
              </div>
              <div className="space-y-1 text-xs leading-5 text-white/58">
                {item.blockingRisks.slice(0, 2).map((risk) => <div key={risk}>{risk}</div>)}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200/12 bg-emerald-200/[0.045] px-3 py-2 text-xs text-emerald-100/70">
              <ArrowDownWideNarrow className="mb-2 h-3.5 w-3.5" />
              No major blockers surfaced.
            </div>
          )}
        </div>
      </div>

      {item.watchConditions.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {item.watchConditions.slice(0, 2).map((condition) => (
            <div className="rounded-2xl border border-white/8 bg-slate-950/16 px-3 py-2" key={condition.id}>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-white/58">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-200" />
                {condition.label}
              </div>
              <p className="text-xs leading-5 text-white/50">{condition.implication}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
