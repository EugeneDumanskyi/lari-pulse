"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Layers, LoaderCircle } from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  GeneratedReport,
  InsightRange,
  ReportFormat,
  ReportSectionId,
  ReportSectionStatus,
  SymbolApi
} from "@/lib/api/types";
import {
  AppShell,
  EmptyState,
  GlassCard,
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
const formats: ReportFormat[] = ["markdown", "json", "csv"];
const sectionIds: ReportSectionId[] = ["situation", "widgets", "insights", "radar", "portfolio", "alerts"];

const sectionLabels: Record<ReportSectionId, string> = {
  situation: "Situation",
  widgets: "Widgets",
  insights: "Insights",
  radar: "Radar",
  portfolio: "Portfolio",
  alerts: "Alerts"
};

const statusTone: Record<ReportSectionStatus, "green" | "amber" | "default"> = {
  included: "green",
  empty: "amber",
  omitted: "default"
};

const selectClass =
  "h-10 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-medium text-white outline-none disabled:opacity-50";

const actionClass =
  "h-10 shrink-0 rounded-2xl border border-white/14 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:opacity-50";

function displaySymbol(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ToggleButton({
  children,
  disabled,
  onClick,
  selected,
  testId
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
  selected: boolean;
  testId: string;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`h-9 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50 ${
        selected
          ? "border-sky-200/40 bg-sky-300/16 text-white"
          : "border-white/12 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]"
      }`}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ReportsFoundation() {
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [symbolOptions, setSymbolOptions] = useState<SymbolApi[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>(["1h"]);
  const [range, setRange] = useState<InsightRange>("7d");
  const [format, setFormat] = useState<ReportFormat>("markdown");
  const [sections, setSections] = useState<ReportSectionId[]>([...sectionIds]);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
        setSymbols(accessible.map((item) => item.symbol));
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setLoadError(error instanceof Error ? error.message : "Unable to load the report scope");
        }
      }
    }

    void run();

    return () => controller.abort();
  }, []);

  // The 24-pair cap is visible before the request, not only in its error.
  const pairCount = symbols.length * timeframes.length;

  const query = useMemo(() => {
    const params = new URLSearchParams({ range, format });

    if (symbols.length > 0) {
      params.set("symbols", symbols.join(","));
    }

    if (timeframes.length > 0) {
      params.set("timeframes", timeframes.join(","));
    }

    // Sent only when the selection is not all six, so the default request and
    // the explicit one stay the same request.
    if (sections.length !== sectionIds.length) {
      params.set("sections", sections.join(","));
    }

    return params.toString();
  }, [format, range, sections, symbols, timeframes]);

  const runQuery = useCallback(async (requested: string) => {
    setIsGenerating(true);
    setParameterError(null);
    setLoadError(null);

    try {
      // The previous report stays on screen until a new payload replaces it.
      setReport(await fetchApi<GeneratedReport>(`/api/reports?${requested}`));
    } catch (error) {
      const status = (error as RequestError).status;
      const message = error instanceof Error ? error.message : "Unable to generate report";

      if (status === 400) {
        setParameterError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generate = useCallback(() => {
    setLastQuery(query);
    void runQuery(query);
  }, [query, runQuery]);

  const controlsDisabled = isGenerating;

  return (
    <AppShell activeItem="reports">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">One Document</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Reports</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                One document composed from the state this app already computed over the scope and window you choose,
                in markdown, JSON or CSV. Nothing here is recalculated: every line is a value some existing view
                already returned, placed under a label.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isGenerating ? (
                <StatusBadge tone="blue">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                </StatusBadge>
              ) : null}
              <StatusBadge tone="blue">{range} window</StatusBadge>
            </div>
          </motion.div>

          <GlassPanel className="mb-4 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-white/54">Symbols</div>
                <div className="flex flex-wrap gap-2" data-testid="reports-symbols">
                  {symbolOptions.map((option) => (
                    <ToggleButton
                      disabled={controlsDisabled}
                      key={option.symbol}
                      onClick={() => setSymbols((current) => toggle(current, option.symbol))}
                      selected={symbols.includes(option.symbol)}
                      testId={`reports-symbol-${option.symbol}`}
                    >
                      {displaySymbol(option.symbol)}
                    </ToggleButton>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-white/54">Timeframes</div>
                <div className="flex flex-wrap gap-2" data-testid="reports-timeframes">
                  {collectionTimeframes.map((option) => (
                    <ToggleButton
                      disabled={controlsDisabled}
                      key={option}
                      onClick={() => setTimeframes((current) => toggle(current, option))}
                      selected={timeframes.includes(option)}
                      testId={`reports-timeframe-${option}`}
                    >
                      {option}
                    </ToggleButton>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="reports-range">
                  Range
                </label>
                <select
                  className={selectClass}
                  disabled={controlsDisabled}
                  id="reports-range"
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
              <div>
                <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="reports-format">
                  Format
                </label>
                <select
                  className={selectClass}
                  disabled={controlsDisabled}
                  id="reports-format"
                  onChange={(event) => setFormat(event.target.value as ReportFormat)}
                  value={format}
                >
                  {formats.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-white/54">Sections</div>
              <div className="flex flex-wrap gap-2" data-testid="reports-sections">
                {sectionIds.map((id) => (
                  <ToggleButton
                    disabled={controlsDisabled}
                    key={id}
                    onClick={() => setSections((current) => toggle(current, id) as ReportSectionId[])}
                    selected={sections.includes(id)}
                    testId={`reports-section-${id}`}
                  >
                    {sectionLabels[id]}
                  </ToggleButton>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-white/62" data-testid="reports-scope">
                {symbols.length} {symbols.length === 1 ? "symbol" : "symbols"} × {timeframes.length}{" "}
                {timeframes.length === 1 ? "timeframe" : "timeframes"} = {pairCount}{" "}
                {pairCount === 1 ? "pair" : "pairs"}, maximum 24
              </div>
              <div className="flex gap-2">
                <button
                  className={actionClass}
                  data-testid="reports-generate"
                  disabled={controlsDisabled}
                  onClick={generate}
                  type="button"
                >
                  Generate
                </button>
                <a
                  aria-disabled={report === null || controlsDisabled}
                  className={`${actionClass} inline-flex items-center gap-2 leading-10 ${
                    report === null || controlsDisabled ? "pointer-events-none opacity-50" : ""
                  }`}
                  data-testid="reports-download"
                  href={`/api/reports/download?${lastQuery ?? query}`}
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>

            {parameterError ? (
              <div
                className="mt-3 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-100"
                data-testid="reports-parameter-error"
              >
                {parameterError}
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

          {report ? (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricPill
                  icon={<FileText className="h-5 w-5 text-sky-100" />}
                  label="File"
                  value={report.filename}
                  detail={report.format}
                />
                <MetricPill
                  icon={<Layers className="h-5 w-5 text-cyan-100" />}
                  label="Sections"
                  value={String(report.document.sections.length)}
                  detail={`${report.document.scope.pairs.length} pairs`}
                />
                <MetricPill
                  icon={<Download className="h-5 w-5 text-amber-100" />}
                  label="Generated"
                  value={formatLocalDateTime(report.document.generatedAt)}
                />
              </div>

              <div className="mb-4 flex flex-wrap gap-2" data-testid="reports-section-badges">
                {report.document.sections.map((entry) => (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
                    data-testid={`reports-badge-${entry.id}`}
                    key={entry.id}
                  >
                    <span className="text-sm font-semibold text-white">{entry.title}</span>
                    <StatusBadge tone={statusTone[entry.status]}>{entry.status}</StatusBadge>
                  </div>
                ))}
              </div>

              {/*
                The preview is the file. Its timestamps stay exactly as the body
                holds them, so this is the one place the app does not run
                `replaceIsoDatesWithLocalTime` over what it shows.
              */}
              <GlassCard className="p-0">
                <pre
                  className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-white/78"
                  data-testid="reports-preview"
                >
                  {report.body}
                </pre>
              </GlassCard>

              <div className="mt-4 text-xs text-white/38">
                Composed as {session?.role ?? "viewer"}. Already computed state only, in {report.contentType}.
              </div>
            </>
          ) : (
            <EmptyState
              description={`A report composes the situation, the latest widget results, what the window changed, the radar ranking and — for its owner — a portfolio and alert summary into one file. The current scope is ${pairCount} ${
                pairCount === 1 ? "pair" : "pairs"
              }. Choose a scope and a format, then generate one.`}
              title="Nothing generated yet"
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
