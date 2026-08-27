import type Database from "better-sqlite3";
import type { AppSettings, SignupMode } from "../types";

export const defaultAppSettings: AppSettings = {
  signupMode: "closed",
  publicDashboard: false
};

const keys = {
  signupMode: "signup_mode",
  publicDashboard: "public_dashboard"
} as const;

function parseSignupMode(value: string | undefined): SignupMode {
  return value === "open" ? "open" : defaultAppSettings.signupMode;
}

export function getAppSettings(db: Database.Database): AppSettings {
  const rows = db.prepare("SELECT key, value FROM app_settings").all() as Array<{ key: string; value: string }>;
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    signupMode: parseSignupMode(values.get(keys.signupMode)),
    publicDashboard: values.has(keys.publicDashboard)
      ? values.get(keys.publicDashboard) === "true"
      : defaultAppSettings.publicDashboard
  };
}

export function updateAppSettings(db: Database.Database, patch: Partial<AppSettings>) {
  const statement = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (@key, @value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `);

  db.transaction(() => {
    if (patch.signupMode !== undefined) {
      statement.run({ key: keys.signupMode, value: patch.signupMode });
    }

    if (patch.publicDashboard !== undefined) {
      statement.run({ key: keys.publicDashboard, value: patch.publicDashboard ? "true" : "false" });
    }
  })();

  return getAppSettings(db);
}
