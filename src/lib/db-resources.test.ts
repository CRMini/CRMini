import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";

const originalSqlitePath = process.env.SQLITE_PATH;
const originalResourcesDir = process.env.CRM_RESOURCES_DIR;
const temps: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-db-resources-"));
  temps.push(dir);
  return dir;
}

function clearDbGlobal() {
  const g = globalThis as Record<string, unknown>;
  if (g.crmSqlite) {
    try {
      (g.crmSqlite as Database.Database).close();
    } catch {
      // O banco em memória já pode ter sido fechado.
    }
  }
  delete g.crmSqlite;
  delete g.migrationError;
}

beforeEach(() => {
  vi.resetModules();
  clearDbGlobal();
  process.env.SQLITE_PATH = ":memory:";
  delete process.env.CRM_RESOURCES_DIR;
});

afterEach(() => {
  clearDbGlobal();
  vi.resetModules();
  if (originalSqlitePath === undefined) delete process.env.SQLITE_PATH;
  else process.env.SQLITE_PATH = originalSqlitePath;
  if (originalResourcesDir === undefined) delete process.env.CRM_RESOURCES_DIR;
  else process.env.CRM_RESOURCES_DIR = originalResourcesDir;
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tableNames(db: Database.Database) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => (row as { name: string }).name);
}

describe("getDb com CRM_RESOURCES_DIR", () => {
  it("aplica o schema do diretório apontado por CRM_RESOURCES_DIR", async () => {
    const dir = tempDir();
    const dbDir = path.join(dir, "database");
    fs.mkdirSync(path.join(dbDir, "migrations"), { recursive: true });
    fs.writeFileSync(path.join(dbDir, "init.sql"), "CREATE TABLE marker(id TEXT);");
    process.env.CRM_RESOURCES_DIR = dir;

    const { getDb } = await import("./db");
    const db = getDb();

    expect(tableNames(db)).toEqual(["marker", "schema_migrations"]);
    expect(tableNames(db)).not.toContain("clients");
  });

  it("registra migrations da cópia apontada por CRM_RESOURCES_DIR", async () => {
    const dir = tempDir();
    const dbDir = path.join(dir, "database");
    const migrationsDir = path.join(dbDir, "migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });
    // Copia o schema real e as migrations reais para validar o fluxo completo.
    fs.copyFileSync(
      path.join(process.cwd(), "database", "init.sql"),
      path.join(dbDir, "init.sql"),
    );
    fs.copyFileSync(
      path.join(process.cwd(), "database", "migrations", "001_contacts_soft_delete.sql"),
      path.join(migrationsDir, "001_contacts_soft_delete.sql"),
    );
    process.env.CRM_RESOURCES_DIR = dir;

    const { getDb } = await import("./db");
    const db = getDb();

    expect(tableNames(db)).toContain("clients");
    const rows = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all();
    expect(rows).toEqual([{ version: "001" }]);
  });

  it("cai no process.cwd()/database quando CRM_RESOURCES_DIR não está definido", async () => {
    delete process.env.CRM_RESOURCES_DIR;

    const { getDb } = await import("./db");
    const db = getDb();

    expect(tableNames(db)).toEqual([
      "app_settings",
      "clients",
      "contacts",
      "events",
      "opportunities",
      "schema_migrations",
      "tasks",
    ]);
  });
});
