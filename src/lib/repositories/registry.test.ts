import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Repositories } from "./registry";

const originalDriver = process.env.CRM_DB_DRIVER;

async function importRegistry(): Promise<typeof import("./registry")> {
  vi.resetModules();
  return import("./registry");
}

const domainMethods: Array<[keyof Repositories, string[]]> = [
  [
    "clients",
    [
      "listClients",
      "listClientOptions",
      "createClient",
      "getClient",
      "updateClient",
      "deactivateClient",
    ],
  ],
  [
    "contacts",
    [
      "createContact",
      "getContact",
      "deactivateContact",
      "reactivateContact",
      "updateContact",
      "listContacts",
      "planContactImport",
      "createContactsBatch",
    ],
  ],
  [
    "opportunities",
    [
      "listOpportunities",
      "createOpportunity",
      "changeOpportunityStatus",
      "updateOpportunity",
      "getOpportunity",
    ],
  ],
  ["tasks", ["listTasks", "createTask", "updateTaskStatus"]],
  [
    "events",
    ["listEvents", "getEvent", "createEvent", "updateEvent", "deactivateEvent"],
  ],
  ["settings", ["getUserName", "saveUserName"]],
  ["dashboard", ["getMetrics", "getRecentOpportunities"]],
];

beforeEach(() => {
  delete process.env.CRM_DB_DRIVER;
});

afterEach(() => {
  if (originalDriver === undefined) {
    delete process.env.CRM_DB_DRIVER;
  } else {
    process.env.CRM_DB_DRIVER = originalDriver;
  }
});

describe("getRepositories", () => {
  it("expõe os sete domínios com os métodos do contrato", async () => {
    const { getRepositories } = await importRegistry();

    const repositories = getRepositories();

    expect(Object.keys(repositories).sort()).toEqual(
      [
        "clients",
        "contacts",
        "dashboard",
        "events",
        "opportunities",
        "settings",
        "tasks",
      ].sort(),
    );

    for (const [domain, methods] of domainMethods) {
      const repository = repositories[domain] as unknown as Record<
        string,
        unknown
      >;
      for (const method of methods) {
        expect(repository[method]).toBeTypeOf("function");
      }
    }
  });

  it("resolve o conjunto uma única vez por processo", async () => {
    const { getRepositories } = await importRegistry();

    const first = getRepositories();
    const second = getRepositories();

    expect(second).toBe(first);
    expect(second.clients).toBe(first.clients);
    expect(second.dashboard).toBe(first.dashboard);
  });

  it("mantém o conjunto já resolvido mesmo após mudar CRM_DB_DRIVER", async () => {
    const { getRepositories } = await importRegistry();

    const first = getRepositories();
    process.env.CRM_DB_DRIVER = "postgres";
    const second = getRepositories();

    expect(second).toBe(first);
  });

  it("monta o conjunto PostgreSQL quando o driver é postgres", async () => {
    process.env.CRM_DB_DRIVER = "postgres";
    const { getRepositories } = await importRegistry();
    const { postgresClientsRepository } = await import("./postgres/clients");
    const { postgresDashboardRepository } =
      await import("./postgres/dashboard");

    const repositories = getRepositories();

    expect(repositories.clients).toBe(postgresClientsRepository);
    expect(repositories.dashboard).toBe(postgresDashboardRepository);
  });

  it("lança erro explícito para driver inválido sem cair no SQLite", async () => {
    process.env.CRM_DB_DRIVER = "mysql";
    const { getRepositories } = await importRegistry();

    expect(() => getRepositories()).toThrow(
      'Driver de persistência não suportado: "mysql". Valores aceitos: sqlite, postgres.',
    );

    // Sem fallback: uma nova chamada continua falhando em vez de devolver SQLite.
    expect(() => getRepositories()).toThrow(
      /Driver de persistência não suportado/,
    );
  });

  it("rejeita driver com caixa diferente em vez de normalizar", async () => {
    process.env.CRM_DB_DRIVER = "SQLite";
    const { getRepositories } = await importRegistry();

    expect(() => getRepositories()).toThrow(
      'Driver de persistência não suportado: "SQLite". Valores aceitos: sqlite, postgres.',
    );
  });
});
