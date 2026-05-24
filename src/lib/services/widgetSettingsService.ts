import type Database from "better-sqlite3";
import type { AuthSession } from "@/lib/auth/access";
import type { WidgetSettingsApi } from "@/lib/api/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  listWidgetSettings,
  upsertWidgetSettings
} from "@/lib/db/repositories/widgetSettingsRepository";
import {
  defaultVisibleWidgetIdsForPlan,
  isKnownWidgetId,
  sortByWidgetPriority,
  widgetCatalog
} from "@/lib/widgets/catalog";
import { ApiInputError } from "./apiValidation";

function databaseFromOptional(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

function settingsMap(db: Database.Database) {
  return new Map(listWidgetSettings(db).map((setting) => [setting.widgetId, setting.isEnabled]));
}

function isAvailableForSession(session: AuthSession, widgetId: string) {
  return session.isAdmin || session.visibleWidgetIds.includes(widgetId);
}

export function getEffectiveVisibleWidgetIds(session: AuthSession, db?: Database.Database) {
  if (!session.isAdmin) {
    return defaultVisibleWidgetIdsForPlan("basic");
  }

  const database = databaseFromOptional(db);
  const persisted = settingsMap(database);
  const visible = widgetCatalog
    .filter((item) => persisted.get(item.widgetId) ?? item.defaultEnabled)
    .map((item) => ({ widgetId: item.widgetId }));

  return sortByWidgetPriority(visible).map((item) => item.widgetId);
}

export function getWidgetSettingsState(session: AuthSession, db?: Database.Database): WidgetSettingsApi {
  const database = session.isAdmin ? databaseFromOptional(db) : null;
  const persisted = database ? settingsMap(database) : new Map<string, boolean>();
  const enabledSet = new Set(getEffectiveVisibleWidgetIds(session, database ?? undefined));
  const catalog = widgetCatalog.map((item) => {
    const isAvailable = isAvailableForSession(session, item.widgetId);
    const isEnabled = isAvailable && enabledSet.has(item.widgetId);

    return {
      widgetId: item.widgetId,
      title: item.title,
      group: item.group,
      planTier: item.planTier,
      defaultEnabled: item.defaultEnabled,
      priority: item.priority,
      category: item.category,
      iconKey: item.iconKey,
      description: item.description,
      isAvailable,
      isLocked: !isAvailable,
      isEnabled: session.isAdmin ? persisted.get(item.widgetId) ?? item.defaultEnabled : isEnabled
    };
  });

  return {
    plan: session.plan,
    canEdit: session.isAdmin,
    enabledWidgetIds: [...enabledSet],
    catalog,
    updatedAt: new Date().toISOString()
  };
}

export function updateWidgetSettings(
  input: { enabledWidgetIds: string[] },
  session: AuthSession,
  db?: Database.Database
) {
  if (!session.isAdmin) {
    throw new ApiInputError("Widget visibility settings require admin access", 403);
  }

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
