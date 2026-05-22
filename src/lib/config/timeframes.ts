export const defaultTimeframes = ["15m", "1h", "4h", "1d"] as const;

export type AppTimeframe = (typeof defaultTimeframes)[number];
