import type { IndicatorCandle } from "./types";

export interface PriceZone {
  price: number;
  touches: number;
  distancePct: number;
}

export interface SupportResistanceResult {
  currentPrice: number | null;
  support: PriceZone | null;
  resistance: PriceZone | null;
  swingSupports: PriceZone[];
  swingResistances: PriceZone[];
}

function zoneDistancePct(price: number, currentPrice: number) {
  if (currentPrice === 0) {
    return 0;
  }

  return ((price - currentPrice) / currentPrice) * 100;
}

function clusterLevels(levels: number[], currentPrice: number, tolerancePct: number): PriceZone[] {
  const sorted = [...levels].sort((a, b) => a - b);
  const zones: PriceZone[] = [];

  for (const level of sorted) {
    const existing = zones.find((zone) => {
      if (zone.price === 0) {
        return level === 0;
      }

      return Math.abs((level - zone.price) / zone.price) <= tolerancePct;
    });

    if (existing) {
      existing.price = (existing.price * existing.touches + level) / (existing.touches + 1);
      existing.touches += 1;
      existing.distancePct = zoneDistancePct(existing.price, currentPrice);
    } else {
      zones.push({
        price: level,
        touches: 1,
        distancePct: zoneDistancePct(level, currentPrice)
      });
    }
  }

  return zones.sort((a, b) => {
    if (b.touches !== a.touches) {
      return b.touches - a.touches;
    }

    return Math.abs(a.distancePct) - Math.abs(b.distancePct);
  });
}

export function supportResistance(
  candles: IndicatorCandle[],
  lookback = 80,
  swingRadius = 2,
  tolerancePct = 0.003
): SupportResistanceResult {
  if (!Number.isInteger(lookback) || lookback <= 0) {
    throw new Error("Support/resistance lookback must be a positive integer");
  }

  if (!Number.isInteger(swingRadius) || swingRadius <= 0) {
    throw new Error("Support/resistance swing radius must be a positive integer");
  }

  if (tolerancePct < 0) {
    throw new Error("Support/resistance tolerance cannot be negative");
  }

  if (candles.length === 0) {
    return {
      currentPrice: null,
      support: null,
      resistance: null,
      swingSupports: [],
      swingResistances: []
    };
  }

  const sample = candles.slice(-lookback);
  const currentPrice = sample.at(-1)!.close;
  const supportLevels: number[] = [];
  const resistanceLevels: number[] = [];

  for (let index = swingRadius; index < sample.length - swingRadius; index += 1) {
    const window = sample.slice(index - swingRadius, index + swingRadius + 1);
    const candle = sample[index];
    const isSwingLow = window.every((item) => candle.low <= item.low);
    const isSwingHigh = window.every((item) => candle.high >= item.high);

    if (isSwingLow) {
      supportLevels.push(candle.low);
    }

    if (isSwingHigh) {
      resistanceLevels.push(candle.high);
    }
  }

  const swingSupports = clusterLevels(supportLevels, currentPrice, tolerancePct);
  const swingResistances = clusterLevels(resistanceLevels, currentPrice, tolerancePct);
  const support = swingSupports
    .filter((zone) => zone.price <= currentPrice)
    .sort((a, b) => b.price - a.price)[0] ?? null;
  const resistance = swingResistances
    .filter((zone) => zone.price >= currentPrice)
    .sort((a, b) => a.price - b.price)[0] ?? null;

  return {
    currentPrice,
    support,
    resistance,
    swingSupports,
    swingResistances
  };
}
