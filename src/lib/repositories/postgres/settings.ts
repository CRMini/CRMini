import type { SettingsRepository } from "../contracts";
import { getPostgresPool } from "./connection";

const userNameKey = "user_name";

export async function getUserName(): Promise<string | null> {
  const result = await getPostgresPool().query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = $1",
    [userNameKey],
  );

  return result.rows[0]?.value ?? null;
}

export async function saveUserName(name: string | null): Promise<void> {
  const pool = getPostgresPool();

  if (!name) {
    await pool.query("DELETE FROM app_settings WHERE key = $1", [userNameKey]);
    return;
  }

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [userNameKey, name],
  );
}

export const postgresSettingsRepository: SettingsRepository = {
  getUserName,
  saveUserName,
};
