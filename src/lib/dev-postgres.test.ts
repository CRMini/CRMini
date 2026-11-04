import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { DEFAULT_URL, resolveDatabaseUrl, runDevPostgres } =
  require("../../scripts/dev-postgres.cjs") as {
    DEFAULT_URL: string;
    resolveDatabaseUrl: (env: NodeJS.ProcessEnv) => {
      url: string;
      usingDefault: boolean;
    };
    runDevPostgres: (options?: Record<string, unknown>) => unknown;
  };

const root = path.join(process.cwd());

function spawnSyncSuccess() {
  return vi.fn().mockReturnValue({ status: 0 });
}

describe("resolveDatabaseUrl", () => {
  it("usa a URL configurada quando existe", () => {
    expect(
      resolveDatabaseUrl({
        CRM_POSTGRES_URL: "postgres://usuario:senha@host:5432/banco",
      }),
    ).toEqual({
      url: "postgres://usuario:senha@host:5432/banco",
      usingDefault: false,
    });
  });

  it("recorre ao banco local do compose quando não há configuração", () => {
    expect(resolveDatabaseUrl({})).toEqual({
      url: DEFAULT_URL,
      usingDefault: true,
    });
  });

  it("trata valor em branco como ausente", () => {
    expect(resolveDatabaseUrl({ CRM_POSTGRES_URL: "   " }).usingDefault).toBe(
      true,
    );
  });
});

describe("runDevPostgres", () => {
  it("aplica o schema antes de iniciar o Next.js com o provedor postgres", () => {
    const spawnSyncImpl = spawnSyncSuccess();
    const spawnImpl = vi.fn().mockReturnValue({ on: vi.fn(), kill: vi.fn() });
    const log = vi.fn();

    runDevPostgres({
      env: { CRM_POSTGRES_URL: "postgres://usuario:senha@host:5432/banco" },
      root,
      spawnSyncImpl,
      spawnImpl,
      log,
      npmCommand: "npm",
    });

    const [, args, options] = spawnSyncImpl.mock.calls[0];
    expect(args).toEqual([
      path.join(root, "database", "postgresql", "migrate.cjs"),
    ]);
    expect(options.env).toMatchObject({
      CRM_DB_DRIVER: "postgres",
      CRM_POSTGRES_URL: "postgres://usuario:senha@host:5432/banco",
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      "npm",
      ["run", "dev"],
      expect.objectContaining({
        env: expect.objectContaining({
          CRM_DB_DRIVER: "postgres",
          CRM_POSTGRES_URL: "postgres://usuario:senha@host:5432/banco",
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith(
      "Schema PostgreSQL pronto. Iniciando Next.js...",
    );
  });

  it("avisa quando usa o banco local do compose", () => {
    const log = vi.fn();

    runDevPostgres({
      env: {},
      root,
      spawnSyncImpl: spawnSyncSuccess(),
      spawnImpl: vi.fn().mockReturnValue({ on: vi.fn(), kill: vi.fn() }),
      log,
      npmCommand: "npm",
    });

    expect(log).toHaveBeenCalledWith(
      `CRM_POSTGRES_URL não definida; usando o PostgreSQL local do compose (${DEFAULT_URL}).`,
    );
  });

  it("não inicia o Next.js quando as migrations falham", () => {
    const spawnImpl = vi.fn();

    expect(() =>
      runDevPostgres({
        env: {},
        root,
        spawnSyncImpl: vi.fn().mockReturnValue({ status: 1 }),
        spawnImpl,
        log: vi.fn(),
        npmCommand: "npm",
      }),
    ).toThrow("Falha ao aplicar o schema PostgreSQL.");

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("relata erro ao executar o processo de migrations", () => {
    expect(() =>
      runDevPostgres({
        env: {},
        root,
        spawnSyncImpl: vi.fn().mockReturnValue({
          error: new Error("ENOENT"),
          status: null,
        }),
        spawnImpl: vi.fn(),
        log: vi.fn(),
        npmCommand: "npm",
      }),
    ).toThrow("Não foi possível executar as migrations PostgreSQL: ENOENT.");
  });
});
