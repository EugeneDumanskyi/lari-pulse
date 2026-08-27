import {
  candleStructure,
  supportResistance
} from "@/lib/indicators";
import type { WidgetEngine } from "../types";
import {
  clamp,
  confidenceFromData,
  getSourceRefs,
  insufficientDataResult,
  latestUpdatedAt,
  round,
  severityFromScore
} from "./helpers";

export const supportResistanceWidget: WidgetEngine = {
  id: "support_resistance_pressure",
  name: "Support / Resistance Pressure",
  description: "Estimates nearby swing zones and evaluates pressure around support or resistance.",
  requiredInputs: ["candles"],
  async run(context) {
    const candles = context.candles ?? [];

    if (candles.length < 20) {
      return insufficientDataResult(this.id, context, "Support/resistance pressure needs at least 20 candles");
    }

    const zones = supportResistance(candles, 80, 2, 0.004);
    const structure = candleStructure(candles, 5);
    const currentPrice = zones.currentPrice!;
    const supportDistance = zones.support ? Math.abs(zones.support.distancePct) : null;
    const resistanceDistance = zones.resistance ? Math.abs(zones.resistance.distancePct) : null;
    const nearestDistance = Math.min(supportDistance ?? Number.POSITIVE_INFINITY, resistanceDistance ?? Number.POSITIVE_INFINITY);
    const nearThresholdPct = 1.2;
    let direction = "range_middle";

    if (resistanceDistance !== null && resistanceDistance <= nearThresholdPct) {
      direction = structure.features.includes("large_body") ? "breakout_watch" : "near_resistance";
    } else if (supportDistance !== null && supportDistance <= nearThresholdPct) {
      direction = structure.features.includes("large_body") ? "breakdown_watch" : "near_support";
    }

    const pressure = Number.isFinite(nearestDistance)
      ? clamp(100 - (nearestDistance / 4) * 100, 0, 100)
      : 35;
    const score = Math.round(direction === "near_support" || direction === "breakout_watch" ? 55 + pressure * 0.35 : direction === "near_resistance" || direction === "breakdown_watch" ? 45 - pressure * 0.25 : 50);
    const confidence = round(
      clamp(
        confidenceFromData(candles, 80) +
          ((zones.support?.touches ?? 0) + (zones.resistance?.touches ?? 0)) * 0.03,
        0.2,
        0.88
      ),
      2
    );

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe: context.timeframe,
      score: clamp(score, 0, 100),
      direction,
      confidence,
      severity: severityFromScore(score),
      summary: `${context.symbol ?? "Asset"} is ${direction.replaceAll("_", " ")} around recent swing zones.`,
      details: {
        currentPrice,
        nearestSupport: zones.support,
        nearestResistance: zones.resistance,
        supportDistancePct: supportDistance === null ? null : round(supportDistance),
        resistanceDistancePct: resistanceDistance === null ? null : round(resistanceDistance),
        swingSupportCount: zones.swingSupports.length,
        swingResistanceCount: zones.swingResistances.length,
        candleStructure: structure.primary
      },
      sources: getSourceRefs(context, candles),
      updatedAt: latestUpdatedAt(context, candles)
    };
  }
};
