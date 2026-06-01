import { getDerivativesContext } from "../marketContext";
import { clamp, round } from "../phase1/helpers";
import type { SourceRef, WidgetContext, WidgetDerivativesContext, WidgetEngine, WidgetSeverity } from "../types";

const STALE_MS = 45 * 60 * 1000;

function pct(value: number | null | undefined, multiplier = 100) {
  return typeof value === "number" && Number.isFinite(value) ? round(value * multiplier, 4) : null;
}

function sourceRef(metrics: WidgetDerivativesContext | null, context: WidgetContext): SourceRef {
  return {
    source: metrics?.source ?? "binance_futures",
    type: "derivatives_metrics",
    symbol: context.symbol,
    timeframe: context.timeframe,
    updatedAt: metrics?.updatedAt ?? context.now.toISOString()
  };
}

function ageMinutes(updatedAt: string | null, now: Date) {
  if (!updatedAt) {
    return null;
  }

  const parsed = Date.parse(updatedAt);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return round(Math.max(0, now.getTime() - parsed) / 60_000, 1);
}

function severityFromRisk(riskScore: number): WidgetSeverity {
  if (riskScore >= 70) {
    return "high";
  }

  if (riskScore >= 45) {
    return "medium";
  }

  return "low";
}

export const derivativesPressureWidget: WidgetEngine = {
  id: "derivatives_pressure",
  name: "Derivatives Pressure",
  description: "Interprets public futures funding, open interest, long/short ratio, and basis context.",
  requiredInputs: ["marketContext.derivatives"],
  async run(context) {
    const symbol = context.symbol ?? "BTCUSDT";
    const timeframe = context.timeframe ?? "1h";
    const metrics = getDerivativesContext(context.marketContext, symbol, timeframe);

    if (!metrics) {
      return {
        widgetId: this.id,
        symbol: context.symbol,
        timeframe: context.timeframe,
        score: 50,
        direction: "unknown",
        confidence: 0.18,
        severity: "low",
        summary: `${symbol} derivatives context is not available yet.`,
        details: {
          reason: "No stored Binance USD-M futures derivatives metrics",
          expectedSource: "Binance USD-M Futures public REST endpoints",
          limitation: "Run the derivatives collector before using this signal."
        },
        sources: [sourceRef(null, context)],
        updatedAt: context.now.toISOString()
      };
    }

    if (metrics.storageError) {
      return {
        widgetId: this.id,
        symbol: context.symbol,
        timeframe: context.timeframe,
        score: 50,
        direction: "storage_error",
        confidence: 0.12,
        severity: "high",
        summary: `${symbol} derivatives metrics cannot be read right now.`,
        details: {
          reason: "Storage error while reading local derivatives metrics",
          error: metrics.storageError
        },
        sources: [sourceRef(metrics, context)],
        updatedAt: context.now.toISOString()
      };
    }

    const fundingRate = metrics.fundingRate ?? 0;
    const longShortRatio = metrics.longShortRatio ?? 1;
    const openInterestChangePct = metrics.openInterestChangePct ?? 0;
    const basisRate = metrics.basisRate ?? 0;
    const isStale = metrics.updatedAt ? context.now.getTime() - Date.parse(metrics.updatedAt) > STALE_MS : true;
    const crowdedLongs = fundingRate > 0.0005 || longShortRatio > 1.35;
    const crowdedShorts = fundingRate < -0.0002 || longShortRatio < 0.75;
    const oiExpanding = openInterestChangePct > 2;
    const oiContracting = openInterestChangePct < -2;
    const positiveBasis = basisRate > 0.001;
    const negativeBasis = basisRate < -0.001;
    const pressureScore = clamp(
      50 +
        clamp(fundingRate * 20_000, -18, 18) +
        clamp((longShortRatio - 1) * 28, -18, 18) +
        clamp(openInterestChangePct * 1.2, -12, 12) +
        clamp(basisRate * 8_000, -8, 8),
      0,
      100
    );
    const riskScore = clamp(
      Math.abs(pressureScore - 50) * 1.5 +
        (oiExpanding ? 14 : 0) +
        (crowdedLongs || crowdedShorts ? 16 : 0) +
        (isStale ? 12 : 0),
      0,
      100
    );
    const direction =
      crowdedLongs && oiExpanding
        ? "crowded_longs"
        : crowdedShorts && oiExpanding
          ? "crowded_shorts"
          : oiContracting
            ? "leverage_cooling"
            : positiveBasis
              ? "perp_premium"
              : negativeBasis
                ? "perp_discount"
                : "balanced";
    const confidence = round(
      clamp(0.28 + Math.min(metrics.sampleCount, 90) / 180 + (metrics.updatedAt ? 0.1 : 0) - (isStale ? 0.16 : 0), 0.18, 0.86),
      2
    );

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe: context.timeframe,
      score: Math.round(pressureScore),
      direction,
      confidence,
      severity: severityFromRisk(riskScore),
      summary:
        direction === "crowded_longs"
          ? `${symbol} futures positioning looks long-crowded as funding/long-short pressure rises with expanding open interest.`
          : direction === "crowded_shorts"
            ? `${symbol} futures positioning looks short-crowded as negative funding or short skew rises with expanding open interest.`
            : direction === "leverage_cooling"
              ? `${symbol} futures leverage appears to be cooling as open interest contracts.`
              : direction === "perp_premium"
                ? `${symbol} perpetuals trade at a positive basis, showing futures premium against spot index context.`
                : direction === "perp_discount"
                  ? `${symbol} perpetuals trade at a negative basis, showing futures discount against spot index context.`
                  : `${symbol} derivatives pressure is broadly balanced across funding, positioning, open interest, and basis.`,
      details: {
        period: metrics.period,
        updatedAt: metrics.updatedAt,
        ageMinutes: ageMinutes(metrics.updatedAt, context.now),
        isStale,
        fundingRate,
        fundingRatePct: pct(metrics.fundingRate),
        nextFundingTime: metrics.nextFundingTime ? new Date(metrics.nextFundingTime).toISOString() : null,
        markPrice: metrics.markPrice,
        indexPrice: metrics.indexPrice,
        openInterest: metrics.openInterest,
        openInterestValue: metrics.openInterestValue,
        openInterestChangePct: round(openInterestChangePct, 2),
        longShortRatio: metrics.longShortRatio,
        longAccountSharePct: pct(metrics.longAccount),
        shortAccountSharePct: pct(metrics.shortAccount),
        basis: metrics.basis,
        basisRatePct: pct(metrics.basisRate),
        annualizedBasisRatePct: pct(metrics.annualizedBasisRate),
        futuresPrice: metrics.futuresPrice,
        crowdedLongs,
        crowdedShorts,
        openInterestState: oiExpanding ? "expanding" : oiContracting ? "contracting" : "stable",
        riskScore: Math.round(riskScore),
        interpretation:
          "Derivatives pressure is contextual risk information. It can confirm, contradict, or increase risk around spot signals, but it is not a trade instruction.",
        limitation: "Uses Binance public USD-M futures snapshots/history and does not include account-specific positions."
      },
      sources: [sourceRef(metrics, context)],
      updatedAt: metrics.updatedAt ?? context.now.toISOString()
    };
  }
};
