import type Database from "better-sqlite3";
import type {
  AlertEventRecord,
  AlertRuleRecord,
  NewAlertEvent,
  NewAlertRule
} from "../types";

interface AlertRuleDbRow {
  id: number;
  rule_type: AlertRuleRecord["ruleType"];
  symbol: string;
  timeframe: string;
  access_plan: string;
  title: string;
  description: string;
  severity: AlertRuleRecord["severity"];
  is_enabled: number;
  widget_id: string | null;
  watch_condition_id: string | null;
  threshold_value: number | null;
  threshold_direction: "above" | "below" | null;
  created_at: string;
  updated_at: string;
}

interface AlertEventDbRow {
  id: number;
  rule_id: number;
  symbol: string;
  timeframe: string;
  access_plan: string;
  trigger_key: string;
  severity: AlertEventRecord["severity"];
  title: string;
  message: string;
  explanation: string;
  source_widget: string | null;
  overview_id: number | null;
  metadata_json: string;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapAlertRule(row: AlertRuleDbRow): AlertRuleRecord {
  return {
    id: row.id,
    ruleType: row.rule_type,
    symbol: row.symbol,
    timeframe: row.timeframe,
    accessPlan: row.access_plan,
    title: row.title,
    description: row.description,
    severity: row.severity,
    isEnabled: row.is_enabled === 1,
    widgetId: row.widget_id,
    watchConditionId: row.watch_condition_id,
    thresholdValue: row.threshold_value,
    thresholdDirection: row.threshold_direction,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAlertEvent(row: AlertEventDbRow): AlertEventRecord {
  return {
    id: row.id,
    ruleId: row.rule_id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    accessPlan: row.access_plan,
    triggerKey: row.trigger_key,
    severity: row.severity,
    title: row.title,
    message: row.message,
    explanation: row.explanation,
    sourceWidget: row.source_widget,
    overviewId: row.overview_id,
    metadataJson: row.metadata_json,
    acknowledgedAt: row.acknowledged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertAlertRule(db: Database.Database, rule: NewAlertRule) {
  const info = db
    .prepare(
      `
      INSERT INTO alert_rules (
        rule_type,
        symbol,
        timeframe,
        access_plan,
        title,
        description,
        severity,
        is_enabled,
        widget_id,
        watch_condition_id,
        threshold_value,
        threshold_direction
      )
      VALUES (
        @ruleType,
        @symbol,
        @timeframe,
        @accessPlan,
        @title,
        @description,
        @severity,
        @isEnabled,
        @widgetId,
        @watchConditionId,
        @thresholdValue,
        @thresholdDirection
      )
    `
    )
    .run({
      ...rule,
      isEnabled: rule.isEnabled ? 1 : 0
    });

  return Number(info.lastInsertRowid);
}

export function updateAlertRule(
  db: Database.Database,
  id: number,
  patch: Partial<NewAlertRule>
) {
  const current = getAlertRuleById(db, id);

  if (!current) {
    return null;
  }

  db
    .prepare(
      `
      UPDATE alert_rules
      SET
        rule_type = @ruleType,
        symbol = @symbol,
        timeframe = @timeframe,
        access_plan = @accessPlan,
        title = @title,
        description = @description,
        severity = @severity,
        is_enabled = @isEnabled,
        widget_id = @widgetId,
        watch_condition_id = @watchConditionId,
        threshold_value = @thresholdValue,
        threshold_direction = @thresholdDirection,
        updated_at = datetime('now')
      WHERE id = @id
    `
    )
    .run({
      id,
      ruleType: patch.ruleType ?? current.ruleType,
      symbol: patch.symbol ?? current.symbol,
      timeframe: patch.timeframe ?? current.timeframe,
      accessPlan: patch.accessPlan ?? current.accessPlan,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      severity: patch.severity ?? current.severity,
      isEnabled: (patch.isEnabled ?? current.isEnabled) ? 1 : 0,
      widgetId: patch.widgetId === undefined ? current.widgetId : patch.widgetId,
      watchConditionId: patch.watchConditionId === undefined ? current.watchConditionId : patch.watchConditionId,
      thresholdValue: patch.thresholdValue === undefined ? current.thresholdValue : patch.thresholdValue,
      thresholdDirection: patch.thresholdDirection === undefined ? current.thresholdDirection : patch.thresholdDirection
    });

  return getAlertRuleById(db, id);
}

export function deleteAlertRule(db: Database.Database, id: number) {
  const info = db.prepare("DELETE FROM alert_rules WHERE id = ?").run(id);
  return info.changes > 0;
}

export function getAlertRuleById(db: Database.Database, id: number) {
  const row = db.prepare("SELECT * FROM alert_rules WHERE id = ?").get(id) as AlertRuleDbRow | undefined;
  return row ? mapAlertRule(row) : null;
}

export function listAlertRules(
  db: Database.Database,
  filters: { accessPlan: string; symbol?: string; timeframe?: string; enabledOnly?: boolean }
) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM alert_rules
      WHERE access_plan = @accessPlan
        AND (@symbol IS NULL OR symbol = @symbol)
        AND (@timeframe IS NULL OR timeframe = @timeframe)
        AND (@enabledOnly = 0 OR is_enabled = 1)
      ORDER BY created_at DESC, id DESC
    `
    )
    .all({
      accessPlan: filters.accessPlan,
      symbol: filters.symbol ?? null,
      timeframe: filters.timeframe ?? null,
      enabledOnly: filters.enabledOnly ? 1 : 0
    }) as AlertRuleDbRow[];

  return rows.map(mapAlertRule);
}

export function insertAlertEvent(db: Database.Database, event: NewAlertEvent) {
  const info = db
    .prepare(
      `
      INSERT INTO alert_events (
        rule_id,
        symbol,
        timeframe,
        access_plan,
        trigger_key,
        severity,
        title,
        message,
        explanation,
        source_widget,
        overview_id,
        metadata_json
      )
      VALUES (
        @ruleId,
        @symbol,
        @timeframe,
        @accessPlan,
        @triggerKey,
        @severity,
        @title,
        @message,
        @explanation,
        @sourceWidget,
        @overviewId,
        @metadataJson
      )
    `
    )
    .run(event);

  return Number(info.lastInsertRowid);
}

export function findOpenAlertEvent(
  db: Database.Database,
  filters: { ruleId: number; symbol: string; timeframe: string; triggerKey: string }
) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM alert_events
      WHERE rule_id = @ruleId
        AND symbol = @symbol
        AND timeframe = @timeframe
        AND trigger_key = @triggerKey
        AND acknowledged_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
    )
    .get(filters) as AlertEventDbRow | undefined;

  return row ? mapAlertEvent(row) : null;
}

export function listAlertEvents(
  db: Database.Database,
  filters: { accessPlan: string; includeAcknowledged?: boolean; limit?: number }
) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM alert_events
      WHERE access_plan = @accessPlan
        AND (@includeAcknowledged = 1 OR acknowledged_at IS NULL)
      ORDER BY created_at DESC, id DESC
      LIMIT @limit
    `
    )
    .all({
      accessPlan: filters.accessPlan,
      includeAcknowledged: filters.includeAcknowledged ? 1 : 0,
      limit: filters.limit ?? 100
    }) as AlertEventDbRow[];

  return rows.map(mapAlertEvent);
}

export function getAlertEventById(db: Database.Database, id: number) {
  const row = db.prepare("SELECT * FROM alert_events WHERE id = ?").get(id) as AlertEventDbRow | undefined;
  return row ? mapAlertEvent(row) : null;
}

export function acknowledgeAlertEvent(db: Database.Database, id: number) {
  const info = db
    .prepare(
      `
      UPDATE alert_events
      SET acknowledged_at = COALESCE(acknowledged_at, datetime('now')),
          updated_at = datetime('now')
      WHERE id = ?
    `
    )
    .run(id);

  if (info.changes === 0) {
    return null;
  }

  const row = db.prepare("SELECT * FROM alert_events WHERE id = ?").get(id) as AlertEventDbRow | undefined;
  return row ? mapAlertEvent(row) : null;
}
