export const collectionTimeframes = ["15m", "1h", "4h", "1d"] as const;
export const derivedTimeframes = ["7d", "30d", "90d"] as const;
export const defaultTimeframes = [...collectionTimeframes, ...derivedTimeframes] as const;

export type AppTimeframe = (typeof defaultTimeframes)[number];

const derivedTimeframeDays: Partial<Record<AppTimeframe, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
};

export function derivedDaysForTimeframe(timeframe: string) {
  return derivedTimeframeDays[timeframe as AppTimeframe] ?? null;
}

export function sourceTimeframeForCollection(timeframe: string) {
  return derivedDaysForTimeframe(timeframe) ? "1d" : timeframe;
}
