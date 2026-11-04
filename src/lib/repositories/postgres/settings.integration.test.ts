import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test npm test
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("settings no PostgreSQL real", () => {
  let client: Client;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
  });

  beforeEach(async () => {
    await client.query("DELETE FROM app_settings");
    const { getPostgresPool } = await import("./connection");
    void getPostgresPool();
  });

  afterAll(async () => {
    await client?.end();
    const globalForPostgres = globalThis as unknown as {
      crmPostgresPool?: { end(): Promise<void> };
    };
    await globalForPostgres.crmPostgresPool?.end();
    delete globalForPostgres.crmPostgresPool;
    delete process.env.CRM_POSTGRES_URL;
  });

  it("lê, grava, atualiza e remove a preferência", async () => {
    const { getUserName, saveUserName } = await import("./settings");

    await expect(getUserName()).resolves.toBeNull();

    await saveUserName("Ana");
    await expect(getUserName()).resolves.toBe("Ana");

    await saveUserName("Beatriz");
    await expect(getUserName()).resolves.toBe("Beatriz");

    await saveUserName(null);
    await expect(getUserName()).resolves.toBeNull();
  });
});
