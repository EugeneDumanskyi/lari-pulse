import type Database from "better-sqlite3";
import { canAccessSymbol, requireRole, type AuthSession } from "@/lib/auth/access";
import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getSituationOverview } from "@/lib/services/situationOverview/situationOverview.service";
import type {
  SituationBias,
  SituationConfidence,
  SituationDriverDirection,
  SituationOverview,
  SituationRiskLevel,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";
import { getWidgetCatalogItem, isKnownWidgetId } from "@/lib/widgets/catalog";
import { ApiInputError } from "./apiValidation";

export type ScanMatchMode = "all" | "any";

export type ScanOperator = "above" | "below";

/** The five ids `changedSincePrevious` can carry. */
export type SituationChangeId =
  | "bias-change"
  | "risk-change"
  | "score-change"
  | "confidence-change"
  | "driver-change";

export type ScanCondition =
  | { type: "bias"; in: SituationBias[] }
  | { type: "risk_level"; in: SituationRiskLevel[] }
  | { type: "confidence"; in: SituationConfidence[] }
  | { type: "score"; operator: ScanOperator; value: number }
  | { type: "risk_score"; operator: ScanOperator; value: number }
  | { type: "main_driver"; widgetIds: string[]; position?: "top" | "any" }
  | { type: "driver_direction"; widgetId: string; in: SituationDriverDirection[] }
  | {
      type: "watch_condition";
      state: "present" | "absent";
      ids?: string[];
      minimumSeverity?: SituationWatchCondition["severity"];
    }
  | { type: "conflicts"; state: "none" | "any" }
  | { type: "conflicts"; operator: ScanOperator; value: number }
  | { type: "freshness"; state: "fresh" | "any" }
  | { type: "changed"; ids: SituationChangeId[] };

export interface ScanFilter {
  match: ScanMatchMode;
  conditions: ScanCondition[];
}

export interface ScanConditionResult {
  id: string;
  type: ScanCondition["type"];
  label: string;
  actual: string;
}

export interface ScanMatch {
  matched: boolean;
  matchedConditions: ScanConditionResult[];
  unmatchedConditions: ScanConditionResult[];
}

export interface ScanResultItem {
  symbol: string;
  timeframe: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  score: number;
  riskScore: number;
  title: string;
  summary: string;
  matchedConditions: ScanConditionResult[];
  unmatchedConditions: ScanConditionResult[];
  updatedAt: string;
}

export interface ScanRunSummary {
  examinedPairs: number;
  matchedPairs: number;
  requestedPairs: number;
  pairsWithoutState: Array<{ symbol: string; timeframe: string }>;
  conditionSummary: Array<{
    id: string;
    type: ScanCondition["type"];
    label: string;
    matchedPairCount: number;
  }>;
  match: ScanMatchMode;
  generatedAt: string;
}

export interface ScanRunResponse {
  items: ScanResultItem[];
  summary: ScanRunSummary;
}

export interface RunScanOptions {
  session: AuthSession;
  filter: ScanFilter;
  symbols?: string[];
  timeframes?: string[];
  limit?: number;
  db?: Database.Database;
  now?: Date;
}

const defaultLimit = 50;
const maxLimit = 200;
const maxConditions = 12;

const biasValues: readonly SituationBias[] = [
  "strong_bullish",
  "bullish",
  "neutral",
  "bearish",
  "strong_bearish",
  "mixed",
  "unknown"
];

const riskLevelValues: readonly SituationRiskLevel[] = ["low", "moderate", "elevated", "high", "extreme", "unknown"];

const confidenceValues: readonly SituationConfidence[] = ["low", "medium", "high"];

const driverDirectionValues: readonly SituationDriverDirection[] = [
  "bullish",
  "bearish",
  "neutral",
  "mixed",
  "risk_on",
  "risk_off",
  "unknown"
];

const changeIdValues: readonly SituationChangeId[] = [
  "bias-change",
  "risk-change",
  "score-change",
  "confidence-change",
  "driver-change"
];

const severityRank: Record<SituationWatchCondition["severity"], number> = {
  info: 1,
  warning: 2,
  critical: 3
};

const changeIdNames: Record<SituationChangeId, string> = {
  "bias-change": "bias",
  "risk-change": "risk",
  "score-change": "directional score",
  "confidence-change": "confidence",
  "driver-change": "main driver"
};

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function widgetName(widgetId: string) {
  return getWidgetCatalogItem(widgetId)?.title ?? readable(widgetId);
}

function joinOr(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function article(word: string) {
  return "aeiou".includes(word[0]?.toLowerCase() ?? "") ? "An" : "A";
}

function pluralize(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/* ---------------------------------------------------------------- parsing */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  type: string
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiInputError(`${type} condition requires a non-empty ${field} array`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string" || !(allowed as readonly string[]).includes(entry)) {
      throw new ApiInputError(`Unsupported ${type} value: ${String(entry)}`);
    }

    return entry as T;
  });
}

function parseOperator(value: unknown, type: string): ScanOperator {
  if (value !== "above" && value !== "below") {
    throw new ApiInputError(`${type} condition requires operator "above" or "below"`);
  }

  return value;
}

function parseBoundedNumber(value: unknown, minimum: number, maximum: number, type: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiInputError(`${type} condition requires a finite numeric value`);
  }

  if (value < minimum || value > maximum) {
    throw new ApiInputError(`${type} value must be from ${minimum} to ${maximum}`);
  }

  return value;
}

/**
 * Widget ids validate against the catalog and not `widgetRegistry`: the
 * cross-market widgets that appear as drivers are catalog-only, so the
 * registry would reject a driver the overview genuinely reports.
 */
function parseWidgetId(value: unknown, type: string) {
  if (typeof value !== "string" || !isKnownWidgetId(value.trim())) {
    throw new ApiInputError(`Unsupported widgetId in ${type}: ${String(value)}`);
  }

  return value.trim();
}

function parseStringArray(value: unknown, field: string, type: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiInputError(`${type} condition requires a non-empty ${field} array`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new ApiInputError(`${type} condition requires string entries in ${field}`);
    }

    return entry.trim();
  });
}

function parseCondition(value: unknown): ScanCondition {
  if (!isRecord(value)) {
    throw new ApiInputError("Each condition must be an object");
  }

  const type = value.type;

  switch (type) {
    case "bias":
      return { type, in: parseEnumArray(value.in, biasValues, "in", type) };
    case "risk_level":
      return { type, in: parseEnumArray(value.in, riskLevelValues, "in", type) };
    case "confidence":
      return { type, in: parseEnumArray(value.in, confidenceValues, "in", type) };
    case "score":
      return {
        type,
        operator: parseOperator(value.operator, type),
        value: parseBoundedNumber(value.value, -100, 100, type)
      };
    case "risk_score":
      return {
        type,
        operator: parseOperator(value.operator, type),
        value: parseBoundedNumber(value.value, 0, 100, type)
      };
    case "main_driver": {
      if (value.position !== undefined && value.position !== "top" && value.position !== "any") {
        throw new ApiInputError(`Unsupported main_driver position: ${String(value.position)}`);
      }

      if (!Array.isArray(value.widgetIds) || value.widgetIds.length === 0) {
        throw new ApiInputError("main_driver condition requires a non-empty widgetIds array");
      }

      return {
        type,
        widgetIds: value.widgetIds.map((entry) => parseWidgetId(entry, type)),
        position: value.position ?? "any"
      };
    }
    case "driver_direction":
      return {
        type,
        widgetId: parseWidgetId(value.widgetId, type),
        in: parseEnumArray(value.in, driverDirectionValues, "in", type)
      };
    case "watch_condition": {
      if (value.state !== "present" && value.state !== "absent") {
        throw new ApiInputError(`Unsupported watch_condition state: ${String(value.state)}`);
      }

      if (
        value.minimumSeverity !== undefined &&
        value.minimumSeverity !== "info" &&
        value.minimumSeverity !== "warning" &&
        value.minimumSeverity !== "critical"
      ) {
        throw new ApiInputError(`Unsupported watch_condition minimumSeverity: ${String(value.minimumSeverity)}`);
      }

      const condition: Extract<ScanCondition, { type: "watch_condition" }> = { type, state: value.state };

      if (value.ids !== undefined) {
        condition.ids = parseStringArray(value.ids, "ids", type);
      }

      if (value.minimumSeverity !== undefined) {
        condition.minimumSeverity = value.minimumSeverity;
      }

      return condition;
    }
    case "conflicts": {
      if (value.state !== undefined) {
        if (value.state !== "none" && value.state !== "any") {
          throw new ApiInputError(`Unsupported conflicts state: ${String(value.state)}`);
        }

        return { type, state: value.state };
      }

      return {
        type,
        operator: parseOperator(value.operator, type),
        value: parseBoundedNumber(value.value, 0, 100, type)
      };
    }
    case "freshness": {
      if (value.state !== "fresh" && value.state !== "any") {
        throw new ApiInputError(`Unsupported freshness state: ${String(value.state)}`);
      }

      return { type, state: value.state };
    }
    case "changed":
      return { type, ids: parseEnumArray(value.ids, changeIdValues, "ids", type) };
    default:
      throw new ApiInputError(`Unsupported condition type: ${String(type)}`);
  }
}

/** Validates and normalises a filter; the only shape `runScan` accepts. */
export function parseScanFilter(value: unknown): ScanFilter {
  if (!isRecord(value)) {
    throw new ApiInputError("filter must be an object");
  }

  if (value.match !== undefined && value.match !== "all" && value.match !== "any") {
    throw new ApiInputError(`Unsupported match: ${String(value.match)}`);
  }

  if (!Array.isArray(value.conditions)) {
    throw new ApiInputError("filter requires a conditions array");
  }

  if (value.conditions.length === 0) {
    throw new ApiInputError("filter requires at least one condition");
  }

  if (value.conditions.length > maxConditions) {
    throw new ApiInputError(`filter accepts at most ${maxConditions} conditions`);
  }

  return {
    match: value.match ?? "all",
    conditions: value.conditions.map((condition) => parseCondition(condition))
  };
}

/* -------------------------------------------------------------- labelling */

/** Built from the condition's own parameters only, never from the pair. */
function conditionLabel(condition: ScanCondition): string {
  switch (condition.type) {
    case "bias":
      return `Bias is ${joinOr(condition.in.map(readable))}`;
    case "risk_level":
      return `Risk level is ${joinOr(condition.in.map(readable))}`;
    case "confidence":
      return `Confidence is ${joinOr(condition.in.map(readable))}`;
    case "score":
      return `Directional score is ${condition.operator} ${condition.value}`;
    case "risk_score":
      return `Risk score is ${condition.operator} ${condition.value}`;
    case "main_driver": {
      const names = joinOr(condition.widgetIds.map(widgetName));
      return condition.position === "top"
        ? `${names} is the top main driver`
        : `${names} is a main driver`;
    }
    case "driver_direction":
      return `${widgetName(condition.widgetId)} points ${joinOr(condition.in.map(readable))}`;
    case "watch_condition": {
      const severity = condition.minimumSeverity;
      const subject = severity
        ? `${article(severity)} ${severity} or higher watch condition`
        : "Any watch condition";
      const scoped = condition.ids ? `${subject} from ${joinOr(condition.ids)}` : subject;
      return `${scoped} is ${condition.state}`;
    }
    case "conflicts": {
      if ("state" in condition) {
        return condition.state === "none" ? "No conflicting signals" : "At least one conflicting signal";
      }

      return `Conflicting signals are ${condition.operator} ${condition.value}`;
    }
    case "freshness":
      return condition.state === "fresh" ? "State is fresh" : "Freshness is not checked";
    case "changed":
      return `${capitalize(joinOr(condition.ids.map((id) => changeIdNames[id])))} changed since the previous snapshot`;
  }
}

function mainDriverName(overview: SituationOverview, index: number) {
  const driver = overview.mainDrivers[index];

  if (!driver) {
    return null;
  }

  return driver.sourceWidget ? widgetName(driver.sourceWidget) : driver.label;
}

function filteredWatchConditions(
  condition: Extract<ScanCondition, { type: "watch_condition" }>,
  overview: SituationOverview
) {
  return overview.watchConditions.filter((entry) => {
    if (condition.ids && !condition.ids.includes(entry.id)) {
      return false;
    }

    if (condition.minimumSeverity && severityRank[entry.severity] < severityRank[condition.minimumSeverity]) {
      return false;
    }

    return true;
  });
}

/** The value found on this pair, as a short string. */
function conditionActual(condition: ScanCondition, overview: SituationOverview): string {
  switch (condition.type) {
    case "bias":
      return readable(overview.bias);
    case "risk_level":
      return readable(overview.riskLevel);
    case "confidence":
      return readable(overview.confidence);
    case "score":
      return `score ${overview.score}`;
    case "risk_score":
      return `risk score ${overview.riskScore}`;
    case "main_driver": {
      if (overview.mainDrivers.length === 0) {
        return "no main drivers";
      }

      if (condition.position === "top") {
        return mainDriverName(overview, 0) ?? "no main drivers";
      }

      return overview.mainDrivers
        .map((_, index) => mainDriverName(overview, index))
        .filter((name): name is string => Boolean(name))
        .join(", ");
    }
    case "driver_direction": {
      const driver = overview.mainDrivers.find((entry) => entry.sourceWidget === condition.widgetId);
      return driver ? readable(driver.direction) : "no driver";
    }
    case "watch_condition": {
      const matching = filteredWatchConditions(condition, overview);
      return matching.length === 0 ? "none" : matching.map((entry) => entry.label).join(", ");
    }
    case "conflicts":
      return pluralize(overview.conflictingSignals.length, "conflicting signal");
    case "freshness": {
      const parts: string[] = [];

      if (overview.meta.isPartial) {
        parts.push("partial");
      }

      if (overview.meta.staleInputs.length > 0) {
        parts.push(pluralize(overview.meta.staleInputs.length, "stale input"));
      }

      return parts.length === 0 ? "fresh" : parts.join(", ");
    }
    case "changed": {
      const changes = overview.changedSincePrevious ?? [];

      if (changes.length === 0) {
        return "no recorded change";
      }

      return changes
        .map((change) => changeIdNames[change.id as SituationChangeId] ?? change.label)
        .join(", ");
    }
  }
}

/* ------------------------------------------------------------- evaluation */

function conditionMatches(condition: ScanCondition, overview: SituationOverview): boolean {
  switch (condition.type) {
    case "bias":
      return condition.in.includes(overview.bias);
    case "risk_level":
      return condition.in.includes(overview.riskLevel);
    case "confidence":
      return condition.in.includes(overview.confidence);
    case "score":
      return condition.operator === "above" ? overview.score > condition.value : overview.score < condition.value;
    case "risk_score":
      return condition.operator === "above"
        ? overview.riskScore > condition.value
        : overview.riskScore < condition.value;
    case "main_driver": {
      const drivers = condition.position === "top" ? overview.mainDrivers.slice(0, 1) : overview.mainDrivers;
      return drivers.some((driver) => driver.sourceWidget !== undefined && condition.widgetIds.includes(driver.sourceWidget));
    }
    case "driver_direction": {
      const driver = overview.mainDrivers.find((entry) => entry.sourceWidget === condition.widgetId);
      return driver !== undefined && condition.in.includes(driver.direction);
    }
    case "watch_condition": {
      const matching = filteredWatchConditions(condition, overview);
      return condition.state === "present" ? matching.length > 0 : matching.length === 0;
    }
    case "conflicts": {
      const count = overview.conflictingSignals.length;

      if ("state" in condition) {
        return condition.state === "none" ? count === 0 : count > 0;
      }

      return condition.operator === "above" ? count > condition.value : count < condition.value;
    }
    case "freshness":
      return condition.state === "any" || (!overview.meta.isPartial && overview.meta.staleInputs.length === 0);
    case "changed": {
      const changes = overview.changedSincePrevious ?? [];
      return changes.some((change) => (condition.ids as string[]).includes(change.id));
    }
  }
}

/** Pure: an overview in, a match out. No database, no session, no clock. */
export function evaluateScanFilter(filter: ScanFilter, overview: SituationOverview): ScanMatch {
  const matchedConditions: ScanConditionResult[] = [];
  const unmatchedConditions: ScanConditionResult[] = [];

  filter.conditions.forEach((condition, index) => {
    const result: ScanConditionResult = {
      id: `c${index}`,
      type: condition.type,
      label: conditionLabel(condition),
      actual: conditionActual(condition, overview)
    };

    if (conditionMatches(condition, overview)) {
      matchedConditions.push(result);
    } else {
      unmatchedConditions.push(result);
    }
  });

  const matched = filter.match === "all" ? unmatchedConditions.length === 0 : matchedConditions.length > 0;

  return {
    matched,
    matchedConditions,
    // Under `all` a listed pair satisfied every condition, so the unmatched
    // list is only meaningful for a pair that is in the result set at all.
    unmatchedConditions
  };
}

/* ------------------------------------------------------------------- scan */

function ensureDatabase(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
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

/** Timeframes come back in `collectionTimeframes` order, not the requested one. */
function normalizeTimeframes(timeframes?: string[]) {
  if (!timeframes || timeframes.length === 0) {
    return [...collectionTimeframes];
  }

  const requested = new Set(timeframes.map((timeframe) => timeframe.trim()));

  return collectionTimeframes.filter((timeframe) => requested.has(timeframe));
}

/**
 * A pair has state when one of its pair-scoped source widgets carried data.
 * `liquidations` is excluded: `listLatestWidgetResultsWithDerivedLiquidity`
 * synthesizes a liquidations result for every pair on every read, so counting
 * it would make every configured pair examined and leave `pairsWithoutState`
 * permanently empty.
 */
const alwaysDerivedWidgetId = "liquidations";

function hasPairState(overview: SituationOverview) {
  return overview.sourceWidgets.some(
    (widget) =>
      widget.contribution !== "context" &&
      widget.id !== alwaysDerivedWidgetId &&
      (widget.status === "used" || widget.status === "stale")
  );
}

export async function runScan(options: RunScanOptions): Promise<ScanRunResponse> {
  requireRole(options.session, "viewer");

  const db = ensureDatabase(options.db);
  const now = options.now ?? new Date();
  const symbols = normalizeSymbols(options.session, options.symbols);
  const timeframes = normalizeTimeframes(options.timeframes);
  const limit = Math.min(Math.max(options.limit ?? defaultLimit, 1), maxLimit);
  const { filter } = options;

  const conditionCounts = filter.conditions.map(() => 0);
  const pairsWithoutState: Array<{ symbol: string; timeframe: string }> = [];
  const items: ScanResultItem[] = [];
  let examinedPairs = 0;

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

      if (!hasPairState(overview)) {
        pairsWithoutState.push({ symbol, timeframe });
        continue;
      }

      examinedPairs += 1;
      const match = evaluateScanFilter(filter, overview);

      for (const condition of match.matchedConditions) {
        const index = Number(condition.id.slice(1));
        conditionCounts[index] = (conditionCounts[index] ?? 0) + 1;
      }

      if (!match.matched) {
        continue;
      }

      items.push({
        symbol: overview.symbol,
        timeframe: overview.timeframe,
        bias: overview.bias,
        riskLevel: overview.riskLevel,
        confidence: overview.confidence,
        score: overview.score,
        riskScore: overview.riskScore,
        title: overview.title,
        summary: overview.summary,
        matchedConditions: match.matchedConditions,
        unmatchedConditions: match.unmatchedConditions,
        updatedAt: overview.generatedAt
      });
    }
  }

  return {
    items: items.slice(0, limit),
    summary: {
      examinedPairs,
      matchedPairs: items.length,
      requestedPairs: symbols.length * timeframes.length,
      pairsWithoutState,
      conditionSummary: filter.conditions.map((condition, index) => ({
        id: `c${index}`,
        type: condition.type,
        label: conditionLabel(condition),
        matchedPairCount: conditionCounts[index] ?? 0
      })),
      match: filter.match,
      generatedAt: now.toISOString()
    }
  };
}
