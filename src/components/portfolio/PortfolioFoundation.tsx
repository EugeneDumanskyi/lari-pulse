"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  WalletCards
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  ApiEnvelope,
  AuthSessionApi,
  PortfolioContextApi,
  PortfolioItemApi,
  PortfolioItemInput
} from "@/lib/api/types";
import { AppShell, EmptyState, GlassCard, GlassPanel, MetricPill, StatusBadge } from "@/components/dashboard/primitives";
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

function formatNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value)}%`;
}

function riskTone(risk: string | undefined) {
  if (risk === "low" || risk === "moderate") {
    return risk === "low" ? "green" : "blue";
  }

  if (risk === "elevated") {
    return "amber";
  }

  return "red";
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

function readable(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "--";
}

const emptyForm = {
  symbol: "BTCUSDT",
  quantity: "",
  averageCost: "",
  label: "",
  notes: "",
  includeInRisk: true
};

type PortfolioFormState = typeof emptyForm;

function inputToPayload(form: PortfolioFormState): PortfolioItemInput {
  return {
    symbol: form.symbol,
    quantity: form.quantity.trim() === "" ? 0 : Number(form.quantity),
    averageCost: form.averageCost.trim() === "" ? null : Number(form.averageCost),
    quoteCurrency: "USDT",
    label: form.label,
    notes: form.notes,
    includeInRisk: form.includeInRisk
  };
}

function formFromItem(item: PortfolioItemApi): PortfolioFormState {
  return {
    symbol: item.symbol,
    quantity: item.quantity === 0 ? "" : String(item.quantity),
    averageCost: item.averageCost === null ? "" : String(item.averageCost),
    label: item.label ?? "",
    notes: item.notes ?? "",
    includeInRisk: item.includeInRisk
  };
}

function HoldingRow({
  item,
  selected,
  onSelect,
  onEdit,
  onDelete
}: {
  item: PortfolioItemApi;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pnlPositive = (item.unrealizedPnl ?? 0) >= 0;

  return (
    <div
      className={cn(
        "grid w-full gap-3 rounded-[22px] border px-4 py-3 text-left transition lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_92px] lg:items-center",
        selected ? "border-sky-200/36 bg-sky-200/14 shadow-glass" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.075]"
      )}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-white">{item.label || displaySymbol(item.symbol)}</div>
          {item.quantity === 0 ? <StatusBadge tone="blue">Watch</StatusBadge> : null}
          {!item.includeInRisk ? <StatusBadge tone="amber">Excluded</StatusBadge> : null}
        </div>
        <div className="mt-1 text-xs text-white/48">{displaySymbol(item.symbol)} · {formatNumber(item.quantity)}</div>
      </div>
      <div>
        <div className="text-xs text-white/46">Value</div>
        <div className="mt-1 text-sm font-semibold text-white">{formatMoney(item.marketValue)}</div>
      </div>
      <div>
        <div className="text-xs text-white/46">P/L</div>
        <div className={cn("mt-1 text-sm font-semibold", pnlPositive ? "text-emerald-300" : "text-rose-300")}>
          {formatMoney(item.unrealizedPnl)} <span className="text-xs opacity-78">{formatPercent(item.unrealizedPnlPercent)}</span>
        </div>
      </div>
      <div>
        <div className="text-xs text-white/46">Risk</div>
        <div className="mt-1">
          <StatusBadge tone={riskTone(item.situation?.riskLevel)}>{readable(item.situation?.riskLevel)}</StatusBadge>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          aria-label={`Edit ${displaySymbol(item.symbol)}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/72 transition hover:bg-white/12"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          aria-label={`Delete ${displaySymbol(item.symbol)}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200/16 bg-rose-300/[0.06] text-rose-100 transition hover:bg-rose-300/14"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PortfolioForm({
  session,
  form,
  editingId,
  busy,
  onChange,
  onCancel,
  onSubmit
}: {
  session: AuthSessionApi | null;
  form: PortfolioFormState;
  editingId: number | null;
  busy: boolean;
  onChange: (form: PortfolioFormState) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const accessible = new Set(session?.accessibleSymbols ?? ["BTCUSDT"]);

  return (
    <GlassPanel className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/14 bg-white/10">
          <Plus className="h-5 w-5 text-sky-100" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">
            {editingId ? "Edit Item" : "Local Entry"}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">Portfolio item</div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="portfolio-symbol">Symbol</label>
          <select
            className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm font-semibold text-white outline-none"
            id="portfolio-symbol"
            onChange={(event) => onChange({ ...form, symbol: event.target.value })}
            value={form.symbol}
          >
            {symbols.map((symbol) => (
              <option disabled={!accessible.has(symbol)} key={symbol} value={symbol}>
                {displaySymbol(symbol)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="portfolio-quantity">Quantity</label>
            <input
              className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm text-white outline-none placeholder:text-white/32"
              id="portfolio-quantity"
              min="0"
              onChange={(event) => onChange({ ...form, quantity: event.target.value })}
              placeholder="0"
              step="any"
              type="number"
              value={form.quantity}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="portfolio-cost">Average cost</label>
            <input
              className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm text-white outline-none placeholder:text-white/32"
              id="portfolio-cost"
              min="0"
              onChange={(event) => onChange({ ...form, averageCost: event.target.value })}
              placeholder="Optional"
              step="any"
              type="number"
              value={form.averageCost}
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="portfolio-label">Label</label>
          <input
            className="h-11 w-full rounded-2xl border border-white/12 bg-slate-950/42 px-3 text-sm text-white outline-none placeholder:text-white/32"
            id="portfolio-label"
            onChange={(event) => onChange({ ...form, label: event.target.value })}
            placeholder="Core BTC"
            value={form.label}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold text-white/54" htmlFor="portfolio-notes">Notes</label>
          <textarea
            className="min-h-[88px] w-full resize-none rounded-2xl border border-white/12 bg-slate-950/42 px-3 py-3 text-sm text-white outline-none placeholder:text-white/32"
            id="portfolio-notes"
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            placeholder="Local note"
            value={form.notes}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-semibold text-white/76">
          Include in risk summary
          <input
            checked={form.includeInRisk}
            className="h-4 w-4 accent-sky-300"
            onChange={(event) => onChange({ ...form, includeInRisk: event.target.checked })}
            type="checkbox"
          />
        </label>
        <div className="flex gap-2">
          <button
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-sky-200/30 bg-sky-300/18 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/26 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Update" : "Add"}
          </button>
          {editingId ? (
            <button
              className="h-11 rounded-2xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white/72 transition hover:bg-white/12"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </GlassPanel>
  );
}

export function PortfolioFoundation() {
  const [portfolio, setPortfolio] = useState<PortfolioContextApi | null>(null);
  const [session, setSession] = useState<AuthSessionApi | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PortfolioFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [sessionData, portfolioData] = await Promise.all([
      fetchApi<AuthSessionApi>("/api/auth/session"),
      fetchApi<PortfolioContextApi>("/api/portfolio")
    ]);

    setSession(sessionData);
    setPortfolio(portfolioData);
    setSelectedId((current) => current ?? portfolioData.items[0]?.id ?? null);
    setForm((current) => {
      if (sessionData.accessibleSymbols.includes(current.symbol)) {
        return current;
      }

      return {
        ...current,
        symbol: sessionData.accessibleSymbols[0] ?? "BTCUSDT"
      };
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
          setError(loadError instanceof Error ? loadError.message : "Unable to load portfolio");
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

  const selectedItem = useMemo(
    () => portfolio?.items.find((item) => item.id === selectedId) ?? portfolio?.items[0] ?? null,
    [portfolio, selectedId]
  );

  async function refresh() {
    setIsLoading(true);

    try {
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh portfolio");
    } finally {
      setIsLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const payload = inputToPayload(form);
      const data = await fetchApi<PortfolioContextApi>(
        editingId ? `/api/portfolio/${editingId}` : "/api/portfolio",
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      setPortfolio(data);
      setSelectedId(editingId ?? data.items[data.items.length - 1]?.id ?? null);
      setEditingId(null);
      setForm({
        ...emptyForm,
        symbol: session?.accessibleSymbols[0] ?? "BTCUSDT"
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save portfolio item");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(id: number) {
    setIsSaving(true);
    setError(null);

    try {
      const data = await fetchApi<PortfolioContextApi>(`/api/portfolio/${id}`, { method: "DELETE" });
      setPortfolio(data);
      setSelectedId(data.items[0]?.id ?? null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete portfolio item");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: PortfolioItemApi) {
    setEditingId(item.id);
    setForm(formFromItem(item));
  }

  return (
    <AppShell activeItem="portfolio">
      <section className="relative flex min-w-0 flex-1 p-4 md:p-6">
        <div className="min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/48">Personal Context</div>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Portfolio</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Local holdings and watched exposure connected to the current market-state timeline.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="blue">{portfolio?.summary.itemCount ?? 0} items</StatusBadge>
              <button
                className="glass-surface flex h-8 w-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/12"
                onClick={refresh}
                type="button"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </motion.div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
              {replaceIsoDatesWithLocalTime(error)}
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricPill
              icon={<WalletCards className="h-5 w-5 text-sky-100" />}
              label="Market value"
              value={formatMoney(portfolio?.summary.totalMarketValue)}
            />
            <MetricPill
              icon={<Eye className="h-5 w-5 text-cyan-100" />}
              label="Watched"
              value={String(portfolio?.summary.watchedCount ?? 0)}
              detail={`${portfolio?.summary.riskIncludedCount ?? 0} risk-included`}
            />
            <MetricPill
              icon={<ShieldAlert className="h-5 w-5 text-amber-100" />}
              label="Highest risk"
              value={portfolio?.summary.highestRisk ? displaySymbol(portfolio.summary.highestRisk.symbol) : "--"}
              detail={portfolio?.summary.highestRisk ? readable(portfolio.summary.highestRisk.riskLevel) : undefined}
            />
            <MetricPill
              icon={<AlertTriangle className="h-5 w-5 text-rose-100" />}
              label="Total P/L"
              value={formatMoney(portfolio?.summary.totalUnrealizedPnl)}
              detail={formatPercent(portfolio?.summary.totalUnrealizedPnlPercent)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <PortfolioForm
              busy={isSaving}
              editingId={editingId}
              form={form}
              onCancel={() => {
                setEditingId(null);
                setForm({
                  ...emptyForm,
                  symbol: session?.accessibleSymbols[0] ?? "BTCUSDT"
                });
              }}
              onChange={setForm}
              onSubmit={submit}
              session={session}
            />

            <div className="min-w-0 space-y-4">
              <GlassPanel className="p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Holdings</div>
                    <div className="mt-1 text-lg font-semibold text-white">Risk-linked items</div>
                  </div>
                  {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-100" /> : null}
                </div>
                {portfolio && portfolio.items.length > 0 ? (
                  <div className="space-y-2.5">
                    {portfolio.items.map((item) => (
                      <HoldingRow
                        item={item}
                        key={item.id}
                        onDelete={() => void remove(item.id)}
                        onEdit={() => startEdit(item)}
                        onSelect={() => setSelectedId(item.id)}
                        selected={selectedItem?.id === item.id}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description="Add a holding or a watched asset to connect local exposure with current market-state context."
                    title="No portfolio items yet"
                  />
                )}
              </GlassPanel>

              {selectedItem ? (
                <GlassPanel className="p-5">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Selected Context</div>
                      <h2 className="mt-1 text-2xl font-semibold text-white">{selectedItem.label || displaySymbol(selectedItem.symbol)}</h2>
                      <div className="mt-2 text-sm text-white/54">
                        Price {formatMoney(selectedItem.currentPrice)} · Concentration {formatPercent(selectedItem.concentrationPercent)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={biasTone(selectedItem.situation?.bias)}>{readable(selectedItem.situation?.bias)}</StatusBadge>
                      <StatusBadge tone={riskTone(selectedItem.situation?.riskLevel)}>Risk {readable(selectedItem.situation?.riskLevel)}</StatusBadge>
                    </div>
                  </div>

                  {selectedItem.situation ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.85fr]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                        <div className="mb-2 text-sm font-semibold text-white">{selectedItem.situation.title}</div>
                        <p className="text-sm leading-6 text-white/66">{selectedItem.situation.summary}</p>
                        {selectedItem.situation.strongestDriver ? (
                          <div className="mt-4 rounded-2xl border border-cyan-200/18 bg-cyan-300/8 px-3 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/54">Strongest driver</div>
                            <div className="mt-1 text-sm font-semibold text-white">{selectedItem.situation.strongestDriver.label}</div>
                            <div className="mt-1 text-xs leading-5 text-white/58">{selectedItem.situation.strongestDriver.explanation}</div>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/44">Watch conditions</div>
                        {selectedItem.watchConditions.length > 0 ? (
                          <div className="space-y-2.5">
                            {selectedItem.watchConditions.slice(0, 4).map((condition) => (
                              <div className="rounded-2xl border border-white/10 bg-slate-950/18 px-3 py-2.5" key={condition.id}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-white">{condition.label}</div>
                                  <StatusBadge tone={condition.severity === "critical" ? "red" : condition.severity === "warning" ? "amber" : "blue"}>
                                    {condition.severity}
                                  </StatusBadge>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-white/56">{condition.condition}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm leading-6 text-white/56">No active watch conditions are stored for this item.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      description="Generate a Situation Overview for this symbol to attach current bias, risk, and watch conditions."
                      title="No situation context yet"
                    />
                  )}
                  <div className="mt-4 text-xs text-white/38">
                    Last portfolio refresh {formatLocalDateTime(portfolio?.summary.updatedAt)}. Local context only.
                  </div>
                </GlassPanel>
              ) : null}

              {portfolio?.notes.length ? (
                <GlassCard className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/44">
                    <AlertTriangle className="h-4 w-4" />
                    Notes
                  </div>
                  <div className="space-y-1.5 text-sm leading-6 text-white/62">
                    {portfolio.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                </GlassCard>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
