import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDriver = process.env.CRM_DB_DRIVER;

async function importProvider() {
  vi.resetModules();
  return import("./provider");
}

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

describe("resolvePersistenceProvider", () => {
  it("usa sqlite quando CRM_DB_DRIVER não está definido", async () => {
    const { resolvePersistenceProvider } = await importProvider();

    expect(resolvePersistenceProvider()).toBe("sqlite");
  });

  it("trata a variável vazia como ausente", async () => {
    process.env.CRM_DB_DRIVER = "";
    const { resolvePersistenceProvider } = await importProvider();

    expect(resolvePersistenceProvider()).toBe("sqlite");
  });

  it("aceita sqlite explicitamente", async () => {
    process.env.CRM_DB_DRIVER = "sqlite";
    const { resolvePersistenceProvider } = await importProvider();

    expect(resolvePersistenceProvider()).toBe("sqlite");
  });

  it("lança erro claro para driver não suportado", async () => {
    process.env.CRM_DB_DRIVER = "postgres";
    const { resolvePersistenceProvider } = await importProvider();

    expect(() => resolvePersistenceProvider()).toThrow(
      'Driver de persistência não suportado: "postgres". Valores aceitos: sqlite.',
    );
  });

  it("não cai silenciosamente em sqlite para um driver inválido", async () => {
    process.env.CRM_DB_DRIVER = "PostgreSQL";
    const { resolvePersistenceProvider } = await importProvider();

    expect(() => resolvePersistenceProvider()).toThrow(
      /Driver de persistência não suportado/,
    );
  });

  it("resolve o provedor uma única vez por processo", async () => {
    const { resolvePersistenceProvider } = await importProvider();

    expect(resolvePersistenceProvider()).toBe("sqlite");
    process.env.CRM_DB_DRIVER = "postgres";

    expect(resolvePersistenceProvider()).toBe("sqlite");
  });
});
