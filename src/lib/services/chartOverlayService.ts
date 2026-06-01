import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getLatestSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import type { WidgetSeverity } from "@/lib/widgets/types";
import type { AuthSession } from "@/lib/auth/access";
import { filterVisibleWidgetResults } from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "./widgetSettingsService";
import { listLatestWidgetResultsWithDerivedLiquidity } from "./widgetResultService";

export type ChartOverlayKind = "price_line" | "price_zone" | "event_marker";

export interface ChartOverlay {
  id: string;
  kind: ChartOverlayKind;
  symbol: string;
  timeframe: string;
  price?: number;
  priceRange?: [number, number];
  timestamp?: string;
  label: string;
  severity: WidgetSeverity;
  sourceWidget: string;
  reason: string;
}

export interface ChartOverlaysResponse {
  symbol: string;
  timeframe: string;
  overlays: ChartOverlay[];
  count: number;
  updatedAt: string;
}

interface OverlayFilters {
  symbol: string;
  timeframe: string;
  session: AuthSession;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function zoneAroundPrice(price: number, widthPct = 0.0018): [number, number] {
  return [
    Math.max(0, price * (1 - widthPct)),
    price * (1 + widthPct)
  ];
}

function severityFromWatch(value: unknown): WidgetSeverity {
  if (value === "critical") {
    return "high";
  }

  if (value === "warning") {
    return "medium";
  }

  return "low";
}

function extractPriceFromText(value: string) {
  const match = value.match(/(?:toward|near|at|above|below)\s+\$?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  return match ? numberFrom(match[1]) : null;
}

function supportResistanceOverlays(filters: OverlayFilters, details: Record<string, unknown>): ChartOverlay[] {
  const overlays: ChartOverlay[] = [];
  const currentPrice = numberFrom(details.currentPrice);
  const support = isRecord(details.nearestSupport) ? details.nearestSupport : null;
  const resistance = isRecord(details.nearestResistance) ? details.nearestResistance : null;

  if (support) {
    const price = numberFrom(support.price ?? support.level);
    const touches = numberFrom(support.touches);

    if (price !== null) {
      overlays.push({
        id: `${filters.symbol}-${filters.timeframe}-support-zone`,
        kind: "price_zone",
        symbol: filters.symbol,
        timeframe: filters.timeframe,
        priceRange: zoneAroundPrice(price),
        label: "Support zone",
        severity: currentPrice !== null && Math.abs((price - currentPrice) / currentPrice) <= 0.012 ? "medium" : "low",
        sourceWidget: "support_resistance_pressure",
        reason: `Nearest support from recent swing lows${touches !== null ? ` with ${touches} touch${touches === 1 ? "" : "es"}` : ""}.`
      });
    }
  }

  if (resistance) {
    const price = numberFrom(resistance.price ?? resistance.level);
    const touches = numberFrom(resistance.touches);

    if (price !== null) {
      overlays.push({
        id: `${filters.symbol}-${filters.timeframe}-resistance-zone`,
        kind: "price_zone",
        symbol: filters.symbol,
        timeframe: filters.timeframe,
        priceRange: zoneAroundPrice(price),
        label: "Resistance zone",
        severity: currentPrice !== null && Math.abs((price - currentPrice) / currentPrice) <= 0.012 ? "medium" : "low",
        sourceWidget: "support_resistance_pressure",
        reason: `Nearest resistance from recent swing highs${touches !== null ? ` with ${touches} touch${touches === 1 ? "" : "es"}` : ""}.`
      });
    }
  }

  return overlays;
}

function liquidationEventOverlays(filters: OverlayFilters, details: Record<string, unknown>): ChartOverlay[] {
  const largest = isRecord(details.largestLiquidation) ? details.largestLiquidation : null;

  if (!largest) {
    return [];
  }

  const price = numberFrom(largest.price);
  const timestamp = stringFrom(largest.timestamp);
  const notionalUsd = numberFrom(largest.notionalUsd);

  if (price === null || timestamp === null) {
    return [];
  }

  return [
    {
      id: `${filters.symbol}-${filters.timeframe}-largest-liquidation`,
      kind: "event_marker",
      symbol: filters.symbol,
      timeframe: filters.timeframe,
      price,
      timestamp,
      label: "Largest liquidation",
      severity: "medium",
      sourceWidget: "liquidations",
      reason: `Largest observed liquidation in the selected window${notionalUsd !== null ? ` was about ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(notionalUsd)}` : ""}.`
    }
  ];
}

function situationWatchOverlays(filters: OverlayFilters, db: Database.Database): ChartOverlay[] {
  const latest = getLatestSituationOverview(db, {
    symbol: filters.symbol,
    timeframe: filters.timeframe,
    accessPlan: filters.session.plan
  });

  if (!latest) {
    return [];
  }

  const parsed = JSON.parse(latest.watchConditionsJson) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((item): ChartOverlay[] => {
    if (!isRecord(item)) {
      return [];
    }

    const id = stringFrom(item.id) ?? "watch-condition";
    const label = stringFrom(item.label) ?? "Watch condition";
    const condition = stringFrom(item.condition);
    const implication = stringFrom(item.implication);
    const sourceWidget = stringFrom(item.sourceWidget) ?? "situation_overview";
    const price = condition ? extractPriceFromText(condition) : null;

    if (price === null) {
      return [];
    }

    return [
      {
        id: `${filters.symbol}-${filters.timeframe}-watch-${id}`,
        kind: "price_line",
        symbol: filters.symbol,
        timeframe: filters.timeframe,
        price,
        timestamp: latest.generatedAt,
        label,
        severity: severityFromWatch(item.severity),
        sourceWidget,
        reason: [condition, implication].filter(Boolean).join(" ")
      }
    ];
  });
}

export async function getChartOverlays(filters: OverlayFilters, db?: Database.Database): Promise<ChartOverlaysResponse> {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  const visibleWidgetIds = getEffectiveVisibleWidgetIds(filters.session);
  const widgets = filterVisibleWidgetResults(
    await listLatestWidgetResultsWithDerivedLiquidity(
      {
        symbol: filters.symbol,
        timeframe: filters.timeframe
      },
      database
    ),
    {
      ...filters.session,
      visibleWidgetIds
    }
  );

  const overlays = widgets.flatMap((widget) => {
    if (widget.widgetId === "support_resistance_pressure") {
      return supportResistanceOverlays(filters, widget.details);
    }

    if (widget.widgetId === "liquidations") {
      return liquidationEventOverlays(filters, widget.details);
    }

    return [];
  });

  overlays.push(...situationWatchOverlays(filters, database));

  return {
    symbol: filters.symbol,
    timeframe: filters.timeframe,
    overlays: overlays.slice(0, 16),
    count: overlays.length,
    updatedAt: new Date().toISOString()
  };
}
