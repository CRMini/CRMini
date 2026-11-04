const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

// Inicia o modo web contra PostgreSQL: aplica o schema (idempotente) e só
// depois sobe o Next.js. O banco padrão é o do compose.yaml local; para outro
// banco, defina CRM_POSTGRES_URL. O desktop não passa por este script.

const DEFAULT_URL = "postgres://crm:crm@127.0.0.1:5432/crm";

function resolveDatabaseUrl(env) {
  const configured = env.CRM_POSTGRES_URL?.trim();

  if (configured) {
    return { url: configured, usingDefault: false };
  }

  return { url: DEFAULT_URL, usingDefault: true };
}

function runDevPostgres({
  env = process.env,
  root = path.join(__dirname, ".."),
  spawnSyncImpl = spawnSync,
  spawnImpl = spawn,
  log = console.log,
  npmCommand = process.platform === "win32" ? "npm.cmd" : "npm",
} = {}) {
  const { url, usingDefault } = resolveDatabaseUrl(env);

  if (usingDefault) {
    log(
      `CRM_POSTGRES_URL não definida; usando o PostgreSQL local do compose (${DEFAULT_URL}).`,
    );
  }

  const childEnv = {
    ...env,
    CRM_DB_DRIVER: "postgres",
    CRM_POSTGRES_URL: url,
  };

  const migrate = spawnSyncImpl(
    process.execPath,
    [path.join(root, "database", "postgresql", "migrate.cjs")],
    { env: childEnv, stdio: "inherit" },
  );

  if (migrate.error) {
    throw new Error(
      `Não foi possível executar as migrations PostgreSQL: ${migrate.error.message}.`,
    );
  }

  if (migrate.status !== 0) {
    throw new Error(
      "Falha ao aplicar o schema PostgreSQL. Verifique CRM_POSTGRES_URL e se o banco está acessível (npm run db:up).",
    );
  }

  log("Schema PostgreSQL pronto. Iniciando Next.js...");

  return spawnImpl(npmCommand, ["run", "dev"], {
    env: childEnv,
    stdio: "inherit",
  });
}

if (require.main === module) {
  try {
    const child = runDevPostgres();

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => {
        if (!child.killed) child.kill(signal);
      });
    }

    child.on("error", (error) => {
      console.error(`Não foi possível iniciar o Next.js: ${error.message}`);
      process.exitCode = 1;
    });

    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_URL, resolveDatabaseUrl, runDevPostgres };
