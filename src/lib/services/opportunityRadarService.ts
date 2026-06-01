import type Database from "better-sqlite3";
import { canAccessSymbol, type AuthSession } from "@/lib/auth/access";
import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getSituationOverview } from "@/lib/services/situationOverview/situationOverview.service";
import type {
  SituationBias,
  SituationConfidence,
  SituationDriver,
  SituationOverview,
  SituationRiskLevel,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";

export interface OpportunityRadarItem {
  symbol: string;
  timeframe: string;
  rank: number;
  setupScore: number;
  attentionScore: number;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  primaryReason: string;
  topDrivers: SituationDriver[];
  blockingRisks: string[];
  watchConditions: SituationWatchCondition[];
  updatedAt: string;
}

export interface OpportunityRadarResponse {
  items: OpportunityRadarItem[];
  scannedSymbols: string[];
  scannedTimeframes: string[];
  generatedAt: string;
  sessionPlan: AuthSession["plan"];
}

export interface GetOpportunityRadarOptions {
  session: AuthSession;
  symbols?: string[];
  timeframes?: string[];
  limit?: number;
  db?: Database.Database;
  now?: Date;
}

const defaultLimit = 20;
const maxLimit = 50;

const biasScore: Record<SituationBias, number> = {
  strong_bullish: 28,
  bullish: 20,
  neutral: 6,
  mixed: 2,
  bearish: 12,
  strong_bearish: 18,
  unknown: 0
};

const riskPenalty: Record<SituationRiskLevel, number> = {
  low: 0,
  moderate: 6,
  elevated: 14,
  high: 24,
  extreme: 36,
  unknown: 10
};

const confidenceBonus: Record<SituationConfidence, number> = {
  high: 14,
  medium: 7,
  low: 0
};

const timeframeBonus: Record<string, number> = {
  "15m": 1,
  "1h": 4,
  "4h": 6,
  "1d": 5
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isDirectionallyUseful(bias: SituationBias) {
  return bias === "strong_bullish" || bias === "bullish" || bias === "bearish" || bias === "strong_bearish";
}

function stalePenalty(overview: SituationOverview) {
  let penalty = 0;

  if (overview.meta.isPartial) {
    penalty += 12;
  }

  penalty += Math.min(18, overview.meta.missingInputs.length * 4);
  penalty += Math.min(12, overview.meta.staleInputs.length * 3);
  penalty += overview.dataWarnings.filter((warning) => warning.severity !== "info").length * 4;

  return penalty;
}

function blockingRisksFromOverview(overview: SituationOverview) {
  const risks = [
    ...overview.conflictingSignals.map((signal) => signal.label),
    ...overview.dataWarnings
      .filter((warning) => warning.severity !== "info")
      .map((warning) => warning.label),
    ...overview.watchConditions
      .filter((condition) => condition.severity !== "info")
      .map((condition) => condition.label)
  ];

  return uniqueValues(risks).slice(0, 5);
}

export function scoreOpportunityOverview(overview: SituationOverview) {
  const normalizedSignalScore = Math.abs(overview.score - 50) * 0.45;
  const directionalBonus = isDirectionallyUseful(overview.bias) ? biasScore[overview.bias] : biasScore[overview.bias];
  const freshChangeBonus = Math.min(12, (overview.changedSincePrevious?.length ?? 0) * 4);
  const driverBonus = Math.min(10, overview.mainDrivers.filter((driver) => driver.strength === "high").length * 5);
  const watchBonus = Math.min(8, overview.watchConditions.filter((condition) => condition.severity !== "critical").length * 2);
  const conflictsPenalty = Math.min(18, overview.conflictingSignals.length * 5);
  const score =
    22 +
    directionalBonus +
    normalizedSignalScore +
    confidenceBonus[overview.confidence] +
    freshChangeBonus +
    driverBonus +
    watchBonus +
    (timeframeBonus[overview.timeframe] ?? 0) -
    riskPenalty[overview.riskLevel] -
    conflictsPenalty -
    stalePenalty(overview);

  return clampScore(score);
}

function scoreAttention(overview: SituationOverview) {
  const riskAttention = {
    low: 2,
    moderate: 8,
    elevated: 18,
    high: 26,
    extreme: 34,
    unknown: 8
  } satisfies Record<SituationRiskLevel, number>;

  return clampScore(
    18 +
    Math.abs(overview.score - 50) * 0.35 +
    riskAttention[overview.riskLevel] +
    Math.min(18, (overview.changedSincePrevious?.length ?? 0) * 6) +
    Math.min(16, overview.watchConditions.length * 4) +
    Math.min(12, overview.conflictingSignals.length * 4)
  );
}

function primaryReason(overview: SituationOverview, setupScore: number) {
  const topDriver = overview.mainDrivers[0];

  if (topDriver) {
    return `${topDriver.label}: ${topDriver.explanation}`;
  }

  if (overview.watchConditions[0]) {
    return overview.watchConditions[0].implication;
  }

  return setupScore >= 60 ? overview.summary : "No strong setup yet; current inputs remain mixed or incomplete.";
}

function itemFromOverview(overview: SituationOverview): Omit<OpportunityRadarItem, "rank"> {
  const setupScore = scoreOpportunityOverview(overview);

  return {
    symbol: overview.symbol,
    timeframe: overview.timeframe,
    setupScore,
    attentionScore: scoreAttention(overview),
    bias: overview.bias,
    riskLevel: overview.riskLevel,
    confidence: overview.confidence,
    primaryReason: primaryReason(overview, setupScore),
    topDrivers: overview.mainDrivers.slice(0, 3),
    blockingRisks: blockingRisksFromOverview(overview),
    watchConditions: overview.watchConditions.slice(0, 3),
    updatedAt: overview.generatedAt
  };
}

function defaultSymbolsForSession(session: AuthSession) {
  return appConfig.symbols
    .filter((symbol) => symbol.isActive)
    .map((symbol) => symbol.symbol)
    .filter((symbol) => canAccessSymbol(session, symbol));
}

function normalizeSymbols(session: AuthSession, symbols?: string[]) {
  const configured = new Set(appConfig.symbols.filter((symbol) => symbol.isActive).map((symbol) => symbol.symbol));
  const requested = symbols && symbols.length > 0 ? symbols : defaultSymbolsForSession(session);

  return uniqueValues(
    requested
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => configured.has(symbol) && canAccessSymbol(session, symbol))
  );
}

function normalizeTimeframes(timeframes?: string[]) {
  const allowed = new Set(collectionTimeframes);
  const requested = timeframes && timeframes.length > 0 ? timeframes : [...collectionTimeframes];

  return uniqueValues(requested.map((timeframe) => timeframe.trim()).filter((timeframe) => allowed.has(timeframe as typeof collectionTimeframes[number])));
}

export async function getOpportunityRadar(options: GetOpportunityRadarOptions): Promise<OpportunityRadarResponse> {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const symbols = normalizeSymbols(options.session, options.symbols);
  const timeframes = normalizeTimeframes(options.timeframes);
  const limit = Math.min(Math.max(options.limit ?? defaultLimit, 1), maxLimit);
  const items: OpportunityRadarItem[] = [];

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      const overview = await getSituationOverview({
        symbol,
        timeframe,
        session: options.session,
        db,
        now,
        evaluateAlerts: false
      });

      items.push({
        ...itemFromOverview(overview),
        rank: 0
      });
    }
  }

  const ranked = items
    .sort((left, right) =>
      right.setupScore - left.setupScore ||
      right.attentionScore - left.attentionScore ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.symbol.localeCompare(right.symbol)
    )
    .slice(0, limit)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));

  return {
    items: ranked,
    scannedSymbols: symbols,
    scannedTimeframes: timeframes,
    generatedAt: now.toISOString(),
    sessionPlan: options.session.plan
  };
}
