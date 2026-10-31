import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  defaultDatabasePath,
  validateDatabase,
  migrateLegacyDatabase,
  selectDatabasePath,
  shouldMigrateLegacy,
} = require("../../database/sqlite-paths.cjs");
const Database = require("better-sqlite3");
let dir: string;
const temp = () =>
  (dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-path-test-")));
const crmDb = (file: string) => {
  const db = new Database(file);
  db.exec(
    "CREATE TABLE clients(id); CREATE TABLE contacts(id); CREATE TABLE opportunities(id); CREATE TABLE tasks(id);",
  );
  db.close();
};
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("SQLite paths", () => {
  it("resolves Linux, macOS, Windows defaults and override", () => {
    expect(
      defaultDatabasePath({
        platform: "linux",
        env: { XDG_DATA_HOME: "/data" },
        home: "/home/test",
      }),
    ).toBe("/data/CRMini/crm.sqlite");
    expect(
      defaultDatabasePath({ platform: "darwin", env: {}, home: "/Users/test" }),
    ).toBe("/Users/test/Library/Application Support/CRMini/crm.sqlite");
    expect(
      defaultDatabasePath({
        platform: "win32",
        env: {},
        home: "C:/Users/test",
      }),
    ).toBe("C:/Users/test/AppData/Roaming/CRMini/crm.sqlite");
    expect(
      defaultDatabasePath({ env: { SQLITE_PATH: "/custom.sqlite" } }),
    ).toBe("/custom.sqlite");
  });
  it("backs up valid legacy db without changing source or overwriting target", async () => {
    const root = temp(),
      source = path.join(root, "legacy.sqlite"),
      target = path.join(root, "target", "crm.sqlite");
    crmDb(source);
    expect(await migrateLegacyDatabase(source, target)).toBe(true);
    expect(validateDatabase(target)).toBe("crm");
    expect(fs.existsSync(source)).toBe(true);
    expect(await migrateLegacyDatabase(source, target)).toBe(false);
  });
  it("rejects non-CRM db without alteration and never migrates an explicit override", () => {
    const root = temp(),
      file = path.join(root, "bad.sqlite"),
      db = new Database(file);
    db.exec("CREATE TABLE unrelated(id)");
    db.close();
    expect(() => validateDatabase(file)).toThrow(/CRM/);
    expect(() =>
      selectDatabasePath({ choice: "selected", selected: file }),
    ).toThrow(/CRM/);
    expect(shouldMigrateLegacy({ SQLITE_PATH: file })).toBe(false);
    expect(shouldMigrateLegacy({})).toBe(true);
    const check = new Database(file, { readonly: true });
    expect(
      check
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: { name: string }) => row.name),
    ).toEqual(["unrelated"]);
    check.close();
  });
  it("does not migrate the legacy database when Electron has an explicit SQLITE_PATH", () => {
    const customPath = "/custom/crm.sqlite";
    const electronDefault = defaultDatabasePath({
      userData: "/user-data",
      env: { SQLITE_PATH: customPath },
    });

    expect(electronDefault).toBe(customPath);
    expect(shouldMigrateLegacy({ SQLITE_PATH: customPath })).toBe(false);
  });
});
