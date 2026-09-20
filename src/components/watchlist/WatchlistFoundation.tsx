"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Star,
  Trash2
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  WatchlistContextApi,
  WatchlistItemApi,
  WatchlistItemInput
} from "@/lib/api/types";
import { AppShell, EmptyState, GlassCard, GlassPanel, MetricPill, StatusBadge } from "@/components/dashboard/primitives";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { cn } from "@/lib/utils/cn";
import { formatLocalDateTime, replaceIsoDatesWithLocalTime } from "@/lib/utils/formatDateTime";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

async function fetchApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiEnvelope<T> | { status: "error"; message: string };

  if (!response.ok || body.status === "error") {
    throw new Error("message" in body ? body.message : `Request failed: ${url}`);
  }

  return body.data;
}

function displaySymbol(symbol: string) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

function readable(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "--";
}

function biasTone(bias: string | undefined) {
  if (bias?.includes("bullish")) {
    return "green";
  }

  if (bias?.includes("bearish")) {
    return "red";
  }

  return "amber";
}

/** Newest stored state on the row, whichever of the two is more recent. */
function newestStateAt(item: WatchlistItemApi) {
  const candidates = [item.priceUpdatedAt, item.situation?.generatedAt ?? null].filter(
    (value): value is string => Boolean(value)
  );

  return candidates.sort().at(-1) ?? null;
}

function formatAge(value: string | null) {
  if (!value) {
    return null;
  }

  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);

  if (!Number.isFinite(minutes) || minutes < 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes}m old`;
  }

  if (minutes < 60 * 48) {
    return `${Math.floor(minutes / 60)}h old`;
  }

  return `${Math.floor(minutes / 1440)}d old`;
}

const emptyForm = {
  symbol: "BTCUSDT",
  timeframe: "1h",
  note: ""
};

type WatchlistFormState = typeof emptyForm;

function WatchlistRow({
  item,
  index,
  total,
  busy,
  onMove,
  onEditNote,
  onDelete
}: {
  item: WatchlistItemApi;
  index: number;
  total: number;
  busy: boolean;
  onMove: (position: number) => void;
  onEditNote: (note: string) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const age = formatAge(newestStateAt(item));

  useEffect(() => {
    setNote(item.note ?? "");
  }, [item.note]);

  return (
    <GlassCard className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">{displaySymbol(item.symbol)}</div>
            <StatusBadge tone="blue">{item.timeframe}</StatusBadge>
            {item.isStale ? (
              <>
                <StatusBadge tone="amber">Stale</StatusBadge>
                {age ? <span className="text-xs text-white/48">{age}</span> : null}
              </>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <div className="text-lg font-semibold text-white">{formatMoney(item.currentPrice)}</div>
            {item.currentPrice === null ? (
              <span className="text-xs text-white/44">No stored candle for this pair</span>
            ) : (
              <span className="text-xs text-white/44">at {formatLocalDateTime(item.priceUpdatedAt)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={`Move ${displaySymbol(item.symbol)} ${item.timeframe} up`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/72 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-42"
            disabled={busy || index === 0}
            onClick={() => onMove(index - 1)}
            type="button"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            aria-label={`Move ${displaySymbol(item.symbol)} ${item.timeframe} down`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/72 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-42"
            disabled={busy || index === total - 1}
            onClick={() => onMove(index + 1)}
            type="button"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            aria-label={`Remove ${displaySymbol(item.symbol)} ${item.timeframe}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200/16 bg-rose-300/[0.06] text-rose-100 transition hover:bg-rose-300/14 disabled:cursor-not-allowed disabled:opacity-42"
            disabled={busy}
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {item.situation ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={biasTone(item.situation.bias)}>{readable(item.situation.bias)}</StatusBadge>
            <StatusBadge tone="default">Risk {readable(item.situation.riskLevel)}</StatusBadge>
            <span className="text-xs text-white/44">{formatLocalDateTime(item.situation.generatedAt)}</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-white">{item.situation.title}</div>
          <p className="mt-1 text-sm leading-6 text-white/64">{item.situation.summary}</p>
          {item.watchConditions.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {item.watchConditions.slice(0, 3).map((condition) => (
                <div className="text-xs leading-5 text-white/56" key={condition.id}>
                  <span className="font-semibold text-white/76">{condition.label}</span> — {condition.condition}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/56">
          No Situation Overview is stored for {displaySymbol(item.symbol)} {item.timeframe}.
        </div>
      )}

      <div className="mt-3">
        <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor={`watchlist-note-${item.id}`}>
          Note
        </label>
        <input
          className="h-10 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm text-white outline-none placeholder:text-white/32 disabled:opacity-50"
          disabled={busy}
          id={`watchlist-note-${item.id}`}
          maxLength={280}
          onBlur={() => {
            if (note.trim() !== (item.note ?? "")) {
              onEditNote(note);
            }
          }}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this pair is on the list"
          value={note}
        />
      </div>
    </GlassCard>
  );
}

export function WatchlistFoundation() {
  const [watchlist, setWatchlist] = useState<WatchlistContextApi | null>(null);
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [form, setForm] = useState<WatchlistFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    const [sessionData, watchlistData] = await Promise.all([
      fetchApi<AuthSessionApi>("/api/auth/session"),
      fetchApi<WatchlistContextApi>("/api/watchlist")
    ]);

    setSession(sessionData);
    setWatchlist(watchlistData);
    setForm((current) => {
      if (sessionData.accessibleSymbols.includes(current.symbol)) {
        return current;
      }

      return { ...current, symbol: sessionData.accessibleSymbols[0] ?? "BTCUSDT" };
    });
  }

  useEffect(() => {
    let active = true;

    async function run() {
      setIsLoading(true);

      try {
        await load();
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load watchlist");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setIsLoading(true);
    setError(null);

    try {
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh watchlist");
    } finally {
      setIsLoading(false);
    }
  }

  async function mutate(url: string, init: RequestInit, fallbackMessage: string, inline = false) {
    setIsSaving(true);
    setFormError(null);

    try {
      setWatchlist(await fetchApi<WatchlistContextApi>(url, init));
      return true;
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : fallbackMessage;

      if (inline) {
        setFormError(message);
      } else {
        setError(message);
      }

      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: WatchlistItemInput = {
      symbol: form.symbol,
      timeframe: form.timeframe,
      note: form.note
    };
    const added = await mutate(
      "/api/watchlist",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      "Unable to add watchlist item",
      true
    );

    if (added) {
      setForm((current) => ({ ...current, note: "" }));
    }
  }

  const accessible = new Set(session?.accessibleSymbols ?? ["BTCUSDT"]);
  const items = watchlist?.items ?? [];
  const pairCount = watchlist?.summary.itemCount ?? 0;

  return (
    <AppShell activeItem="watchlist">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Followed Pairs</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Watchlist</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                The symbol and timeframe pairs you follow, with the price and Situation Overview already stored for each
                one and how old that state is.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="blue">{pairCount === 1 ? "1 pair" : `${pairCount} pairs`}</StatusBadge>
              <button
                aria-label="Refresh watchlist"
                className="glass-surface flex h-8 w-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/12"
                onClick={refresh}
                type="button"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </motion.div>

          {error ? (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <span>{replaceIsoDatesWithLocalTime(error)}</span>
              <button
                className="h-9 shrink-0 rounded-xl border border-rose-200/30 bg-rose-300/12 px-4 text-sm font-semibold text-rose-50 transition hover:bg-rose-300/20"
                onClick={refresh}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricPill
              icon={<Star className="h-5 w-5 text-sky-100" />}
              label="Pairs"
              value={String(watchlist?.summary.itemCount ?? 0)}
            />
            <MetricPill
              icon={<AlertTriangle className="h-5 w-5 text-amber-100" />}
              label="Stale"
              value={String(watchlist?.summary.staleCount ?? 0)}
              detail={`${watchlist?.summary.missingPriceCount ?? 0} without a stored price`}
            />
            <MetricPill
              icon={<Clock3 className="h-5 w-5 text-cyan-100" />}
              label="Newest state"
              value={formatLocalDateTime(watchlist?.summary.newestStateAt)}
            />
            <MetricPill
              icon={<RefreshCw className="h-5 w-5 text-white/72" />}
              label="Missing overviews"
              value={String(watchlist?.summary.missingOverviewCount ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <GlassPanel className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/14 bg-white/10">
                  <Plus className="h-5 w-5 text-sky-100" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Follow A Pair</div>
                  <div className="mt-1 text-lg font-semibold text-white">Watchlist item</div>
                </div>
              </div>

              <form className="space-y-4" onSubmit={submit}>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="watchlist-symbol">Symbol</label>
                  <select
                    className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-semibold text-white outline-none"
                    id="watchlist-symbol"
                    onChange={(event) => setForm({ ...form, symbol: event.target.value })}
                    value={form.symbol}
                  >
                    {symbols.map((symbol) => (
                      <option disabled={!accessible.has(symbol)} key={symbol} value={symbol}>
                        {displaySymbol(symbol)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="watchlist-timeframe">Timeframe</label>
                  <select
                    className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-semibold text-white outline-none"
                    id="watchlist-timeframe"
                    onChange={(event) => setForm({ ...form, timeframe: event.target.value })}
                    value={form.timeframe}
                  >
                    {collectionTimeframes.map((timeframe) => (
                      <option key={timeframe} value={timeframe}>
                        {timeframe}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="watchlist-note">Note</label>
                  <input
                    className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm text-white outline-none placeholder:text-white/32"
                    id="watchlist-note"
                    maxLength={280}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                    placeholder="Watching the range high"
                    value={form.note}
                  />
                </div>
                {formError ? (
                  <div className="rounded-2xl border border-rose-300/35 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-100">
                    {replaceIsoDatesWithLocalTime(formError)}
                  </div>
                ) : null}
                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/30 bg-sky-300/18 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/26 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </form>
            </GlassPanel>

            <div className="min-w-0 space-y-4">
              {isLoading && !watchlist ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((key) => (
                    <GlassPanel className="h-[184px] p-5" key={key}>
                      <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
                      <div className="mt-4 h-7 w-40 animate-pulse rounded-full bg-white/10" />
                      <div className="mt-6 h-14 w-full animate-pulse rounded-2xl bg-white/[0.06]" />
                    </GlassPanel>
                  ))}
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <WatchlistRow
                      busy={isSaving}
                      index={index}
                      item={item}
                      key={item.id}
                      onDelete={() =>
                        void mutate(`/api/watchlist/${item.id}`, { method: "DELETE" }, "Unable to remove watchlist item")
                      }
                      onEditNote={(note) =>
                        void mutate(
                          `/api/watchlist/${item.id}`,
                          {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ note })
                          },
                          "Unable to update the note"
                        )
                      }
                      onMove={(position) =>
                        void mutate(
                          `/api/watchlist/${item.id}`,
                          {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ position })
                          },
                          "Unable to reorder the watchlist"
                        )
                      }
                      total={items.length}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  description="Add a symbol and a timeframe to read its stored price and Situation Overview here, instead of one dashboard visit at a time."
                  title="No pairs on your watchlist yet"
                />
              )}

              {watchlist?.notes.length ? (
                <GlassCard className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/44">
                    <AlertTriangle className="h-4 w-4" />
                    Notes
                  </div>
                  <div className="space-y-1.5 text-sm leading-6 text-white/62">
                    {watchlist.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                </GlassCard>
              ) : null}

              {watchlist ? (
                <div className="text-xs text-white/38">
                  Last watchlist refresh {formatLocalDateTime(watchlist.summary.updatedAt)}. Stored state only.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
