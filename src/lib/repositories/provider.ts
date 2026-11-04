/**
 * Seleção do provedor de persistência.
 *
 * Uso exclusivo no servidor: este módulo lê variáveis de ambiente e deve ser
 * importado apenas pela camada de repositórios, nunca por componentes cliente.
 */

const SUPPORTED_PROVIDERS = ["sqlite", "postgres"] as const;

export type PersistenceProvider = (typeof SUPPORTED_PROVIDERS)[number];

const DEFAULT_PROVIDER: PersistenceProvider = "sqlite";
const DRIVER_ENV_VAR = "CRM_DB_DRIVER";

let resolvedProvider: PersistenceProvider | undefined;

function isSupportedProvider(value: string): value is PersistenceProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolve o provedor uma única vez por processo. Valores não suportados
 * lançam erro em vez de cair silenciosamente no SQLite.
 */
export function resolvePersistenceProvider(): PersistenceProvider {
  if (resolvedProvider) return resolvedProvider;

  const configured = process.env[DRIVER_ENV_VAR];

  if (!configured) {
    resolvedProvider = DEFAULT_PROVIDER;
    return resolvedProvider;
  }

  if (!isSupportedProvider(configured)) {
    throw new Error(
      `Driver de persistência não suportado: "${configured}". ` +
        `Valores aceitos: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }

  resolvedProvider = configured;
  return resolvedProvider;
}
