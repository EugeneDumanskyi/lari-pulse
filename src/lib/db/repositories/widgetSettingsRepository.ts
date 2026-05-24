import type Database from "better-sqlite3";
import type { NewWidgetSetting, WidgetSettingRecord } from "../types";

interface WidgetSettingDbRow {
  id: number;
  widget_id: string;
  is_enabled: 0 | 1;
  updated_at: string;
}

function mapWidgetSetting(row: WidgetSettingDbRow): WidgetSettingRecord {
  return {
    id: row.id,
    widgetId: row.widget_id,
    isEnabled: row.is_enabled === 1,
    updatedAt: row.updated_at
  };
}

export function listWidgetSettings(db: Database.Database) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM widget_settings
      ORDER BY widget_id ASC
    `
    )
    .all() as WidgetSettingDbRow[];

  return rows.map(mapWidgetSetting);
}

export function upsertWidgetSettings(db: Database.Database, settings: NewWidgetSetting[]) {
  const statement = db.prepare(
    `
    INSERT INTO widget_settings (widget_id, is_enabled, updated_at)
    VALUES (@widgetId, @isEnabled, datetime('now'))
    ON CONFLICT(widget_id) DO UPDATE SET
      is_enabled = excluded.is_enabled,
      updated_at = datetime('now')
  `
  );
  const transaction = db.transaction((rows: NewWidgetSetting[]) => {
    for (const setting of rows) {
      statement.run({
        widgetId: setting.widgetId,
        isEnabled: setting.isEnabled ? 1 : 0
      });
    }
  });

  transaction(settings);
}
