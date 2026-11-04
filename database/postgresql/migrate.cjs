#!/usr/bin/env node
// Aplica o schema PostgreSQL de database/postgresql/init.sql em um banco
// existente. É idempotente e não cria nem apaga dados.
//
// Uso:
//   CRM_POSTGRES_URL=postgres://usuario:senha@host:porta/banco \
//     npm run db:migrate:postgres

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const envVar = "CRM_POSTGRES_URL";
const schemaFile = path.join(__dirname, "init.sql");

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const connectionString = process.env[envVar];

  if (!connectionString) {
    fail(
      `${envVar} não está configurada. Defina a string de conexão PostgreSQL antes de rodar as migrations.`,
    );
  }

  const schema = fs.readFileSync(schemaFile, "utf8");
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(schema);
    console.log("Schema PostgreSQL aplicado com sucesso.");
  } catch (error) {
    // Não imprime a string de conexão para não expor credenciais.
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Falha ao aplicar o schema PostgreSQL: ${detail}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
