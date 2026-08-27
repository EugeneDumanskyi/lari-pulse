import type Database from "better-sqlite3";
import { requireUser, type AuthSession } from "@/lib/auth/access";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  acknowledgeAlertEvent,
  deleteAlertRule,
  findOpenAlertEvent,
  getAlertEventById,
  getAlertRuleById,
  insertAlertEvent,
  insertAlertRule,
  listAlertEvents,
  listAlertRules,
  updateAlertRule
} from "@/lib/db/repositories/alertRepository";
import type {
  AlertEventRecord,
  AlertRuleRecord,
  AlertRuleType,
  AlertSeverity,
  NewAlertRule
} from "@/lib/db/types";
import { ApiInputError } from "@/lib/services/apiValidation";
import type { SituationOverview } from "@/lib/services/situationOverview/situationOverview.types";

export type AlertThresholdDirection = "above" | "below";

export interface AlertRuleApi {
  id: number;
  ruleType: AlertRuleType;
  symbol: string;
  timeframe: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  isEnabled: boolean;
  widgetId: string | null;
  watchConditionId: string | null;
  thresholdValue: number | null;
  thresholdDirection: AlertThresholdDirection | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEventApi {
  id: number;
  ruleId: number;
  symbol: string;
  timeframe: string;
  triggerKey: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  explanation: string;
  sourceWidget: string | null;
  overviewId: number | null;
  metadata: Record<string, unknown>;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRuleInput {
  ruleType: AlertRuleType;
  symbol: string;
  timeframe: string;
  title?: string;
  description?: string;
  severity?: AlertSeverity;
  isEnabled?: boolean;
  widgetId?: string | null;
  watchConditionId?: string | null;
  thresholdValue?: number | null;
  thresholdDirection?: AlertThresholdDirection | null;
}

interface EvaluateAlertRulesOptions {
  db?: Database.Database;
  overview: SituationOverview;
  previousOverview?: SituationOverview | null;
  overviewId?: number | null;
}

const allowedRuleTypes = new Set<AlertRuleType>([
  "situation_bias_changed",
  "risk_level_changed",
  "watch_condition_appeared",
  "widget_direction_changed",
  "score_crossed_threshold"
]);

const allowedSeverities = new Set<AlertSeverity>(["info", "warning", "critical"]);

function ensureDatabase(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toRuleApi(rule: AlertRuleRecord): AlertRuleApi {
  const { userId: _userId, ...api } = rule;
  return api;
}

function toEventApi(event: AlertEventRecord): AlertEventApi {
  const { userId: _userId, metadataJson, ...api } = event;
  return {
    ...api,
    metadata: parseMetadata(metadataJson)
  };
}

function defaultTitle(ruleType: AlertRuleType) {
  if (ruleType === "situation_bias_changed") {
    return "Situation bias changed";
  }

  if (ruleType === "risk_level_changed") {
    return "Risk level changed";
  }

  if (ruleType === "watch_condition_appeared") {
    return "Watch condition appeared";
  }

  if (ruleType === "widget_direction_changed") {
    return "Main widget driver changed";
  }

  return "Situation score crossed threshold";
}

function defaultDescription(input: AlertRuleInput) {
  if (input.ruleType === "score_crossed_threshold") {
    const direction = input.thresholdDirection ?? "above";
    const value = input.thresholdValue ?? 60;
    return `Trigger when the Situation Overview score crosses ${direction} ${value}.`;
  }

  if (input.ruleType === "watch_condition_appeared") {
    return "Trigger when a new Situation Overview watch condition appears.";
  }

  return `Trigger when ${defaultTitle(input.ruleType).toLowerCase()}.`;
}

function validateRuleInput(input: AlertRuleInput, userId: number): NewAlertRule {
  if (!allowedRuleTypes.has(input.ruleType)) {
    throw new ApiInputError(`Unsupported alert rule type: ${input.ruleType}`);
  }

  const severity = input.severity ?? (input.ruleType === "risk_level_changed" ? "warning" : "info");

  if (!allowedSeverities.has(severity)) {
    throw new ApiInputError(`Unsupported alert severity: ${severity}`);
  }

  if (input.ruleType === "score_crossed_threshold") {
    if (input.thresholdValue === null || input.thresholdValue === undefined || !Number.isFinite(input.thresholdValue)) {
      throw new ApiInputError("thresholdValue is required for score_crossed_threshold rules");
    }

    if (input.thresholdValue < -100 || input.thresholdValue > 100) {
      throw new ApiInputError("thresholdValue must be between -100 and 100");
    }

    if (input.thresholdDirection !== "above" && input.thresholdDirection !== "below") {
      throw new ApiInputError("thresholdDirection must be above or below for score_crossed_threshold rules");
    }
  }

  return {
    userId,
    ruleType: input.ruleType,
    symbol: input.symbol,
    timeframe: input.timeframe,
    title: input.title?.trim() || defaultTitle(input.ruleType),
    description: input.description?.trim() || defaultDescription(input),
    severity,
    isEnabled: input.isEnabled ?? true,
    widgetId: input.widgetId?.trim() || null,
    watchConditionId: input.watchConditionId?.trim() || null,
    thresholdValue: input.thresholdValue ?? null,
    thresholdDirection: input.thresholdDirection ?? null
  };
}

function matchesRuleScope(rule: AlertRuleRecord, overview: SituationOverview) {
  return rule.symbol === overview.symbol && rule.timeframe === overview.timeframe;
}

function previousWatchConditionIds(previousOverview: SituationOverview | null | undefined) {
  return new Set((previousOverview?.watchConditions ?? []).map((condition) => condition.id));
}

function topDriverSource(overview: SituationOverview | null | undefined) {
  return overview?.mainDrivers[0]?.sourceWidget ?? null;
}

interface PendingAlert {
  triggerKey: string;
  title: string;
  message: string;
  explanation: string;
  sourceWidget: string | null;
  metadata: Record<string, unknown>;
}

function evaluateRule(
  rule: AlertRuleRecord,
  overview: SituationOverview,
  previousOverview: SituationOverview | null | undefined
): PendingAlert[] {
  if (!rule.isEnabled || !matchesRuleScope(rule, overview)) {
    return [];
  }

  if (rule.ruleType === "situation_bias_changed") {
    const change = overview.changedSincePrevious?.find((item) => item.id === "bias-change");
    if (!change) {
      return [];
    }

    return [{
      triggerKey: `bias:${change.previous}->${change.current}`,
      title: rule.title,
      message: `${overview.symbol} ${overview.timeframe} bias moved from ${change.previous.replaceAll("_", " ")} to ${change.current.replaceAll("_", " ")}.`,
      explanation: change.explanation,
      sourceWidget: overview.mainDrivers[0]?.sourceWidget ?? null,
      metadata: { change, overviewTitle: overview.title }
    }];
  }

  if (rule.ruleType === "risk_level_changed") {
    const change = overview.changedSincePrevious?.find((item) => item.id === "risk-change");
    if (!change) {
      return [];
    }

    return [{
      triggerKey: `risk:${change.previous}->${change.current}`,
      title: rule.title,
      message: `${overview.symbol} ${overview.timeframe} risk moved from ${change.previous} to ${change.current}.`,
      explanation: change.explanation,
      sourceWidget: overview.conflictingSignals[0]?.sourceWidget ?? overview.mainDrivers[0]?.sourceWidget ?? null,
      metadata: { change, riskScore: overview.riskScore }
    }];
  }

  if (rule.ruleType === "watch_condition_appeared") {
    const previousIds = previousWatchConditionIds(previousOverview);
    return overview.watchConditions
      .filter((condition) => !previousIds.has(condition.id))
      .filter((condition) => !rule.watchConditionId || condition.id === rule.watchConditionId)
      .map((condition) => ({
        triggerKey: `watch:${condition.id}:${condition.severity}:${condition.label}`,
        title: rule.title,
        message: `${overview.symbol} ${overview.timeframe}: ${condition.label}`,
        explanation: `${condition.condition} ${condition.implication}`,
        sourceWidget: condition.sourceWidget ?? null,
        metadata: { condition }
      }));
  }

  if (rule.ruleType === "widget_direction_changed") {
    const previousDriver = topDriverSource(previousOverview);
    const currentDriver = topDriverSource(overview);

    if (!previousDriver || !currentDriver || previousDriver === currentDriver) {
      return [];
    }

    if (rule.widgetId && rule.widgetId !== previousDriver && rule.widgetId !== currentDriver) {
      return [];
    }

    return [{
      triggerKey: `driver:${previousDriver}->${currentDriver}`,
      title: rule.title,
      message: `${overview.symbol} ${overview.timeframe} main driver changed from ${previousDriver} to ${currentDriver}.`,
      explanation: overview.changedSincePrevious?.find((item) => item.id === "driver-change")?.explanation ??
        `${currentDriver} is now the strongest source behind the overview.`,
      sourceWidget: currentDriver,
      metadata: { previousDriver, currentDriver }
    }];
  }

  const previousScore = previousOverview?.score;
  const threshold = rule.thresholdValue;
  const direction = rule.thresholdDirection;

  if (previousScore === undefined || threshold === null || threshold === undefined || !direction) {
    return [];
  }

  const crossed =
    direction === "above"
      ? previousScore < threshold && overview.score >= threshold
      : previousScore > threshold && overview.score <= threshold;

  if (!crossed) {
    return [];
  }

  return [{
    triggerKey: `score:${direction}:${threshold}:${previousScore}->${overview.score}`,
    title: rule.title,
    message: `${overview.symbol} ${overview.timeframe} score crossed ${direction} ${threshold}.`,
    explanation: `Directional score moved from ${previousScore} to ${overview.score}.`,
    sourceWidget: overview.mainDrivers[0]?.sourceWidget ?? null,
    metadata: { previousScore, currentScore: overview.score, threshold, direction }
  }];
}

function ownedRule(db: Database.Database, id: number, userId: number) {
  const rule = getAlertRuleById(db, id);

  if (!rule || rule.userId !== userId) {
    throw new ApiInputError("Alert rule not found", 404);
  }

  return rule;
}

export function listRulesForSession(options: { session: AuthSession; db?: Database.Database }) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  return listAlertRules(db, { userId: user.userId }).map(toRuleApi);
}

export function createRuleForSession(options: { session: AuthSession; input: AlertRuleInput; db?: Database.Database }) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const rule = validateRuleInput(options.input, user.userId);
  const id = insertAlertRule(db, rule);
  const inserted = getAlertRuleById(db, id);

  if (!inserted) {
    throw new Error("Alert rule was not created");
  }

  return toRuleApi(inserted);
}

export function updateRuleForSession(options: {
  session: AuthSession;
  id: number;
  input: Partial<AlertRuleInput>;
  db?: Database.Database;
}) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const current = ownedRule(db, options.id, user.userId);

  const nextInput: AlertRuleInput = {
    ruleType: options.input.ruleType ?? current.ruleType,
    symbol: options.input.symbol ?? current.symbol,
    timeframe: options.input.timeframe ?? current.timeframe,
    title: options.input.title ?? current.title,
    description: options.input.description ?? current.description,
    severity: options.input.severity ?? current.severity,
    isEnabled: options.input.isEnabled ?? current.isEnabled,
    widgetId: options.input.widgetId === undefined ? current.widgetId : options.input.widgetId,
    watchConditionId: options.input.watchConditionId === undefined ? current.watchConditionId : options.input.watchConditionId,
    thresholdValue: options.input.thresholdValue === undefined ? current.thresholdValue : options.input.thresholdValue,
    thresholdDirection: options.input.thresholdDirection === undefined ? current.thresholdDirection : options.input.thresholdDirection
  };
  const patch = validateRuleInput(nextInput, user.userId);
  const updated = updateAlertRule(db, options.id, patch);

  if (!updated) {
    throw new ApiInputError("Alert rule not found", 404);
  }

  return toRuleApi(updated);
}

export function deleteRuleForSession(options: { session: AuthSession; id: number; db?: Database.Database }) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  ownedRule(db, options.id, user.userId);

  return deleteAlertRule(db, options.id);
}

export function listEventsForSession(options: {
  session: AuthSession;
  includeAcknowledged?: boolean;
  limit?: number;
  db?: Database.Database;
}) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  return listAlertEvents(db, {
    userId: user.userId,
    includeAcknowledged: options.includeAcknowledged,
    limit: options.limit
  }).map(toEventApi);
}

export function acknowledgeEventForSession(options: { session: AuthSession; id: number; db?: Database.Database }) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const current = getAlertEventById(db, options.id);

  if (!current || current.userId !== user.userId) {
    throw new ApiInputError("Alert event not found", 404);
  }

  const event = acknowledgeAlertEvent(db, options.id);

  if (!event) {
    throw new ApiInputError("Alert event not found", 404);
  }

  return toEventApi(event);
}

/**
 * Situation Overviews are instance-wide, so every user's enabled rules for the
 * symbol/timeframe are evaluated. Each event belongs to the owner of its rule.
 */
export function evaluateAlertRulesForOverview(options: EvaluateAlertRulesOptions) {
  const db = ensureDatabase(options.db);
  const rules = listAlertRules(db, {
    symbol: options.overview.symbol,
    timeframe: options.overview.timeframe,
    enabledOnly: true
  });
  const created: AlertEventRecord[] = [];

  for (const rule of rules) {
    for (const pending of evaluateRule(rule, options.overview, options.previousOverview)) {
      const existing = findOpenAlertEvent(db, {
        ruleId: rule.id,
        symbol: options.overview.symbol,
        timeframe: options.overview.timeframe,
        triggerKey: pending.triggerKey
      });

      if (existing) {
        continue;
      }

      const id = insertAlertEvent(db, {
        ruleId: rule.id,
        userId: rule.userId,
        symbol: options.overview.symbol,
        timeframe: options.overview.timeframe,
        triggerKey: pending.triggerKey,
        severity: rule.severity,
        title: pending.title,
        message: pending.message,
        explanation: pending.explanation,
        sourceWidget: pending.sourceWidget,
        overviewId: options.overviewId ?? null,
        metadataJson: JSON.stringify(pending.metadata)
      });
      const event = getAlertEventById(db, id);

      if (event) {
        created.push(event);
      }
    }
  }

  return created;
}

