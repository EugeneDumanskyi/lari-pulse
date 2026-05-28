import { getWidgetCatalogItem, sortByWidgetPriority } from "@/lib/widgets/catalog";
import type { WidgetResultApi } from "@/lib/api/types";
import type {
  SituationBias,
  SituationChange,
  SituationConfidence,
  SituationDataWarning,
  SituationDriver,
  SituationDriverDirection,
  SituationDriverStrength,
  SituationOverview,
  SituationOverviewBuildInput,
  SituationRiskLevel,
  SituationSourceWidget,
  SituationWatchCondition
} from "./situationOverview.types";

const PRIMARY_WIDGET_IDS = [
  "trend_strength",
  "momentum_exhaustion",
  "volume_confirmation",
  "multi_timeframe_alignment"
];

const SECONDARY_WIDGET_IDS = [
  "support_resistance_pressure",
  "liquidations"
];

const CONTEXT_WIDGET_IDS = [
  "risk_regime",
  "macro_risk_pulse",
  "dollar_pressure",
  "nasdaq_crypto_correlation",
  "cross_market_divergence",
  "gold_risk_hedge",
  "oil_inflation_pressure"
];

const DIRECTION_WEIGHTS: Record<string, number> = {
  trend_strength: 32,
  momentum_exhaustion: 22,
  volume_confirmation: 12,
  multi_timeframe_alignment: 22,
  support_resistance_pressure: 8,
  risk_regime: 10,
  macro_risk_pulse: 9,
  dollar_pressure: 7,
  nasdaq_crypto_correlation: 6,
  cross_market_divergence: 6,
  gold_risk_hedge: 4,
  oil_inflation_pressure: 4,
  liquidations: 0
};

const timeframeDurationsMs: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000
};

interface NormalizedSignal {
  widget: WidgetResultApi;
  direction: SituationDriverDirection;
  directionalFactor: number;
  directionWeight: number;
  strength: SituationDriverStrength;
  stale: boolean;
  riskContribution: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sentence(value: string) {
  return value.endsWith(".") ? value : `${value}.`;
}

function readableWidgetName(widgetId: string) {
  return getWidgetCatalogItem(widgetId)?.title ?? widgetId.replaceAll("_", " ");
}

function ageMs(widget: WidgetResultApi, generatedAt: Date) {
  const sourceTimes = widget.sources
    .map((source) => source.updatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  const fallback = Date.parse(widget.updatedAt);
  const newest = sourceTimes.length > 0 ? Math.max(...sourceTimes) : fallback;

  return Number.isFinite(newest) ? generatedAt.getTime() - newest : Number.POSITIVE_INFINITY;
}

function staleThresholdMs(widget: WidgetResultApi, timeframe: string) {
  if (CONTEXT_WIDGET_IDS.includes(widget.widgetId)) {
    return 5 * 24 * 60 * 60 * 1000;
  }

  const duration = timeframeDurationsMs[timeframe] ?? 60 * 60 * 1000;
  return duration * 3;
}

function isWidgetStale(widget: WidgetResultApi, timeframe: string, generatedAt: Date) {
  const detailStale = widget.details.isStale;

  if (typeof detailStale === "boolean" && detailStale) {
    return true;
  }

  return ageMs(widget, generatedAt) > staleThresholdMs(widget, timeframe);
}

function directionFromText(widgetId: string, direction: string): {
  direction: SituationDriverDirection;
  factor: number;
} {
  const value = direction.toLowerCase();

  if (value.includes("unknown") || value.includes("insufficient") || value.includes("storage_error")) {
    return { direction: "unknown", factor: 0 };
  }

  if (value.includes("mixed") || value.includes("unstable") || value.includes("conflicting")) {
    return { direction: "mixed", factor: 0 };
  }

  if (value.includes("neutral") || value.includes("balanced") || value.includes("range_middle")) {
    return { direction: "neutral", factor: 0 };
  }

  if (value.includes("risk_on")) {
    return { direction: "risk_on", factor: 1 };
  }

  if (value.includes("risk_off") || value.includes("transitioning_to_risk_off")) {
    return { direction: "risk_off", factor: -1 };
  }

  if (widgetId === "dollar_pressure" && (value.includes("pressure") || value.includes("strength"))) {
    return { direction: "risk_off", factor: -0.75 };
  }

  if (value.includes("bullish_but_overheated")) {
    return { direction: "bullish", factor: 0.45 };
  }

  if (value.includes("bearish_but_oversold")) {
    return { direction: "bearish", factor: -0.45 };
  }

  if (value.includes("bull") || value.includes("support") || value.includes("recovering") || value.includes("risk relief")) {
    return { direction: "bullish", factor: 1 };
  }

  if (value.includes("bear") || value.includes("resistance") || value.includes("cooling") || value.includes("breakdown")) {
    return { direction: "bearish", factor: -1 };
  }

  return { direction: "unknown", factor: 0 };
}

function directionFromWidget(widget: WidgetResultApi) {
  const normalized = directionFromText(widget.widgetId, widget.direction);

  if (
    widget.widgetId === "volume_confirmation" &&
    normalized.direction === "unknown" &&
    (widget.direction.includes("confirmation") || widget.direction.includes("conflicting"))
  ) {
    const candleDirection = widget.details.candleDirection;

    if (candleDirection === "green") {
      return { direction: "bullish" as const, factor: widget.direction.includes("conflicting") ? 0 : 0.55 };
    }

    if (candleDirection === "red") {
      return { direction: "bearish" as const, factor: widget.direction.includes("conflicting") ? 0 : -0.55 };
    }
  }

  return normalized;
}

function strengthFromScore(widget: WidgetResultApi): SituationDriverStrength {
  const distance = Math.abs(widget.score - 50);
  const effectiveStrength = distance * clamp(widget.confidence, 0.25, 1);

  if (widget.severity === "high" || effectiveStrength >= 22) {
    return "high";
  }

  if (widget.severity === "medium" || effectiveStrength >= 10) {
    return "medium";
  }

  return "low";
}

function directionMagnitude(widget: WidgetResultApi) {
  return clamp(Math.abs(widget.score - 50) / 50, 0.35, 1);
}

function effectiveConfidence(signal: NormalizedSignal) {
  return clamp(signal.widget.confidence, 0.25, 1) * (signal.stale ? 0.45 : 1);
}

function riskFromWidget(widget: WidgetResultApi, direction: SituationDriverDirection) {
  let risk = widget.severity === "high" ? 11 : widget.severity === "medium" ? 6 : 2;
  const normalizedDirection = widget.direction.toLowerCase();

  if (widget.confidence < 0.5) {
    risk += 5;
  }

  if (direction === "mixed" || normalizedDirection.includes("conflicting") || normalizedDirection.includes("unstable")) {
    risk += 9;
  }

  if (widget.widgetId === "liquidations") {
    if (normalizedDirection.includes("long_liquidations") || normalizedDirection.includes("short_liquidations")) {
      risk += 10;
    } else if (normalizedDirection.includes("unknown")) {
      risk += 6;
    }
  }

  if (widget.widgetId === "support_resistance_pressure") {
    if (normalizedDirection.includes("breakout") || normalizedDirection.includes("breakdown")) {
      risk += 9;
    } else if (normalizedDirection.includes("near_")) {
      risk += 5;
    }
  }

  if (CONTEXT_WIDGET_IDS.includes(widget.widgetId) && (direction === "risk_off" || direction === "mixed")) {
    risk += 7;
  }

  return risk;
}

function normalizeSignals(widgets: WidgetResultApi[], timeframe: string, generatedAt: Date): NormalizedSignal[] {
  return sortByWidgetPriority(widgets).map((widget) => {
    const direction = directionFromWidget(widget);

    return {
      widget,
      direction: direction.direction,
      directionalFactor: direction.factor,
      directionWeight: DIRECTION_WEIGHTS[widget.widgetId] ?? 4,
      strength: strengthFromScore(widget),
      stale: isWidgetStale(widget, timeframe, generatedAt),
      riskContribution: riskFromWidget(widget, direction.direction)
    };
  });
}

function signalExplanation(signal: NormalizedSignal) {
  const label = readableWidgetName(signal.widget.widgetId);
  const direction = signal.widget.direction.replaceAll("_", " ");

  return `${label} reports ${direction}: ${signal.widget.summary}`;
}

function driverFromSignal(signal: NormalizedSignal, idPrefix = "driver"): SituationDriver {
  return {
    id: `${idPrefix}-${signal.widget.widgetId}`,
    label: readableWidgetName(signal.widget.widgetId),
    direction: signal.direction,
    strength: signal.strength,
    explanation: signalExplanation(signal),
    sourceWidget: signal.widget.widgetId
  };
}

function biasFromScore(score: number, conflicts: SituationDriver[], usedSignalCount: number): SituationBias {
  if (usedSignalCount === 0) {
    return "unknown";
  }

  if (conflicts.length >= 2 && Math.abs(score) < 45) {
    return "mixed";
  }

  if (score >= 70) {
    return "strong_bullish";
  }

  if (score >= 25) {
    return "bullish";
  }

  if (score <= -70) {
    return "strong_bearish";
  }

  if (score <= -25) {
    return "bearish";
  }

  if (Math.abs(score) <= 12) {
    return conflicts.length > 0 ? "mixed" : "neutral";
  }

  return "mixed";
}

function riskLevelFromScore(score: number, hasSignals: boolean): SituationRiskLevel {
  if (!hasSignals) {
    return "unknown";
  }

  if (score >= 82) {
    return "extreme";
  }

  if (score >= 65) {
    return "high";
  }

  if (score >= 45) {
    return "elevated";
  }

  if (score >= 25) {
    return "moderate";
  }

  return "low";
}

function confidenceFromScore(score: number, usedSignalCount: number): SituationConfidence {
  if (usedSignalCount < 2 || score < 0.45) {
    return "low";
  }

  if (score >= 0.72) {
    return "high";
  }

  return "medium";
}

function titleFor(bias: SituationBias, riskLevel: SituationRiskLevel) {
  const riskSuffix = `${riskLevel} risk`;

  if (bias === "strong_bullish") {
    return `Strong bullish pressure with ${riskSuffix}`;
  }

  if (bias === "bullish") {
    return `Bullish pressure with ${riskSuffix}`;
  }

  if (bias === "strong_bearish") {
    return `Strong bearish pressure with ${riskSuffix}`;
  }

  if (bias === "bearish") {
    return `Bearish pressure with ${riskSuffix}`;
  }

  if (bias === "neutral") {
    return `Neutral market state with ${riskSuffix}`;
  }

  if (bias === "unknown") {
    return "Market state unavailable";
  }

  return `Mixed market state with ${riskSuffix}`;
}

function summarizeSituation(input: {
  symbol: string;
  timeframe: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  drivers: SituationDriver[];
  conflicts: SituationDriver[];
  partial: boolean;
}) {
  if (input.bias === "unknown") {
    return `${input.symbol} does not have enough current ${input.timeframe} widget data to form a reliable market-state read.`;
  }

  const driverText = input.drivers
    .slice(0, 2)
    .map((driver) => driver.label.toLowerCase())
    .join(" and ");
  const conflictText = input.conflicts.length > 0
    ? ` Conflicting inputs are present, led by ${input.conflicts[0].label.toLowerCase()}.`
    : "";
  const partialText = input.partial ? " Some inputs are missing or stale, so the read is partial." : "";

  return `${input.symbol} ${input.timeframe} state is ${input.bias.replaceAll("_", " ")} with ${input.riskLevel} risk. ${driverText ? `The main read comes from ${driverText}.` : "No single driver dominates."}${conflictText} Confidence is ${input.confidence}.${partialText}`;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPrice(value: number | null) {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function watchConditions(input: SituationOverviewBuildInput, signals: NormalizedSignal[]): SituationWatchCondition[] {
  const conditions: SituationWatchCondition[] = [];
  const supportResistance = signals.find((signal) => signal.widget.widgetId === "support_resistance_pressure")?.widget;
  const volume = signals.find((signal) => signal.widget.widgetId === "volume_confirmation")?.widget;
  const latestPrice = input.marketOverview?.metrics.latestPrice ?? null;

  if (supportResistance) {
    const details = supportResistance.details;
    const support = details.nearestSupport as { level?: unknown } | null | undefined;
    const resistance = details.nearestResistance as { level?: unknown } | null | undefined;
    const supportLevel = getNumber(support?.level);
    const resistanceLevel = getNumber(resistance?.level);

    if (resistanceLevel !== null) {
      conditions.push({
        id: "watch-resistance-reclaim",
        label: "Resistance pressure",
        condition: `${input.symbol} holds above ${formatPrice(resistanceLevel)} with improving confirmation`,
        implication: "Bearish or range pressure would weaken if the move is confirmed by volume and trend widgets.",
        severity: "warning",
        sourceWidget: supportResistance.widgetId
      });
    }

    if (supportLevel !== null) {
      conditions.push({
        id: "watch-support-loss",
        label: "Support pressure",
        condition: `${input.symbol} loses ${formatPrice(supportLevel)} with expanding participation`,
        implication: "Downside risk would increase if support fails while momentum and volume weaken.",
        severity: "warning",
        sourceWidget: supportResistance.widgetId
      });
    }
  }

  if (volume && (volume.direction.includes("weak") || volume.direction.includes("no_confirmation") || volume.direction.includes("conflicting"))) {
    conditions.push({
      id: "watch-volume-confirmation",
      label: "Volume confirmation",
      condition: "Recent price movement is followed by rising relative volume",
      implication: "Conviction improves only if volume starts confirming the move rather than lagging it.",
      severity: "info",
      sourceWidget: volume.widgetId
    });
  }

  if (latestPrice !== null && conditions.length === 0) {
    conditions.push({
      id: "watch-confirmation",
      label: "Confirmation",
      condition: `${input.symbol} moves away from ${formatPrice(latestPrice)} with trend, momentum, and volume aligned`,
      implication: "The overview becomes more reliable when core widgets agree instead of splitting across mixed states.",
      severity: "info"
    });
  }

  return conditions.slice(0, 4);
}

function dataWarnings(input: SituationOverviewBuildInput, signals: NormalizedSignal[], missingInputs: string[], staleInputs: string[]) {
  const warnings: SituationDataWarning[] = [];

  if (input.marketOverview?.metrics.isStale) {
    warnings.push({
      id: "stale-market-overview",
      label: "Stale market overview",
      explanation: input.marketOverview.metrics.staleReason ?? "Stored candle data is older than expected.",
      severity: "warning"
    });
  }

  for (const widgetId of staleInputs.slice(0, 4)) {
    warnings.push({
      id: `stale-${widgetId}`,
      label: `${readableWidgetName(widgetId)} is stale`,
      explanation: "This source is older than expected for the selected timeframe and reduces confidence.",
      severity: "warning",
      sourceWidget: widgetId
    });
  }

  if (missingInputs.length > 0) {
    warnings.push({
      id: "missing-overview-inputs",
      label: "Partial overview",
      explanation: `Missing expected inputs: ${missingInputs.map(readableWidgetName).join(", ")}.`,
      severity: missingInputs.some((id) => PRIMARY_WIDGET_IDS.includes(id)) ? "warning" : "info"
    });
  }

  if (signals.some((signal) => signal.widget.widgetId === "liquidations")) {
    warnings.push({
      id: "liquidations-local-history",
      label: "Liquidation event history",
      explanation: "Binance liquidation events are locally observed while the runtime is connected, not complete historical truth.",
      severity: "info",
      sourceWidget: "liquidations"
    });
  }

  return warnings.slice(0, 6);
}

function sourceContribution(widgetId: string): SituationSourceWidget["contribution"] {
  if (PRIMARY_WIDGET_IDS.includes(widgetId)) {
    return "primary";
  }

  if (SECONDARY_WIDGET_IDS.includes(widgetId)) {
    return "secondary";
  }

  return "context";
}

function sourceWidgets(expectedWidgetIds: string[], signals: NormalizedSignal[]): SituationSourceWidget[] {
  const byId = new Map(signals.map((signal) => [signal.widget.widgetId, signal]));

  return sortByWidgetPriority(
    expectedWidgetIds.map((id) => {
      const signal = byId.get(id);
      const status: SituationSourceWidget["status"] = signal ? (signal.stale ? "stale" : "used") : "missing";

      return {
        widgetId: id,
        id,
        name: readableWidgetName(id),
        status,
        contribution: sourceContribution(id)
      };
    })
  ).map((entry) => {
    const { widgetId, ...item } = entry;
    void widgetId;
    return item;
  });
}

function topDrivers(signals: NormalizedSignal[], score: number): SituationDriver[] {
  const alignedDirection = score > 12 ? 1 : score < -12 ? -1 : 0;

  return signals
    .filter((signal) => signal.directionWeight > 0)
    .filter((signal) => signal.directionalFactor !== 0)
    .filter((signal) => alignedDirection === 0 || Math.sign(signal.directionalFactor) === alignedDirection)
    .sort((left, right) => {
      const leftImpact = Math.abs(left.directionalFactor) * left.directionWeight * left.widget.confidence;
      const rightImpact = Math.abs(right.directionalFactor) * right.directionWeight * right.widget.confidence;
      return rightImpact - leftImpact;
    })
    .slice(0, 5)
    .map((signal) => driverFromSignal(signal));
}

function conflicts(signals: NormalizedSignal[], score: number): SituationDriver[] {
  const coreSign = score > 18 ? 1 : score < -18 ? -1 : 0;
  const result: SituationDriver[] = [];

  for (const signal of signals) {
    const isOpposingCore = coreSign !== 0 && signal.directionalFactor !== 0 && Math.sign(signal.directionalFactor) !== coreSign;
    const isMixed = signal.direction === "mixed";

    if (isOpposingCore || isMixed) {
      result.push(driverFromSignal(signal, "conflict"));
    }
  }

  return result.slice(0, 5);
}

function changedSincePrevious(previous: SituationOverview | null | undefined, current: Omit<SituationOverview, "changedSincePrevious">): SituationChange[] {
  if (!previous) {
    return [];
  }

  const changes: SituationChange[] = [];

  if (previous.bias !== current.bias) {
    changes.push({
      id: "bias-change",
      label: "Bias changed",
      previous: previous.bias,
      current: current.bias,
      explanation: `Bias moved from ${previous.bias.replaceAll("_", " ")} to ${current.bias.replaceAll("_", " ")} as the weighted widget mix changed.`
    });
  }

  if (previous.riskLevel !== current.riskLevel) {
    changes.push({
      id: "risk-change",
      label: "Risk changed",
      previous: previous.riskLevel,
      current: current.riskLevel,
      explanation: `Risk moved from ${previous.riskLevel} to ${current.riskLevel} based on severity, conflicts, liquidity, and stale-data inputs.`
    });
  }

  if (Math.abs(previous.score - current.score) >= 15) {
    changes.push({
      id: "score-change",
      label: "Directional score moved",
      previous: String(previous.score),
      current: String(current.score),
      explanation: `Directional score changed by ${current.score - previous.score > 0 ? "+" : ""}${current.score - previous.score} points.`
    });
  }

  if (previous.confidence !== current.confidence) {
    changes.push({
      id: "confidence-change",
      label: "Confidence changed",
      previous: previous.confidence,
      current: current.confidence,
      explanation: `Confidence changed as signal agreement, missing inputs, or stale inputs changed.`
    });
  }

  const previousTopDriver = previous.mainDrivers[0]?.sourceWidget;
  const currentTopDriver = current.mainDrivers[0]?.sourceWidget;

  if (previousTopDriver && currentTopDriver && previousTopDriver !== currentTopDriver) {
    changes.push({
      id: "driver-change",
      label: "Main driver changed",
      previous: readableWidgetName(previousTopDriver),
      current: readableWidgetName(currentTopDriver),
      explanation: `${readableWidgetName(currentTopDriver)} is now the strongest source behind the overview.`
    });
  }

  return changes.slice(0, 5);
}

export function buildSituationOverview(input: SituationOverviewBuildInput): SituationOverview {
  const generatedAt = input.generatedAt ?? new Date();
  const allWidgets = [...input.widgets, ...(input.crossMarketWidgets ?? [])];
  const signals = normalizeSignals(allWidgets, input.timeframe, generatedAt);
  const expectedWidgetIds = input.expectedWidgetIds?.length
    ? input.expectedWidgetIds
    : [...PRIMARY_WIDGET_IDS, ...SECONDARY_WIDGET_IDS, ...CONTEXT_WIDGET_IDS];
  const presentIds = new Set(signals.map((signal) => signal.widget.widgetId));
  const missingInputs = expectedWidgetIds.filter((id) => !presentIds.has(id));
  const staleInputs = signals.filter((signal) => signal.stale).map((signal) => signal.widget.widgetId);
  const weightedSignals = signals.filter((signal) => signal.directionWeight > 0 && signal.directionalFactor !== 0);
  const totalWeight = weightedSignals.reduce((sum, signal) => sum + signal.directionWeight * effectiveConfidence(signal), 0);
  const weightedScore = weightedSignals.reduce((sum, signal) => {
    const impact = signal.directionalFactor * signal.directionWeight * effectiveConfidence(signal) * directionMagnitude(signal.widget);
    return sum + impact;
  }, 0);
  const score = totalWeight > 0 ? Math.round(clamp((weightedScore / totalWeight) * 100, -100, 100)) : 0;
  const conflictDrivers = conflicts(signals, score);
  const usedSignalCount = signals.filter((signal) => signal.direction !== "unknown").length;
  const bias = biasFromScore(score, conflictDrivers, usedSignalCount);
  const riskBase = signals.reduce((sum, signal) => sum + signal.riskContribution, 22);
  const riskScore = Math.round(
    clamp(
      riskBase +
        conflictDrivers.length * 5 +
        staleInputs.length * 5 +
        missingInputs.filter((id) => PRIMARY_WIDGET_IDS.includes(id)).length * 7 +
        (Math.abs(score) >= 65 ? 7 : 0),
      0,
      100
    )
  );
  const riskLevel = riskLevelFromScore(riskScore, signals.length > 0);
  const averageConfidence = signals.length > 0
    ? signals.reduce((sum, signal) => sum + signal.widget.confidence, 0) / signals.length
    : 0;
  const confidenceScore = clamp(
    averageConfidence -
      conflictDrivers.length * 0.08 -
      staleInputs.length * 0.06 -
      missingInputs.filter((id) => PRIMARY_WIDGET_IDS.includes(id)).length * 0.1,
    0,
    1
  );
  const confidence = confidenceFromScore(confidenceScore, usedSignalCount);
  let mainDrivers = topDrivers(signals, score);

  if (mainDrivers.length === 0 && signals.length > 0) {
    mainDrivers = signals
      .filter((signal) => signal.direction !== "unknown")
      .slice(0, 3)
      .map((signal) => driverFromSignal(signal));
  }

  const isPartial = missingInputs.length > 0 || staleInputs.length > 0 || input.marketOverview?.metrics.isStale === true;
  const overviewWithoutChanges: Omit<SituationOverview, "changedSincePrevious"> = {
    symbol: input.symbol,
    timeframe: input.timeframe,
    generatedAt: generatedAt.toISOString(),
    title: titleFor(bias, riskLevel),
    summary: summarizeSituation({
      symbol: input.symbol,
      timeframe: input.timeframe,
      bias,
      riskLevel,
      confidence,
      drivers: mainDrivers,
      conflicts: conflictDrivers,
      partial: isPartial
    }),
    bias,
    riskLevel,
    confidence,
    score,
    riskScore,
    mainDrivers,
    conflictingSignals: conflictDrivers,
    watchConditions: watchConditions(input, signals),
    dataWarnings: dataWarnings(input, signals, missingInputs, staleInputs),
    sourceWidgets: sourceWidgets(expectedWidgetIds, signals),
    meta: {
      missingInputs,
      staleInputs,
      usedFallbacks: input.marketOverview ? [] : ["market_overview_unavailable"],
      isPartial
    }
  };
  const changes = changedSincePrevious(input.previousOverview, overviewWithoutChanges);

  return {
    ...overviewWithoutChanges,
    summary: sentence(overviewWithoutChanges.summary),
    changedSincePrevious: changes
  };
}
