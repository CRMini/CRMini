const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const CRM_TABLES = ["clients", "contacts", "opportunities", "tasks"];

function defaultDatabasePath({
  platform = process.platform,
  env = process.env,
  home = require("node:os").homedir(),
  userData,
} = {}) {
  if (env.SQLITE_PATH) return env.SQLITE_PATH;
  if (userData) return path.join(userData, "crm.sqlite");
  if (platform === "win32")
    return path.join(
      env.APPDATA || path.join(home, "AppData", "Roaming"),
      "CRMini",
      "crm.sqlite",
    );
  if (platform === "darwin")
    return path.join(
      home,
      "Library",
      "Application Support",
      "CRMini",
      "crm.sqlite",
    );
  return path.join(
    env.XDG_DATA_HOME || path.join(home, ".local", "share"),
    "CRMini",
    "crm.sqlite",
  );
}

function validateDatabase(filename) {
  if (!fs.existsSync(filename) || fs.statSync(filename).size === 0)
    return "new";
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    if (!CRM_TABLES.every((table) => tables.includes(table)))
      throw new Error("O arquivo selecionado não parece ser um banco do CRM.");
    return "crm";
  } finally {
    db.close();
  }
}

async function migrateLegacyDatabase(legacy, destination) {
  if (fs.existsSync(destination) || !fs.existsSync(legacy)) return false;
  if (validateDatabase(legacy) !== "crm")
    throw new Error("O banco antigo não parece ser do CRM.");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const source = new Database(legacy, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destination);
  } finally {
    source.close();
  }
  try {
    validateDatabase(destination);
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  }
  return true;
}

function selectDatabasePath({ choice, fallback, selected }) {
  if (choice === "default") return fallback;
  if (choice === "cancel") return null;
  if (!selected) return null;
  validateDatabase(selected);
  return selected;
}
function shouldMigrateLegacy(env = process.env) {
  return !env.SQLITE_PATH;
}

module.exports = {
  CRM_TABLES,
  defaultDatabasePath,
  validateDatabase,
  migrateLegacyDatabase,
  selectDatabasePath,
  shouldMigrateLegacy,
};
