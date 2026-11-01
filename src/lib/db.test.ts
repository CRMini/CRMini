import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "./db";

describe("getDb", () => {
  it("reutiliza a mesma conexão entre chamadas", () => {
    expect(getDb()).toBe(getDb());
  });

  it("habilita verificação de chaves estrangeiras na conexão", () => {
    expect(getDb().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("aplica o schema inicial com as tabelas do CRM", () => {
    const tables = getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual([
      "app_settings",
      "clients",
      "contacts",
      "events",
      "opportunities",
      "schema_migrations",
      "tasks",
    ]);
  });

  it("registra as versões 001, 002 e 003 em schema_migrations no banco novo", () => {
    const rows = getDb()
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all();
    expect(rows).toEqual([
      { version: "001", name: "contacts_soft_delete" },
      { version: "002", name: "app_settings" },
      { version: "003", name: "events" },
    ]);
  });
});
