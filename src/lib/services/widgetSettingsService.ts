import type Database from "better-sqlite3";
import { hasRole, requireRole, resolveVisibleWidgetIds, type AuthSession } from "@/lib/auth/access";
import type { WidgetSettingsApi } from "@/lib/api/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { upsertWidgetSettings } from "@/lib/db/repositories/widgetSettingsRepository";
import { isKnownWidgetId, widgetCatalog } from "@/lib/widgets/catalog";
import { ApiInputError } from "./apiValidation";

function databaseFromOptional(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

/** Instance-wide widget visibility, ordered by catalog priority. */
export function getEffectiveVisibleWidgetIds(db?: Database.Database) {
  return resolveVisibleWidgetIds(databaseFromOptional(db));
}

export function getWidgetSettingsState(session: AuthSession, db?: Database.Database): WidgetSettingsApi {
  requireRole(session, "viewer");

  const enabled = new Set(getEffectiveVisibleWidgetIds(db));

  return {
    canEdit: hasRole(session, "admin"),
    enabledWidgetIds: [...enabled],
    catalog: widgetCatalog.map((item) => ({
      widgetId: item.widgetId,
      title: item.title,
      group: item.group,
      defaultEnabled: item.defaultEnabled,
      priority: item.priority,
      category: item.category,
      iconKey: item.iconKey,
      description: item.description,
      isEnabled: enabled.has(item.widgetId)
    })),
    updatedAt: new Date().toISOString()
  };
}

export function updateWidgetSettings(
  input: { enabledWidgetIds: string[] },
  session: AuthSession,
  db?: Database.Database
) {
  requireRole(session, "admin");

  const unknownIds = input.enabledWidgetIds.filter((widgetId) => !isKnownWidgetId(widgetId));

  if (unknownIds.length > 0) {
    throw new ApiInputError(`Unsupported widget id: ${unknownIds[0]}`, 400);
  }

  const database = databaseFromOptional(db);
  const enabled = new Set(input.enabledWidgetIds);

  upsertWidgetSettings(
    database,
    widgetCatalog.map((item) => ({
      widgetId: item.widgetId,
      isEnabled: enabled.has(item.widgetId)
    }))
  );

  return getWidgetSettingsState(session, database);
}
