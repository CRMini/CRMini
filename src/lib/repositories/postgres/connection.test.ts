import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { poolConstructor, on, query, connect, release } = vi.hoisted(() => ({
  poolConstructor: vi.fn(),
  on: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    on = on;
    query = query;
    connect = connect;

    constructor(config: unknown) {
      poolConstructor(config);
    }
  },
}));

import { getPostgresPool, withPostgresTransaction } from "./connection";

const originalUrl = process.env.CRM_POSTGRES_URL;
const originalMax = process.env.CRM_POSTGRES_MAX_CONNECTIONS;

function resetPool() {
  const globalForPostgres = globalThis as unknown as {
    crmPostgresPool?: unknown;
  };
  delete globalForPostgres.crmPostgresPool;
}

beforeEach(() => {
  delete process.env.CRM_POSTGRES_URL;
  delete process.env.CRM_POSTGRES_MAX_CONNECTIONS;
  poolConstructor.mockReset();
  on.mockReset();
  query.mockReset();
  connect.mockReset();
  release.mockReset();
  resetPool();
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.CRM_POSTGRES_URL;
  else process.env.CRM_POSTGRES_URL = originalUrl;

  if (originalMax === undefined)
    delete process.env.CRM_POSTGRES_MAX_CONNECTIONS;
  else process.env.CRM_POSTGRES_MAX_CONNECTIONS = originalMax;

  resetPool();
});

describe("getPostgresPool", () => {
  it("falha sem CRM_POSTGRES_URL e não cria pool", () => {
    expect(() => getPostgresPool()).toThrow(
      "CRM_POSTGRES_URL não está configurada.",
    );
    expect(poolConstructor).not.toHaveBeenCalled();
  });

  it("rejeita string de conexão inválida", () => {
    process.env.CRM_POSTGRES_URL = "não-é-uma-url";

    expect(() => getPostgresPool()).toThrow("CRM_POSTGRES_URL é inválida.");
  });

  it("rejeita protocolo que não é PostgreSQL", () => {
    process.env.CRM_POSTGRES_URL = "mysql://usuario:senha@host:3306/banco";

    expect(() => getPostgresPool()).toThrow(
      "precisa usar o protocolo postgres:// ou postgresql://",
    );
  });

  it("rejeita limite de conexões inválido", () => {
    process.env.CRM_POSTGRES_URL = "postgres://usuario:senha@host:5432/banco";
    process.env.CRM_POSTGRES_MAX_CONNECTIONS = "0";

    expect(() => getPostgresPool()).toThrow(
      "CRM_POSTGRES_MAX_CONNECTIONS deve ser um inteiro positivo.",
    );
  });

  it("cria um único pool por processo com o limite padrão", () => {
    process.env.CRM_POSTGRES_URL = "postgres://usuario:senha@host:5432/banco";

    const first = getPostgresPool();
    const second = getPostgresPool();

    expect(second).toBe(first);
    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgres://usuario:senha@host:5432/banco",
        max: 10,
        statement_timeout: 30_000,
      }),
    );
  });

  it("respeita CRM_POSTGRES_MAX_CONNECTIONS", () => {
    process.env.CRM_POSTGRES_URL = "postgres://usuario:senha@host:5432/banco";
    process.env.CRM_POSTGRES_MAX_CONNECTIONS = "4";

    getPostgresPool();

    expect(poolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ max: 4 }),
    );
  });
});

describe("withPostgresTransaction", () => {
  beforeEach(() => {
    process.env.CRM_POSTGRES_URL = "postgres://usuario:senha@host:5432/banco";
  });

  it("confirma a transação e libera o cliente", async () => {
    const client = { query, release };
    connect.mockResolvedValue(client);
    query.mockResolvedValue({ rows: [] });

    const result = await withPostgresTransaction(async (received) => {
      expect(received).toBe(client);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("faz rollback, propaga o erro e libera o cliente", async () => {
    const client = { query, release };
    connect.mockResolvedValue(client);
    query.mockResolvedValue({ rows: [] });
    const failure = new Error("falha no callback");

    await expect(
      withPostgresTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("mantém o erro original quando o rollback também falha", async () => {
    const client = { query, release };
    connect.mockResolvedValue(client);
    const failure = new Error("falha no callback");
    query.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("falha no rollback");
      return { rows: [] };
    });

    await expect(
      withPostgresTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(release).toHaveBeenCalledTimes(1);
  });
});
