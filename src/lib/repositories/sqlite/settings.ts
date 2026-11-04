import { getDb } from "@/lib/db";
import type { SettingsRepository } from "../contracts";

const USER_NAME_KEY = "user_name";

export async function getUserName(): Promise<string | null> {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(USER_NAME_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

export async function saveUserName(name: string | null): Promise<void> {
  const db = getDb();
  if (!name) {
    db.prepare("DELETE FROM app_settings WHERE key = ?").run(USER_NAME_KEY);
    return;
  }
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(USER_NAME_KEY, name);
}

export const sqliteSettingsRepository: SettingsRepository = {
  getUserName,
  saveUserName,
};
