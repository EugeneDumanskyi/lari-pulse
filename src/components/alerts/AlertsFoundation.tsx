"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  Eye,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  AlertEventApi,
  AlertRuleApi,
  AlertRuleInput,
  ApiEnvelope,
  AuthSessionApi
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";
import { AppShell, GlassPanel, StatusBadge } from "@/components/dashboard/primitives";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const timeframes = ["15m", "1h", "4h", "1d"];
const ruleTypes: Array<{ value: AlertRuleInput["ruleType"]; label: string }> = [
  { value: "situation_bias_changed", label: "Bias changed" },
  { value: "risk_level_changed", label: "Risk changed" },
  { value: "watch_condition_appeared", label: "Watch appeared" },
  { value: "widget_direction_changed", label: "Driver changed" },
  { value: "score_crossed_threshold", label: "Score crossed" }
];

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

function severityTone(severity: AlertEventApi["severity"] | AlertRuleApi["severity"]) {
  if (severity === "critical") {
    return "red";
  }

  if (severity === "warning") {
    return "amber";
  }

  return "blue";
}

function readablePair(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function ruleTypeLabel(value: AlertRuleInput["ruleType"]) {
  return ruleTypes.find((item) => item.value === value)?.label ?? value.replaceAll("_", " ");
}

export function AlertsFoundation() {
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [rules, setRules] = useState<AlertRuleApi[]>([]);
  const [events, setEvents] = useState<AlertEventApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<AlertRuleInput>({
    ruleType: "situation_bias_changed",
    symbol: "BTCUSDT",
    timeframe: "1h",
    severity: "info",
    isEnabled: true,
    thresholdValue: 60,
    thresholdDirection: "above"
  });

  const accessibleSymbols = useMemo(() => {
    const allowed = new Set(session?.accessibleSymbols ?? ["BTCUSDT"]);
    return symbols.filter((symbol) => allowed.has(symbol));
  }, [session]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [sessionData, rulesData, eventsData] = await Promise.all([
      fetchApi<AuthSessionApi>("/api/auth/session", signal),
      fetchApi<AlertRuleApi[]>("/api/alerts/rules", signal),
      fetchApi<AlertEventApi[]>("/api/alerts/events?includeAcknowledged=true&limit=100", signal)
    ]);

    setSession(sessionData);
    setRules(rulesData);
    setEvents(eventsData);

    setDraft((current) => sessionData.accessibleSymbols.includes(current.symbol)
      ? current
      : {
        ...current,
        symbol: sessionData.accessibleSymbols[0] ?? "BTCUSDT"
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        await load(controller.signal);
      } catch (loadError) {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load alerts");
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

  async function createRule() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      const body = (await response.json()) as ApiEnvelope<AlertRuleApi> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to create alert rule");
      }

      setRules((current) => [body.data, ...current]);
      setMessage("Alert rule created.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create alert rule");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRule(ruleId: number) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/alerts/rules/${ruleId}`, { method: "DELETE" });
      const body = (await response.json()) as ApiEnvelope<{ deleted: boolean }> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to delete alert rule");
      }

      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      setMessage("Alert rule removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete alert rule");
    } finally {
      setIsSaving(false);
    }
  }

  async function acknowledgeEvent(eventId: number) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/alerts/events/${eventId}/ack`, { method: "POST" });
      const body = (await response.json()) as ApiEnvelope<AlertEventApi> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to acknowledge alert event");
      }

      setEvents((current) => current.map((event) => event.id === eventId ? body.data : event));
    } catch (ackError) {
      setError(ackError instanceof Error ? ackError.message : "Unable to acknowledge alert event");
    } finally {
      setIsSaving(false);
    }
  }

  async function evaluateNow() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: draft.symbol, timeframe: draft.timeframe })
      });
      const body = (await response.json()) as ApiEnvelope<{ events: AlertEventApi[] }> | { status: "error"; message: string };

      if (!response.ok || body.status === "error") {
        throw new Error("message" in body ? body.message : "Unable to evaluate alerts");
      }

      await load();
      setMessage(`${body.data.events.length} open event${body.data.events.length === 1 ? "" : "s"} after evaluation.`);
    } catch (evaluateError) {
      setError(evaluateError instanceof Error ? evaluateError.message : "Unable to evaluate alerts");
    } finally {
      setIsSaving(false);
    }
  }

  const openEvents = events.filter((event) => !event.acknowledgedAt);
  const recentAcknowledged = events.filter((event) => event.acknowledgedAt).slice(0, 5);

  return (
    <AppShell activeItem="alerts">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">State Watch</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Alerts</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Local rules watch Situation Overview changes and explain why each event fired.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={openEvents.length > 0 ? "red" : "green"}>{openEvents.length} open</StatusBadge>
              <StatusBadge tone="blue">{rules.length} rules</StatusBadge>
            </div>
          </motion.div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
              {replaceIsoDatesWithLocalTime(error)}
            </div>
          ) : null}
          {message ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              <Check className="h-4 w-4" />
              {message}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
            <GlassPanel className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10">
                  <Bell className="h-5 w-5 text-sky-100" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">New Rule</div>
                  <div className="mt-1 text-lg font-semibold text-white">Watch condition</div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-white/54">Type</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 outline-none"
                    onChange={(event) => setDraft((current) => ({ ...current, ruleType: event.target.value as AlertRuleInput["ruleType"] }))}
                    value={draft.ruleType}
                  >
                    {ruleTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Symbol</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium text-slate-950 outline-none"
                      onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))}
                      value={draft.symbol}
                    >
                      {accessibleSymbols.map((symbol) => <option key={symbol} value={symbol}>{readablePair(symbol)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-white/54">Timeframe</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium text-slate-950 outline-none"
                      onChange={(event) => setDraft((current) => ({ ...current, timeframe: event.target.value }))}
                      value={draft.timeframe}
                    >
                      {timeframes.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                    </select>
                  </label>
                </div>
                {draft.ruleType === "score_crossed_threshold" ? (
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-white/54">Direction</span>
                      <select
                        className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium text-slate-950 outline-none"
                        onChange={(event) => setDraft((current) => ({ ...current, thresholdDirection: event.target.value as "above" | "below" }))}
                        value={draft.thresholdDirection ?? "above"}
                      >
                        <option value="above">Above</option>
                        <option value="below">Below</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-white/54">Score</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-3 text-sm font-medium text-slate-950 outline-none"
                        max={100}
                        min={-100}
                        onChange={(event) => setDraft((current) => ({ ...current, thresholdValue: Number(event.target.value) }))}
                        type="number"
                        value={draft.thresholdValue ?? 60}
                      />
                    </label>
                  </div>
                ) : null}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-white/54">Severity</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-white/18 bg-white/90 px-4 text-sm font-medium text-slate-950 outline-none"
                    onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value as AlertRuleInput["severity"] }))}
                    value={draft.severity}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200/24 bg-sky-200/16 text-sm font-semibold text-sky-50 transition hover:bg-sky-200/22 disabled:opacity-55"
                    disabled={isSaving}
                    onClick={() => void createRule()}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Create
                  </button>
                  <button
                    className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/16 bg-white/10 text-sm font-semibold text-white/84 transition hover:bg-white/16 disabled:opacity-55"
                    disabled={isSaving}
                    onClick={() => void evaluateNow()}
                    type="button"
                  >
                    <RefreshCw className={cn("h-4 w-4", isSaving && "animate-spin")} />
                    Evaluate
                  </button>
                </div>
              </div>
            </GlassPanel>

            <div className="space-y-4">
              <GlassPanel className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Events</div>
                    <h2 className="mt-1 text-2xl font-semibold text-white">Open alerts</h2>
                  </div>
                  {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-100" /> : null}
                </div>
                {openEvents.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm leading-6 text-white/58">
                    No open alert events. Create a rule and evaluate the selected symbol/timeframe, or open the dashboard to generate a fresh Situation Overview.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {openEvents.map((event) => (
                      <div className="rounded-2xl border border-white/12 bg-slate-950/18 p-4" key={event.id}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone={severityTone(event.severity)}>{event.severity}</StatusBadge>
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
                                {readablePair(event.symbol)} {event.timeframe}
                              </span>
                            </div>
                            <h3 className="mt-2 text-lg font-semibold text-white">{event.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-white/68">{event.message}</p>
                            <p className="mt-2 text-xs leading-5 text-white/48">{event.explanation}</p>
                          </div>
                          <button
                            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-emerald-200/24 bg-emerald-300/13 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/18 disabled:opacity-55"
                            disabled={isSaving}
                            onClick={() => void acknowledgeEvent(event.id)}
                            type="button"
                          >
                            <Check className="h-4 w-4" />
                            Ack
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/44">
                          <span>{formatLocalDateTime(event.createdAt)}</span>
                          {event.sourceWidget ? <span>Source: {event.sourceWidget.replaceAll("_", " ")}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassPanel>

              <GlassPanel className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Rules</div>
                    <h2 className="mt-1 text-2xl font-semibold text-white">Active watches</h2>
                  </div>
                  <ShieldAlert className="h-5 w-5 text-white/48" />
                </div>
                {rules.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm leading-6 text-white/58">
                    No alert rules yet. Rules are private to your account and are evaluated from Situation Overview changes.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {rules.map((rule) => (
                      <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-4" key={rule.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone={severityTone(rule.severity)}>{rule.severity}</StatusBadge>
                              <StatusBadge tone={rule.isEnabled ? "green" : "amber"}>{rule.isEnabled ? "Enabled" : "Paused"}</StatusBadge>
                            </div>
                            <h3 className="mt-2 text-base font-semibold text-white">{rule.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-white/58">{rule.description}</p>
                          </div>
                          <button
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white/62 transition hover:bg-white/14 hover:text-white disabled:opacity-55"
                            disabled={isSaving}
                            onClick={() => void deleteRule(rule.id)}
                            title="Delete rule"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2">
                            <div className="text-white/42">Market</div>
                            <div className="mt-1 font-semibold text-white">{readablePair(rule.symbol)}</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2">
                            <div className="text-white/42">Frame</div>
                            <div className="mt-1 font-semibold text-white">{rule.timeframe}</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2">
                            <div className="text-white/42">Type</div>
                            <div className="mt-1 truncate font-semibold text-white">{ruleTypeLabel(rule.ruleType)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassPanel>

              {recentAcknowledged.length > 0 ? (
                <GlassPanel className="p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/72">
                    <Eye className="h-4 w-4" />
                    Recently acknowledged
                  </div>
                  <div className="space-y-2">
                    {recentAcknowledged.map((event) => (
                      <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between" key={event.id}>
                        <span className="text-white/72">{event.message}</span>
                        <span className="text-xs text-white/40">{formatLocalDateTime(event.acknowledgedAt)}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
