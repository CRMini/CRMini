import { Pool, type PoolClient } from "pg";

/**
 * Conexão PostgreSQL do modo web.
 *
 * Uso exclusivo no servidor: lê variáveis de ambiente e mantém o pool no
 * processo. Nunca deve ser importado por componentes cliente.
 */

const connectionEnvVar = "CRM_POSTGRES_URL";
const maxConnectionsEnvVar = "CRM_POSTGRES_MAX_CONNECTIONS";
const defaultMaxConnections = 10;

const globalForPostgres = globalThis as unknown as {
  crmPostgresPool?: Pool;
};

function readConnectionString(): string {
  const value = process.env[connectionEnvVar]?.trim();

  if (!value) {
    throw new Error(
      `${connectionEnvVar} não está configurada. Defina a string de conexão PostgreSQL para usar o modo web.`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${connectionEnvVar} é inválida. Use o formato postgres://usuario:senha@host:porta/banco.`,
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      `${connectionEnvVar} precisa usar o protocolo postgres:// ou postgresql://.`,
    );
  }

  return value;
}

function readMaxConnections(): number {
  const configured = process.env[maxConnectionsEnvVar]?.trim();

  if (!configured) return defaultMaxConnections;

  const parsed = Number(configured);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${maxConnectionsEnvVar} deve ser um inteiro positivo. Valor recebido: "${configured}".`,
    );
  }

  return parsed;
}

/** Pool único por processo, criado sob demanda. */
export function getPostgresPool(): Pool {
  if (globalForPostgres.crmPostgresPool) {
    return globalForPostgres.crmPostgresPool;
  }

  const connectionString = readConnectionString();
  const max = readMaxConnections();

  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // Evita que uma consulta presa bloqueie a requisição indefinidamente.
    statement_timeout: 30_000,
  });

  // Sem handler, um erro em cliente ocioso derrubaria o processo Next.js.
  pool.on("error", () => {
    // O erro é propagado pela consulta que falhou; não registramos credenciais.
  });

  globalForPostgres.crmPostgresPool = pool;
  return pool;
}

/**
 * Executa o callback em uma transação usando o mesmo cliente do pool.
 * Sempre devolve o cliente ao pool, inclusive quando o rollback falha.
 */
export async function withPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserva o erro original da transação.
    }
    throw error;
  } finally {
    client.release();
  }
}
