import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migrationsModule = require("../../database/migrate.cjs") as {
  readAppliedIf: (sql: string) => string | null;
  listMigrations: (migrationsDir: string) => Array<{
    version: string;
    name: string;
    filename: string;
    sql: string;
    appliedIf: string | null;
  }>;
  backupPathFor: (databasePath: string, now?: Date) => string;
  migrateDatabase: (
    db: import("better-sqlite3").Database,
    options: {
      databasePath?: string;
      migrationsDir?: string;
      schemaFile?: string;
      onBackup?: (backupPath: string) => void;
    },
  ) => {
    isNew: boolean;
    applied: string[];
    adopted: string[];
    backupPath: string | null;
  };
  runMigrationsFile: (options: {
    databasePath?: string;
    migrationsDir?: string;
    schemaFile?: string;
    onBackup?: (backupPath: string) => void;
  }) => {
    isNew: boolean;
    applied: string[];
    adopted: string[];
    backupPath: string | null;
  };
};
const {
  readAppliedIf,
  listMigrations,
  backupPathFor,
  migrateDatabase,
  runMigrationsFile,
} = migrationsModule;
const Database = require("better-sqlite3") as typeof import("better-sqlite3");
const migrateScript = require.resolve("../../database/migrate.cjs");

const SOFT_DELETE_APPLIED_IF =
  "SELECT 1 FROM pragma_table_info('contacts') WHERE name = 'is_active'";

type SqliteDatabase = import("better-sqlite3").Database;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crm-migrations-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeMigration(dir: string, filename: string, sql: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), sql);
}

function writeSchema(sql = "-- schema de teste sem DDL\n") {
  const file = path.join(root, "init.sql");
  fs.writeFileSync(file, sql);
  return file;
}

function databaseFile(name = "crm.sqlite") {
  const file = path.join(root, "banco", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function createExistingDatabase(
  file: string,
  { contactsWithActive = false } = {},
): SqliteDatabase {
  const db = new Database(file);
  db.exec("CREATE TABLE clients (id TEXT PRIMARY KEY)");
  db.exec(
    `CREATE TABLE contacts (id TEXT PRIMARY KEY, client_id TEXT${
      contactsWithActive ? ", is_active INTEGER NOT NULL DEFAULT 1" : ""
    })`,
  );
  return db;
}

function tableExists(db: SqliteDatabase, table: string) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function columnExists(db: SqliteDatabase, table: string, column: string) {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column),
  );
}

function recordedVersions(db: SqliteDatabase) {
  return db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => (row as { version: string }).version);
}

function backupFiles(dir: string) {
  return fs.readdirSync(dir).filter((file) => file.includes(".bak-"));
}

describe("readAppliedIf", () => {
  it("extrai a SQL do marcador sem o ponto e vírgula final", () => {
    const sql = `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER;\n`;

    expect(readAppliedIf(sql)).toBe(SOFT_DELETE_APPLIED_IF);
  });

  it("retorna null quando a migration não tem marcador", () => {
    expect(
      readAppliedIf("ALTER TABLE contacts ADD COLUMN extra TEXT;"),
    ).toBeNull();
  });

  it("ignora o marcador fora da primeira linha", () => {
    const sql = `-- comentário inicial\n-- @applied-if: ${SOFT_DELETE_APPLIED_IF}\n`;

    expect(readAppliedIf(sql)).toBeNull();
  });
});

describe("listMigrations", () => {
  it("ordena as migrations por versão", () => {
    const dir = path.join(root, "migrations");
    writeMigration(dir, "002_segunda.sql", "CREATE TABLE b (id TEXT);");
    writeMigration(dir, "001_primeira.sql", "CREATE TABLE a (id TEXT);");

    expect(listMigrations(dir).map((migration) => migration.version)).toEqual([
      "001",
      "002",
    ]);
  });

  it("ignora arquivos fora do padrão de nome", () => {
    const dir = path.join(root, "migrations");
    writeMigration(dir, "001_primeira.sql", "-- migration válida\n");
    writeMigration(dir, "README.md", "# Migrations\n");
    writeMigration(dir, "notas.txt", "texto qualquer\n");
    writeMigration(dir, "1_curta.sql", "-- versão incompleta\n");
    fs.mkdirSync(path.join(dir, "002_diretorio.sql"));

    const migrations = listMigrations(dir);

    expect(migrations.map((migration) => migration.filename)).toEqual([
      "001_primeira.sql",
    ]);
    expect(migrations[0]).toMatchObject({
      version: "001",
      name: "primeira",
      appliedIf: null,
    });
  });

  it("aceita um diretório sem migrations", () => {
    const dir = path.join(root, "vazio");
    fs.mkdirSync(dir, { recursive: true });

    expect(listMigrations(dir)).toEqual([]);
  });

  it("lança erro claro para versão duplicada", () => {
    const dir = path.join(root, "migrations");
    writeMigration(dir, "001_a.sql", "-- a\n");
    writeMigration(dir, "001_b.sql", "-- b\n");

    expect(() => listMigrations(dir)).toThrow(/duplicada.*001|001.*duplicada/);
  });

  it("recusa @applied-if que não é SELECT/WITH citando a versão e o arquivo", () => {
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_apaga.sql",
      "-- @applied-if: DELETE FROM contacts;\nSELECT 1;\n",
    );

    expect(() => listMigrations(dir)).toThrow(
      /migration 001 \(001_apaga\.sql\).*SELECT ou WITH/,
    );
  });
});

describe("backupPathFor", () => {
  it("não sobrescreve um backup existente e usa sufixo -2", () => {
    const file = path.join(root, "banco", "crm.sqlite");
    const now = new Date(2026, 0, 2, 3, 4, 5);
    const first = `${file}.bak-20260102030405`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(first, "backup existente");

    expect(backupPathFor(file, now)).toBe(`${first}-2`);
  });

  it("devolve o primeiro caminho livre", () => {
    const file = path.join(root, "banco", "crm.sqlite");
    const now = new Date(2026, 0, 2, 3, 4, 5);

    expect(backupPathFor(file, now)).toBe(`${file}.bak-20260102030405`);
  });
});

describe("migrateDatabase em banco novo", () => {
  it("usa init.sql como baseline sem executar o DDL histórico", () => {
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n`,
    );
    writeMigration(
      dir,
      "002_tabela_nova.sql",
      "CREATE TABLE ddl_historico (id TEXT);\n",
    );
    const schemaFile = writeSchema(
      "CREATE TABLE contacts (id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 1);\n",
    );
    const db = new Database(":memory:");

    const summary = migrateDatabase(db, {
      databasePath: ":memory:",
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary).toEqual({
      isNew: true,
      applied: [],
      adopted: ["001", "002"],
      backupPath: null,
    });
    expect(recordedVersions(db)).toEqual(["001", "002"]);
    expect(columnExists(db, "contacts", "is_active")).toBe(true);
    expect(tableExists(db, "ddl_historico")).toBe(false);
    db.close();
  });

  it("falha quando init.sql não reflete uma migration histórica", () => {
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER;\n`,
    );
    const schemaFile = writeSchema(
      "CREATE TABLE contacts (id TEXT PRIMARY KEY);\n",
    );
    const db = new Database(":memory:");

    expect(() =>
      migrateDatabase(db, {
        databasePath: ":memory:",
        migrationsDir: dir,
        schemaFile,
      }),
    ).toThrow(/init\.sql.*desatualizado/);
    db.close();
  });
});

describe("migrateDatabase em banco existente", () => {
  it("aplica a migration pendente, registra a versão e cria backup", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n`,
    );
    const schemaFile = writeSchema();

    const summary = migrateDatabase(db, {
      databasePath: file,
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary.isNew).toBe(false);
    expect(summary.applied).toEqual(["001"]);
    expect(summary.adopted).toEqual([]);
    expect(columnExists(db, "contacts", "is_active")).toBe(true);
    expect(recordedVersions(db)).toEqual(["001"]);
    expect(summary.backupPath).not.toBeNull();
    expect(fs.existsSync(summary.backupPath as string)).toBe(true);
    expect(fs.statSync(summary.backupPath as string).size).toBeGreaterThan(0);
    db.close();
  });

  it("adota a migration sem executar o DDL quando o efeito já existe", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file, { contactsWithActive: true });
    const dir = path.join(root, "migrations");
    // Executar este SQL em um banco que já tem is_active falharia com
    // "duplicate column name", provando que o DDL não rodou.
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n`,
    );
    const schemaFile = writeSchema();

    const summary = migrateDatabase(db, {
      databasePath: file,
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary.applied).toEqual([]);
    expect(summary.adopted).toEqual(["001"]);
    expect(columnExists(db, "contacts", "is_active")).toBe(true);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM pragma_table_info('contacts') WHERE name = 'is_active'",
        )
        .get(),
    ).toEqual({ total: 1 });
    expect(recordedVersions(db)).toEqual(["001"]);
    db.close();
  });

  it("é idempotente e não cria backup nem duplica registros na segunda execução", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n`,
    );
    const schemaFile = writeSchema();
    const options = { databasePath: file, migrationsDir: dir, schemaFile };

    migrateDatabase(db, options);
    const backupsAfterFirst = backupFiles(path.dirname(file));
    const second = migrateDatabase(db, options);

    expect(backupsAfterFirst).toHaveLength(1);
    expect(second).toEqual({
      isNew: false,
      applied: [],
      adopted: [],
      backupPath: null,
    });
    expect(backupFiles(path.dirname(file))).toHaveLength(1);
    expect(recordedVersions(db)).toEqual(["001"]);
    expect(
      db.prepare("SELECT COUNT(*) AS total FROM schema_migrations").get(),
    ).toEqual({ total: 1 });
    db.close();
  });

  it("aplica migrations antes do schema atual para novos índices de init.sql", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_nickname.sql",
      "ALTER TABLE contacts ADD COLUMN nickname TEXT;\n",
    );
    // Se o schema fosse aplicado antes da migration, este índice falharia
    // com "no such column: nickname".
    const schemaFile = writeSchema(
      "CREATE INDEX IF NOT EXISTS contacts_nickname_idx ON contacts(nickname);\n",
    );

    const summary = migrateDatabase(db, {
      databasePath: file,
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary.applied).toEqual(["001"]);
    expect(
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'contacts_nickname_idx'",
        )
        .get(),
    ).toBeTruthy();
    db.close();
  });

  it("recusa downgrade sem alterar o banco", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    db.exec(
      "CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL);" +
        "INSERT INTO schema_migrations (version, name) VALUES ('999', 'futura');",
    );
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_tabela_nova.sql",
      "CREATE TABLE nao_deveria_existir (id TEXT);\n",
    );
    const schemaFile = writeSchema(
      "CREATE TABLE IF NOT EXISTS schema_de_init (id TEXT);\n",
    );

    expect(() =>
      migrateDatabase(db, {
        databasePath: file,
        migrationsDir: dir,
        schemaFile,
      }),
    ).toThrow(/versão mais nova|desconhecidas/);
    expect(tableExists(db, "nao_deveria_existir")).toBe(false);
    expect(tableExists(db, "schema_de_init")).toBe(false);
    expect(recordedVersions(db)).toEqual(["999"]);
    db.close();
  });

  it("mantém a primeira migration e faz rollback da segunda ao falhar no meio", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_primeira.sql",
      "CREATE TABLE first_step (id TEXT PRIMARY KEY);\n",
    );
    writeMigration(
      dir,
      "002_segunda.sql",
      "ALTER TABLE first_step ADD COLUMN extra TEXT;\nISTO NÃO É SQL VÁLIDO;\n",
    );
    const schemaFile = writeSchema();

    expect(() =>
      migrateDatabase(db, {
        databasePath: file,
        migrationsDir: dir,
        schemaFile,
      }),
    ).toThrow(/migration 002 \(002_segunda\.sql\)/);

    expect(tableExists(db, "first_step")).toBe(true);
    expect(columnExists(db, "first_step", "extra")).toBe(false);
    expect(recordedVersions(db)).toEqual(["001"]);
    db.close();
  });

  it("não cria backup para banco em memória", () => {
    const db = new Database(":memory:");
    db.exec(
      "CREATE TABLE clients (id TEXT PRIMARY KEY);" +
        "CREATE TABLE contacts (id TEXT PRIMARY KEY, client_id TEXT);",
    );
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      "ALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n",
    );
    const schemaFile = writeSchema();

    const summary = migrateDatabase(db, {
      databasePath: ":memory:",
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary.applied).toEqual(["001"]);
    expect(summary.backupPath).toBeNull();
    expect(columnExists(db, "contacts", "is_active")).toBe(true);
    db.close();
  });
});

describe("validação de caminho", () => {
  it("lança erro claro quando o caminho do banco não é informado", () => {
    const db = new Database(":memory:");

    expect(() => migrateDatabase(db, {})).toThrow(/caminho do banco/i);
    expect(() => migrateDatabase(db, { databasePath: "" })).toThrow(
      /caminho do banco/i,
    );
    db.close();
  });
});

describe("runMigrationsFile", () => {
  it("cria o diretório pai, retorna o resumo e fecha a conexão", () => {
    const databasePath = path.join(root, "aninhado", "profundo", "crm.sqlite");
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_contacts_soft_delete.sql",
      `-- @applied-if: ${SOFT_DELETE_APPLIED_IF};\nALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;\n`,
    );
    const schemaFile = writeSchema(
      "CREATE TABLE contacts (id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 1);\n",
    );

    const summary = runMigrationsFile({
      databasePath,
      migrationsDir: dir,
      schemaFile,
    });

    expect(summary.isNew).toBe(true);
    expect(summary.adopted).toEqual(["001"]);
    expect(fs.existsSync(databasePath)).toBe(true);

    const reopened = new Database(databasePath, { readonly: true });
    expect(
      reopened
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: "001" }]);
    reopened.close();
  });
});

describe("CLI de migrations", () => {
  it("cria um banco novo e sai com código 0", () => {
    const databasePath = path.join(root, "cli", "crm.sqlite");

    const result = spawnSync(process.execPath, [migrateScript, databasePath], {
      encoding: "utf8",
      timeout: 60000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(fs.existsSync(databasePath)).toBe(true);

    const db = new Database(databasePath, { readonly: true });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([
      { version: "001" },
      { version: "002" },
      { version: "003" },
    ]);
    expect(tableExists(db, "app_settings")).toBe(true);
    expect(tableExists(db, "events")).toBe(true);
    db.close();
  });

  it("sai com código 1 e reporta versão desconhecida no stderr", () => {
    const databasePath = path.join(root, "cli", "crm.sqlite");
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const db = new Database(databasePath);
    db.exec(
      "CREATE TABLE clients (id TEXT PRIMARY KEY);" +
        "CREATE TABLE contacts (id TEXT PRIMARY KEY, client_id TEXT);" +
        "CREATE TABLE opportunities (id TEXT PRIMARY KEY);" +
        "CREATE TABLE tasks (id TEXT PRIMARY KEY);" +
        "CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL);" +
        "INSERT INTO schema_migrations (version, name) VALUES ('999', 'futura');",
    );
    db.close();

    const result = spawnSync(process.execPath, [migrateScript, databasePath], {
      encoding: "utf8",
      timeout: 60000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/desconhecidas|versão mais nova/);
  });
});

describe("proteções de backup e de banco", () => {
  it("cria o backup antes de criar schema_migrations", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_extra.sql",
      "ALTER TABLE contacts ADD COLUMN extra TEXT;\n",
    );

    const summary = migrateDatabase(db, {
      databasePath: file,
      migrationsDir: dir,
      schemaFile: writeSchema(),
    });

    expect(summary.backupPath).not.toBeNull();
    const backup = new Database(summary.backupPath as string, {
      readonly: true,
    });
    expect(tableExists(backup, "schema_migrations")).toBe(false);
    backup.close();
    expect(tableExists(db, "schema_migrations")).toBe(true);
    db.close();
  });

  it("informa o caminho do backup por callback antes de aplicar", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_extra.sql",
      "ALTER TABLE contacts ADD COLUMN extra TEXT;\n",
    );
    const backups: string[] = [];

    const summary = migrateDatabase(db, {
      databasePath: file,
      migrationsDir: dir,
      schemaFile: writeSchema(),
      onBackup: (backupPath) => backups.push(backupPath),
    });

    expect(backups).toEqual([summary.backupPath]);
    db.close();
  });

  it("recusa arquivo que não é do CRM sem criar tabelas do CRM", () => {
    const file = databaseFile();
    const db = new Database(file);
    db.exec("CREATE TABLE outra_coisa (id TEXT);");
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_extra.sql",
      "CREATE TABLE nao_deveria_existir (id TEXT);\n",
    );

    expect(() =>
      migrateDatabase(db, {
        databasePath: file,
        migrationsDir: dir,
        schemaFile: writeSchema(),
      }),
    ).toThrow(/não parece ser um banco do CRM/);
    expect(tableExists(db, "clients")).toBe(false);
    expect(tableExists(db, "schema_migrations")).toBe(false);
    expect(tableExists(db, "nao_deveria_existir")).toBe(false);
    db.close();
  });

  it("recusa arquivo que não é do CRM em runMigrationsFile e na CLI", () => {
    const databasePath = path.join(root, "estranho", "banco.sqlite");
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const db = new Database(databasePath);
    db.exec("CREATE TABLE outra_coisa (id TEXT);");
    db.close();
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_extra.sql",
      "CREATE TABLE nao_deveria_existir (id TEXT);\n",
    );
    const options = {
      databasePath,
      migrationsDir: dir,
      schemaFile: writeSchema(),
    };

    expect(() => runMigrationsFile(options)).toThrow(
      /não parece ser um banco do CRM/,
    );

    const result = spawnSync(process.execPath, [migrateScript, databasePath], {
      encoding: "utf8",
      timeout: 60000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/não parece ser um banco do CRM/);

    const reopened = new Database(databasePath, { readonly: true });
    expect(tableExists(reopened, "clients")).toBe(false);
    reopened.close();
  });

  it("cita a migration quando o @applied-if tem SQL inválido", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_quebrada.sql",
      "-- @applied-if: SELECT 1 FROM tabela_inexistente;\nCREATE TABLE criada (id TEXT);\n",
    );

    expect(() =>
      migrateDatabase(db, {
        databasePath: file,
        migrationsDir: dir,
        schemaFile: writeSchema(),
      }),
    ).toThrow(/migration 001 \(001_quebrada\.sql\)/);
    expect(tableExists(db, "criada")).toBe(false);
    db.close();
  });

  it("recusa o backup quando o checkpoint WAL fica ocupado", () => {
    const file = databaseFile();
    const db = createExistingDatabase(file);
    const realPragma = db.pragma.bind(db);
    const patched = db as unknown as {
      pragma: (source: string, options?: unknown) => unknown;
    };
    patched.pragma = (source, options) =>
      source.startsWith("wal_checkpoint")
        ? [{ busy: 1, log: 0, checkpointed: 0 }]
        : realPragma(source, options as never);
    const dir = path.join(root, "migrations");
    writeMigration(
      dir,
      "001_extra.sql",
      "ALTER TABLE contacts ADD COLUMN extra TEXT;\n",
    );

    expect(() =>
      migrateDatabase(db, {
        databasePath: file,
        migrationsDir: dir,
        schemaFile: writeSchema(),
      }),
    ).toThrow(/banco está em uso por outro processo/);
    expect(backupFiles(path.dirname(file))).toHaveLength(0);
    expect(columnExists(db, "contacts", "extra")).toBe(false);
    db.close();
  });
});
