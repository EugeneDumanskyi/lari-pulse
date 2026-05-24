export interface ReturnPoint {
  time: number;
  value: number;
}

export interface AlignedReturnPoint {
  time: number;
  left: number;
  right: number;
}

export interface RollingCorrelationPoint {
  time: number;
  value: number | null;
  sampleSize: number;
}

export interface VolatilityAdjustedMovement {
  latestReturn: number | null;
  meanReturn: number | null;
  volatility: number | null;
  zScore: number | null;
  sampleSize: number;
}

export interface ShortTermDivergence {
  leftCumulativeReturn: number | null;
  rightCumulativeReturn: number | null;
  spread: number | null;
  absSpread: number | null;
  direction: "left_outperforming" | "right_outperforming" | "aligned" | "insufficient_data";
  sampleSize: number;
}

export interface CorrelationPairConfig {
  id: string;
  leftSymbol: string;
  rightSymbol: string;
  label: string;
}

export interface CorrelationPairResult extends CorrelationPairConfig {
  timeframe: string;
  observations: number;
  latestCorrelation: number | null;
  rollingCorrelation: RollingCorrelationPoint[];
  divergence: ShortTermDivergence;
  leftVolatilityAdjustedMovement: VolatilityAdjustedMovement;
  rightVolatilityAdjustedMovement: VolatilityAdjustedMovement;
  updatedAt: string | null;
  warnings: string[];
}
