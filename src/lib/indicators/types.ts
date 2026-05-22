export interface IndicatorCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleNumericField = "open" | "high" | "low" | "close" | "volume";

export interface IndicatorPoint {
  time: number;
  value: number | null;
}

export type SignalDirection = "rising" | "falling" | "stable" | "insufficient_data";
