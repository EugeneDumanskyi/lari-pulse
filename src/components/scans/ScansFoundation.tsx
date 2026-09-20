"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  ScanCondition,
  ScanConditionResult,
  ScanMatchMode,
  ScanOperator,
  ScanResultItem,
  ScanRunResponse,
  SituationBias,
  SituationChangeId,
  SituationConfidence,
  SituationDriverDirection,
  SituationRiskLevel,
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
import { widgetCatalog } from "@/lib/widgets/catalog";
import { cn } from "@/lib/utils/cn";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";

type ConditionType = ScanCondition["type"];

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

const conditionTypes: Array<{ type: ConditionType; label: string }> = [
  { type: "bias", label: "Bias" },
  { type: "risk_level", label: "Risk level" },
  { type: "confidence", label: "Confidence" },
  { type: "score", label: "Directional score" },
  { type: "risk_score", label: "Risk score" },
  { type: "main_driver", label: "Main driver" },
  { type: "driver_direction", label: "Driver direction" },
  { type: "watch_condition", label: "Watch condition" },
  { type: "conflicts", label: "Conflicting signals" },
  { type: "freshness", label: "Freshness" },
  { type: "changed", label: "Changed since previous" }
];

const biasValues: SituationBias[] = [
  "strong_bullish",
  "bullish",
  "neutral",
  "bearish",
  "strong_bearish",
  "mixed",
  "unknown"
];
const riskLevelValues: SituationRiskLevel[] = ["low", "moderate", "elevated", "high", "extreme", "unknown"];
const confidenceValues: SituationConfidence[] = ["low", "medium", "high"];
const driverDirectionValues: SituationDriverDirection[] = [
  "bullish",
  "bearish",
  "neutral",
  "mixed",
  "risk_on",
  "risk_off",
  "unknown"
];
const changeIdValues: SituationChangeId[] = [
  "bias-change",
  "risk-change",
  "score-change",
  "confidence-change",
  "driver-change"
];

interface BuilderRow {
  key: number;
  type: ConditionType;
  values: string[];
  operator: ScanOperator;
  value: number;
  widgetId: string;
  position: "top" | "any";
  watchState: "present" | "absent";
  minimumSeverity: "" | "info" | "warning" | "critical";
  conflictsMode: "state" | "count";
  conflictsState: "none" | "any";
  freshnessState: "fresh" | "any";
}

let rowKey = 0;

function newRow(type: ConditionType = "bias"): BuilderRow {
  rowKey += 1;

  return {
    key: rowKey,
    type,
    values: defaultValuesFor(type),
    operator: "above",
    value: type === "risk_score" ? 50 : 40,
    widgetId: widgetCatalog[0]?.widgetId ?? "trend_strength",
    position: "any",
    watchState: "present",
    minimumSeverity: "",
    conflictsMode: "state",
    conflictsState: "none",
    freshnessState: "fresh"
  };
}

function defaultValuesFor(type: ConditionType): string[] {
  switch (type) {
    case "bias":
      return ["bullish"];
    case "risk_level":
      return ["low"];
    case "confidence":
      return ["high"];
    case "driver_direction":
      return ["bullish"];
    case "changed":
      return ["bias-change"];
    default:
      return [];
  }
}

function optionsFor(type: ConditionType): string[] {
  switch (type) {
    case "bias":
      return biasValues;
    case "risk_level":
      return riskLevelValues;
    case "confidence":
      return confidenceValues;
    case "driver_direction":
      return driverDirectionValues;
    case "changed":
      return changeIdValues;
    default:
      return [];
  }
}

function readable(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function displaySymbol(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function rowIsValid(row: BuilderRow) {
  if (row.type === "score" || row.type === "risk_score" || row.type === "conflicts") {
    if (row.type !== "conflicts" || row.conflictsMode === "count") {
      return Number.isFinite(row.value);
    }
  }

  if (optionsFor(row.type).length > 0) {
    return row.values.length > 0;
  }

  return true;
}

function toCondition(row: BuilderRow): ScanCondition {
  switch (row.type) {
    case "bias":
      return { type: "bias", in: row.values as SituationBias[] };
    case "risk_level":
      return { type: "risk_level", in: row.values as SituationRiskLevel[] };
    case "confidence":
      return { type: "confidence", in: row.values as SituationConfidence[] };
    case "score":
      return { type: "score", operator: row.operator, value: row.value };
    case "risk_score":
      return { type: "risk_score", operator: row.operator, value: row.value };
    case "main_driver":
      return { type: "main_driver", widgetIds: [row.widgetId], position: row.position };
    case "driver_direction":
      return {
        type: "driver_direction",
        widgetId: row.widgetId,
        in: row.values as SituationDriverDirection[]
      };
    case "watch_condition":
      return {
        type: "watch_condition",
        state: row.watchState,
        ...(row.minimumSeverity ? { minimumSeverity: row.minimumSeverity } : {})
      };
    case "conflicts":
      return row.conflictsMode === "state"
        ? { type: "conflicts", state: row.conflictsState }
        : { type: "conflicts", operator: row.operator, value: row.value };
    case "freshness":
      return { type: "freshness", state: row.freshnessState };
    case "changed":
      return { type: "changed", ids: row.values as SituationChangeId[] };
  }
}

const selectClass =
  "h-10 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-medium text-white outline-none disabled:opacity-50";

function ChipGroup({
  disabled,
  label,
  onToggle,
  options,
  selected
}: {
  disabled: boolean;
  label: string;
  onToggle: (value: string) => void;
  options: string[];
  selected: string[];
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-white/54">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={selected.includes(option)}
            className={cn(
              "h-9 rounded-2xl border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold capitalize text-white/72 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50",
              selected.includes(option) && "border-sky-200/34 bg-sky-200/16 text-sky-50"
            )}
            disabled={disabled}
            key={option}
            onClick={() => onToggle(option)}
            type="button"
          >
            {readable(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  index,
  row,
  disabled,
  onChange,
  onRemove
}: {
  index: number;
  row: BuilderRow;
  disabled: boolean;
  onChange: (next: BuilderRow) => void;
  onRemove: () => void;
}) {
  const options = optionsFor(row.type);

  function toggleValue(value: string) {
    onChange({
      ...row,
      values: row.values.includes(value)
        ? row.values.filter((entry) => entry !== value)
        : [...row.values, value]
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor={`scan-condition-type-${index}`}>
            Condition {index + 1}
          </label>
          <select
            className={selectClass}
            disabled={disabled}
            id={`scan-condition-type-${index}`}
            onChange={(event) => {
              const type = event.target.value as ConditionType;
              onChange({ ...newRow(type), key: row.key });
            }}
            value={row.type}
          >
            {conditionTypes.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <button
          aria-label={`Remove condition ${index + 1}`}
          className="mt-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200/16 bg-rose-300/[0.06] text-rose-100 transition hover:bg-rose-300/14 disabled:cursor-not-allowed disabled:opacity-42"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {options.length > 0 && row.type !== "driver_direction" ? (
        <ChipGroup disabled={disabled} label="Values" onToggle={toggleValue} options={options} selected={row.values} />
      ) : null}

      {row.type === "score" || row.type === "risk_score" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">Operator</span>
            <select
              className={selectClass}
              disabled={disabled}
              onChange={(event) => onChange({ ...row, operator: event.target.value as ScanOperator })}
              value={row.operator}
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">
              {row.type === "score" ? "Value (-100 to 100)" : "Value (0 to 100)"}
            </span>
            <input
              className={selectClass}
              disabled={disabled}
              id={`scan-condition-value-${index}`}
              max={100}
              min={row.type === "score" ? -100 : 0}
              onChange={(event) => onChange({ ...row, value: Number(event.target.value) })}
              step={1}
              type="number"
              value={row.value}
            />
          </label>
        </div>
      ) : null}

      {row.type === "main_driver" || row.type === "driver_direction" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">Widget</span>
            <select
              className={selectClass}
              disabled={disabled}
              id={`scan-condition-widget-${index}`}
              onChange={(event) => onChange({ ...row, widgetId: event.target.value })}
              value={row.widgetId}
            >
              {widgetCatalog.map((widget) => (
                <option key={widget.widgetId} value={widget.widgetId}>
                  {widget.title}
                </option>
              ))}
            </select>
          </label>
          {row.type === "main_driver" ? (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-white/54">Position</span>
              <select
                className={selectClass}
                disabled={disabled}
                onChange={(event) => onChange({ ...row, position: event.target.value as "top" | "any" })}
                value={row.position}
              >
                <option value="any">any main driver</option>
                <option value="top">top main driver</option>
              </select>
            </label>
          ) : (
            <ChipGroup
              disabled={disabled}
              label="Directions"
              onToggle={toggleValue}
              options={options}
              selected={row.values}
            />
          )}
        </div>
      ) : null}

      {row.type === "watch_condition" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">State</span>
            <select
              className={selectClass}
              disabled={disabled}
              onChange={(event) => onChange({ ...row, watchState: event.target.value as "present" | "absent" })}
              value={row.watchState}
            >
              <option value="present">present</option>
              <option value="absent">absent</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">Minimum severity</span>
            <select
              className={selectClass}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...row, minimumSeverity: event.target.value as BuilderRow["minimumSeverity"] })
              }
              value={row.minimumSeverity}
            >
              <option value="">any severity</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </label>
        </div>
      ) : null}

      {row.type === "conflicts" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-white/54">Compare</span>
            <select
              className={selectClass}
              disabled={disabled}
              onChange={(event) => onChange({ ...row, conflictsMode: event.target.value as "state" | "count" })}
              value={row.conflictsMode}
            >
              <option value="state">by state</option>
              <option value="count">by count</option>
            </select>
          </label>
          {row.conflictsMode === "state" ? (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-white/54">State</span>
              <select
                className={selectClass}
                disabled={disabled}
                onChange={(event) => onChange({ ...row, conflictsState: event.target.value as "none" | "any" })}
                value={row.conflictsState}
              >
                <option value="none">none</option>
                <option value="any">any</option>
              </select>
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/54">Operator</span>
                <select
                  className={selectClass}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...row, operator: event.target.value as ScanOperator })}
                  value={row.operator}
                >
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/54">Count</span>
                <input
                  className={selectClass}
                  disabled={disabled}
                  min={0}
                  onChange={(event) => onChange({ ...row, value: Number(event.target.value) })}
                  step={1}
                  type="number"
                  value={row.value}
                />
              </label>
            </div>
          )}
        </div>
      ) : null}

      {row.type === "freshness" ? (
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-white/54">State</span>
          <select
            className={selectClass}
            disabled={disabled}
            onChange={(event) => onChange({ ...row, freshnessState: event.target.value as "fresh" | "any" })}
            value={row.freshnessState}
          >
            <option value="fresh">fresh</option>
            <option value="any">any</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function ConditionList({ results, tone }: { results: ScanConditionResult[]; tone: "matched" | "unmatched" }) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/44">
        {tone === "matched" ? "Matched" : "Not matched"}
      </div>
      {results.map((result) => (
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-xs leading-5",
            tone === "matched"
              ? "border-emerald-200/16 bg-emerald-200/[0.05] text-emerald-50/78"
              : "border-white/10 bg-white/[0.035] text-white/58"
          )}
          key={result.id}
        >
          <span className="font-semibold text-white/82">{result.label}</span>
          <span className="text-white/54"> — found {result.actual}</span>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ item }: { item: ScanResultItem }) {
  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-white">{displaySymbol(item.symbol)}</div>
        <StatusBadge tone="blue">{item.timeframe}</StatusBadge>
        <StatusBadge tone={item.bias.includes("bullish") ? "green" : item.bias.includes("bearish") ? "red" : "amber"}>
          {readable(item.bias)}
        </StatusBadge>
        <StatusBadge tone="default">Risk {readable(item.riskLevel)}</StatusBadge>
        <StatusBadge tone="default">{item.confidence} confidence</StatusBadge>
        <span className="text-xs text-white/44">{formatLocalDateTime(item.updatedAt)}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{item.title}</div>
      <p className="mt-1 text-sm leading-6 text-white/64">{item.summary}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/48">
        <span>score {item.score}</span>
        <span>risk score {item.riskScore}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ConditionList results={item.matchedConditions} tone="matched" />
        <ConditionList results={item.unmatchedConditions} tone="unmatched" />
      </div>
    </GlassCard>
  );
}

export function ScansFoundation() {
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [symbolOptions, setSymbolOptions] = useState<SymbolApi[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([...collectionTimeframes]);
  const [rows, setRows] = useState<BuilderRow[]>([]);
  const [match, setMatch] = useState<ScanMatchMode>("all");
  const [result, setResult] = useState<ScanRunResponse | null>(null);
  const [isScopeLoading, setIsScopeLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
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
        const accessible = scope.symbols.filter((symbol) => scope.session.accessibleSymbols.includes(symbol.symbol));

        setSession(scope.session);
        setSymbolOptions(accessible);
        setSelectedSymbols(accessible.map((symbol) => symbol.symbol));
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setLoadError(error instanceof Error ? error.message : "Unable to load the scan scope");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsScopeLoading(false);
        }
      }
    }

    void run();

    return () => controller.abort();
  }, []);

  const runQuery = useCallback(async (query: string) => {
    setIsRunning(true);
    setFilterError(null);
    setLoadError(null);

    try {
      // The previous results stay on screen until a new payload replaces them.
      setResult(await fetchApi<ScanRunResponse>(`/api/scans/run?${query}`));
    } catch (error) {
      const status = (error as RequestError).status;
      const message = error instanceof Error ? error.message : "Unable to run the scan";

      if (status === 400) {
        setFilterError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      setIsRunning(false);
    }
  }, []);

  const validRows = useMemo(() => rows.filter(rowIsValid), [rows]);
  const canRun = validRows.length > 0 && !isRunning;

  async function runScanRequest() {
    const filter = {
      match,
      conditions: validRows.map(toCondition)
    };
    const query = new URLSearchParams({
      filter: JSON.stringify(filter),
      limit: "50"
    });

    if (selectedSymbols.length > 0) {
      query.set("symbols", selectedSymbols.join(","));
    }

    if (selectedTimeframes.length > 0) {
      query.set("timeframes", selectedTimeframes.join(","));
    }

    const encoded = query.toString();
    setLastQuery(encoded);
    await runQuery(encoded);
  }

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) =>
      current.includes(symbol) ? current.filter((entry) => entry !== symbol) : [...current, symbol]
    );
  }

  function toggleTimeframe(timeframe: string) {
    setSelectedTimeframes((current) =>
      current.includes(timeframe) ? current.filter((entry) => entry !== timeframe) : [...current, timeframe]
    );
  }

  const summary = result?.summary ?? null;
  const loosestFirst = useMemo(() => {
    return [...(summary?.conditionSummary ?? [])].sort((left, right) => left.matchedPairCount - right.matchedPairCount);
  }, [summary]);

  const addButton = (
    <button
      className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200/30 bg-sky-300/18 px-5 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/26 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={isRunning}
      onClick={() => setRows((current) => [...current, newRow()])}
      type="button"
    >
      <Plus className="h-4 w-4" />
      Add condition
    </button>
  );

  return (
    <AppShell activeItem="scans">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Stated Conditions</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Scans</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Name the conditions, and the scan returns the symbol and timeframe pairs whose stored Situation Overview
                state matches them, with the conditions each pair met.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="blue">{selectedSymbols.length} markets</StatusBadge>
              <StatusBadge tone="blue">{selectedTimeframes.length} frames</StatusBadge>
            </div>
          </motion.div>

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

          {summary ? (
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricPill
                icon={<Search className="h-5 w-5 text-sky-100" />}
                label="Matched pairs"
                value={String(summary.matchedPairs)}
              />
              <MetricPill
                icon={<Filter className="h-5 w-5 text-cyan-100" />}
                label="Examined pairs"
                value={String(summary.examinedPairs)}
                detail={`${summary.requestedPairs} requested`}
              />
              <MetricPill
                icon={<Database className="h-5 w-5 text-amber-100" />}
                label="Without state"
                value={String(summary.pairsWithoutState.length)}
              />
              <MetricPill
                icon={<SlidersHorizontal className="h-5 w-5 text-white/72" />}
                label="Match mode"
                value={summary.match === "all" ? "All conditions" : "Any condition"}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_1fr]">
            <GlassPanel className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10">
                  <SlidersHorizontal className="h-5 w-5 text-sky-100" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Filter</div>
                  <div className="mt-1 text-lg font-semibold text-white">Scan conditions</div>
                </div>
              </div>

              <div className="space-y-5">
                <section>
                  <div className="mb-2 text-xs font-semibold text-white/54">Symbols</div>
                  {isScopeLoading ? (
                    <div className="h-10 w-full animate-pulse rounded-2xl bg-white/[0.06]" />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {symbolOptions.map((symbol) => (
                        <button
                          aria-pressed={selectedSymbols.includes(symbol.symbol)}
                          className={cn(
                            "h-10 rounded-2xl border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-white/72 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50",
                            selectedSymbols.includes(symbol.symbol) && "border-sky-200/34 bg-sky-200/16 text-sky-50"
                          )}
                          disabled={isRunning}
                          key={symbol.symbol}
                          onClick={() => toggleSymbol(symbol.symbol)}
                          type="button"
                        >
                          {symbol.symbol}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-2 text-xs font-semibold text-white/54">Timeframes</div>
                  <div className="grid grid-cols-4 gap-2">
                    {collectionTimeframes.map((timeframe) => (
                      <button
                        aria-pressed={selectedTimeframes.includes(timeframe)}
                        className={cn(
                          "h-10 rounded-2xl border border-white/12 bg-white/[0.06] text-xs font-semibold text-white/72 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50",
                          selectedTimeframes.includes(timeframe) && "border-sky-200/34 bg-sky-200/16 text-sky-50"
                        )}
                        disabled={isRunning}
                        key={timeframe}
                        onClick={() => toggleTimeframe(timeframe)}
                        type="button"
                      >
                        {timeframe}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="scan-match-mode">
                    Match
                  </label>
                  <select
                    className={selectClass}
                    disabled={isRunning}
                    id="scan-match-mode"
                    onChange={(event) => setMatch(event.target.value as ScanMatchMode)}
                    value={match}
                  >
                    <option value="all">all conditions</option>
                    <option value="any">any condition</option>
                  </select>
                </section>

                <div className="space-y-3">
                  {rows.map((row, index) => (
                    <ConditionRow
                      disabled={isRunning}
                      index={index}
                      key={row.key}
                      onChange={(next) =>
                        setRows((current) => current.map((entry) => (entry.key === row.key ? next : entry)))
                      }
                      onRemove={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                      row={row}
                    />
                  ))}
                </div>

                {rows.length > 0 || result !== null ? addButton : null}

                {filterError ? (
                  <div
                    className="rounded-2xl border border-rose-300/35 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-100"
                    data-testid="scan-filter-error"
                  >
                    {replaceIsoDatesWithLocalTime(filterError)}
                  </div>
                ) : null}

                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!canRun}
                  onClick={() => void runScanRequest()}
                  type="button"
                >
                  {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Run scan
                </button>
              </div>
            </GlassPanel>

            <div className="min-w-0 space-y-4">
              {result === null ? (
                <div className="space-y-4">
                  <EmptyState
                    description="A scan runs the conditions you name over the configured symbol and timeframe pairs and returns the ones whose stored state matches. Add a condition to start; nothing has run yet."
                    title="No scan has run yet"
                  />
                  {rows.length === 0 ? <div>{addButton}</div> : null}
                </div>
              ) : result.items.length > 0 ? (
                <div className="space-y-3">
                  {result.items.map((item) => (
                    <ResultCard item={item} key={`${item.symbol}-${item.timeframe}`} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <EmptyState
                    description="No examined pair satisfied the filter. The breakdown below counts how many examined pairs each condition matched on its own; the one at the top is the one to loosen."
                    title="No pairs matched"
                  />
                  <GlassPanel className="p-5" data-testid="scan-condition-summary">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/44">
                      Condition breakdown
                    </div>
                    <div className="space-y-2">
                      {loosestFirst.map((entry) => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs"
                          data-testid="scan-condition-summary-row"
                          key={entry.id}
                        >
                          <span className="font-semibold text-white/78">{entry.label}</span>
                          <span className="text-white/54">
                            {entry.matchedPairCount} of {summary?.examinedPairs ?? 0} examined pairs
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>
              )}

              {summary && summary.pairsWithoutState.length > 0 ? (
                <GlassPanel className="p-5" data-testid="scan-pairs-without-state">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/44">
                    <AlertTriangle className="h-4 w-4" />
                    Pairs without stored state
                  </div>
                  <p className="text-xs leading-5 text-white/48">
                    These pairs have no stored widget results to read, so they were not examined. They need a collection
                    run before a scan can say anything about them.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summary.pairsWithoutState.map((pair) => (
                      <span
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/56"
                        key={`${pair.symbol}-${pair.timeframe}`}
                      >
                        {displaySymbol(pair.symbol)} {pair.timeframe}
                      </span>
                    ))}
                  </div>
                </GlassPanel>
              ) : null}

              {summary ? (
                <div className="text-xs text-white/38">
                  Scanned {formatLocalDateTime(summary.generatedAt)} as {session?.role ?? "viewer"}. Stored state only.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
