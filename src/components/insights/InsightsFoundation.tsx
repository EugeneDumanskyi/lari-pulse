"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Clock3, Layers, LoaderCircle } from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  InsightRange,
  InsightSection,
  InsightSectionCoverage,
  InsightsResponse,
  SymbolApi
} from "@/lib/api/types";
import {
  AppShell,
  EmptyState,
  GlassPanel,
  MetricPill,
  StatusBadge
} from "@/components/dashboard/primitives";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";

interface RequestError extends Error {
  status?: number;
}

async function fetchApi<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    const error: RequestError = new Error("message" in body ? body.message : `Request failed: ${url}`);
    error.status = response.status;
    throw error;
  }

  return body.data;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** The four values `validateOptionalRange` allows, and nothing else. */
const ranges: InsightRange[] = ["1d", "7d", "30d", "90d"];

const coverageTone: Record<InsightSectionCoverage, "green" | "amber" | "default"> = {
  reported: "green",
  insufficient: "amber",
  empty: "default",
  omitted: "default"
};

const selectClass =
  "h-10 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-medium text-white outline-none disabled:opacity-50";

function displaySymbol(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function SectionPanel({ section }: { section: InsightSection }) {
  return (
    <GlassPanel className="p-5" data-testid="insight-section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-semibold text-white">{section.title}</div>
        <StatusBadge tone={coverageTone[section.coverage]}>{section.coverage}</StatusBadge>
      </div>
      <div className="space-y-2">
        {section.lines.map((line) => (
          <p
            className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm leading-6 text-white/78"
            data-testid="insight-line"
            key={line.id}
          >
            {replaceIsoDatesWithLocalTime(line.text)}
          </p>
        ))}
      </div>
    </GlassPanel>
  );
}

export function InsightsFoundation() {
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [symbolOptions, setSymbolOptions] = useState<SymbolApi[]>([]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string>(collectionTimeframes[0]);
  const [range, setRange] = useState<InsightRange>("7d");
  const [result, setResult] = useState<InsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [parameterError, setParameterError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      try {
        const scope = await fetchApi<{ symbols: SymbolApi[]; session: AuthSessionApi }>(
          "/api/symbols",
          controller.signal
        );
        const accessible = scope.symbols.filter((item) => scope.session.accessibleSymbols.includes(item.symbol));

        setSession(scope.session);
        setSymbolOptions(accessible);
        setSymbol(accessible[0]?.symbol ?? null);
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setLoadError(error instanceof Error ? error.message : "Unable to load the insights scope");
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => controller.abort();
  }, []);

  const runQuery = useCallback(async (query: string) => {
    setIsLoading(true);
    setParameterError(null);
    setLoadError(null);

    try {
      // The previous sections stay on screen until a new payload replaces them.
      setResult(await fetchApi<InsightsResponse>(`/api/insights?${query}`));
    } catch (error) {
      const status = (error as RequestError).status;
      const message = error instanceof Error ? error.message : "Unable to read insights";

      if (status === 400) {
        setParameterError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (symbol === null) {
      return;
    }

    const query = new URLSearchParams({ symbol, timeframe, range }).toString();
    setLastQuery(query);
    void runQuery(query);
  }, [range, runQuery, symbol, timeframe]);

  const requested = result?.requestedWindow ?? null;
  const covered = result?.coveredWindow ?? null;

  return (
    <AppShell activeItem="insights">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Stored History</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Insights</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                What changed across the window you chose, read from the situation snapshots already stored for this pair
                and from your own alert events. Every line is a template filled from stored values.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isLoading ? (
                <StatusBadge tone="blue">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                </StatusBadge>
              ) : null}
              <StatusBadge tone="blue">{range} window</StatusBadge>
            </div>
          </motion.div>

          <GlassPanel className="mb-4 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="insights-symbol">
                  Symbol
                </label>
                <select
                  className={selectClass}
                  id="insights-symbol"
                  onChange={(event) => setSymbol(event.target.value)}
                  value={symbol ?? ""}
                >
                  {symbolOptions.map((option) => (
                    <option key={option.symbol} value={option.symbol}>
                      {displaySymbol(option.symbol)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="insights-timeframe">
                  Timeframe
                </label>
                <select
                  className={selectClass}
                  id="insights-timeframe"
                  onChange={(event) => setTimeframe(event.target.value)}
                  value={timeframe}
                >
                  {collectionTimeframes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="insights-range">
                  Range
                </label>
                <select
                  className={selectClass}
                  id="insights-range"
                  onChange={(event) => setRange(event.target.value as InsightRange)}
                  value={range}
                >
                  {ranges.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {parameterError ? (
              <div
                className="mt-3 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-100"
                data-testid="insights-parameter-error"
              >
                {replaceIsoDatesWithLocalTime(parameterError)}
              </div>
            ) : null}
          </GlassPanel>

          {loadError ? (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <span>{replaceIsoDatesWithLocalTime(loadError)}</span>
              {lastQuery ? (
                <button
                  className="h-9 shrink-0 rounded-xl border border-rose-200/30 bg-rose-300/12 px-4 text-sm font-semibold text-rose-50 transition hover:bg-rose-300/20"
                  onClick={() => void runQuery(lastQuery)}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {result ? (
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="insights-window-header">
              <MetricPill
                icon={<CalendarRange className="h-5 w-5 text-sky-100" />}
                label="Requested window"
                value={requested ? `${formatLocalDateTime(requested.from)} — ${formatLocalDateTime(requested.to)}` : "--"}
              />
              <MetricPill
                icon={<Clock3 className="h-5 w-5 text-cyan-100" />}
                label="Covered window"
                value={covered ? `${formatLocalDateTime(covered.from)} — ${formatLocalDateTime(covered.to)}` : "Nothing stored"}
              />
              <MetricPill
                icon={<Layers className="h-5 w-5 text-amber-100" />}
                label="Snapshots read"
                value={String(result.snapshotCount)}
                detail={result.truncated ? "truncated" : undefined}
              />
            </div>
          ) : null}

          {result && result.snapshotCount === 0 ? (
            <div className="mb-4">
              <EmptyState
                description="No situation snapshot was stored for this pair inside the window. Snapshots are written when the dashboard builds an overview, so a quiet window stays thin until a collection run and a dashboard visit fill it."
                title="Nothing stored in this window"
              />
            </div>
          ) : null}

          <div className="space-y-4">
            {(result?.sections ?? []).map((section) => (
              <SectionPanel key={section.id} section={section} />
            ))}
          </div>

          {result ? (
            <div className="mt-4 text-xs text-white/38">
              Read {formatLocalDateTime(result.generatedAt)} as {session?.role ?? "viewer"}. Stored snapshots only.
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
