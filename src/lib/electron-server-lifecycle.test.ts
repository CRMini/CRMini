import { EventEmitter } from "node:events";
import path from "node:path";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createServerLifecycle } =
  require("../../electron/server-lifecycle.cjs") as {
    createServerLifecycle: (options: Record<string, unknown>) => {
      start: (
        dbPath: string,
        options?: Record<string, unknown>,
      ) => Promise<string>;
      stop: () => Promise<void>;
    };
  };

type FakeChild = EventEmitter & {
  exitCode: number | null;
  signalCode: string | null;
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

it("inicia o standalone de produção com server.js e aguarda resposta na porta exclusiva", async () => {
  const child = fakeChild();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  const spawn = vi.fn(() => child);
  const request = vi.fn(
    (_url: string, callback: (response: { resume: () => void }) => void) => {
      const req = new EventEmitter();
      queueMicrotask(() => callback({ resume() {} }));
      return req;
    },
  );
  const server = createServerLifecycle({
    processSpawner: spawn,
    projectDir: "/crm",
    resourcesDir: "/crm/.next/standalone",
    dataDir: "/crm/data",
    isDevelopment: false,
    // Simula variáveis herdadas de um ambiente web: o desktop deve ignorá-las.
    env: {
      CRM_DB_DRIVER: "postgres",
      CRM_POSTGRES_URL: "postgres://usuario:senha@host:5432/banco",
    },
    fileExists: () => true,
  });

  const url = await server.start("/isolated/B.sqlite", { request });

  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    [path.join("/crm/.next/standalone", "server.js")],
    expect.objectContaining({
      cwd: "/crm/.next/standalone",
      env: expect.objectContaining({
        ELECTRON_RUN_AS_NODE: "1",
        SQLITE_PATH: "/isolated/B.sqlite",
        // O desktop sempre usa SQLite, mesmo com variáveis de ambiente web herdadas.
        CRM_DB_DRIVER: "sqlite",
        CRM_RESOURCES_DIR: "/crm/.next/standalone",
        CRM_DATA_DIR: "/crm/data",
      }),
    }),
  );
  await server.stop();
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
});

it("inicia o Next em modo dev com `next dev`", async () => {
  const child = fakeChild();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  const spawn = vi.fn(() => child);
  const request = vi.fn(
    (_url: string, callback: (response: { resume: () => void }) => void) => {
      const req = new EventEmitter();
      queueMicrotask(() => callback({ resume() {} }));
      return req;
    },
  );
  const server = createServerLifecycle({
    processSpawner: spawn,
    projectDir: "/crm",
    isDevelopment: true,
    env: {},
  });

  const url = await server.start("/isolated/B.sqlite", { request });

  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    [
      expect.stringContaining("next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      expect.any(String),
    ],
    expect.objectContaining({
      cwd: "/crm",
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: "1" }),
    }),
  );
  await server.stop();
});

it("rejeita quando o standalone de produção não contém server.js", async () => {
  const server = createServerLifecycle({
    processSpawner: () => fakeChild(),
    projectDir: "/crm",
    resourcesDir: "/crm/.next/standalone",
    isDevelopment: false,
    env: {},
    fileExists: () => false,
  });

  await expect(server.start("/isolated/B.sqlite")).rejects.toThrow(
    /Standalone ausente/,
  );
});

it("passa os diretórios de recursos e dados no modo dev", async () => {
  const child = fakeChild();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  const spawn = vi.fn(() => child);
  const server = createServerLifecycle({
    processSpawner: spawn,
    projectDir: "/crm",
    resourcesDir: "/crm",
    dataDir: "/user/data",
    isDevelopment: true,
    env: {},
  });

  await server.start("/isolated/B.sqlite", {
    request: (
      _url: string,
      callback: (response: { resume: () => void }) => void,
    ) => {
      const req = new EventEmitter();
      queueMicrotask(() => callback({ resume() {} }));
      return req;
    },
  });

  expect(spawn.mock.calls[0][2]).toMatchObject({
    env: {
      CRM_RESOURCES_DIR: "/crm",
      CRM_DATA_DIR: "/user/data",
    },
  });
  await server.stop();
});

it("mata o servidor órfão quando a readiness estoura o prazo", async () => {
  const child = fakeChild();
  const server = createServerLifecycle({
    processSpawner: () => child,
    projectDir: "/crm",
    resourcesDir: "/crm/.next/standalone",
    isDevelopment: false,
    env: {},
    fileExists: () => true,
  });

  await expect(
    server.start("/isolated/B.sqlite", {
      request: () => {
        const req = new EventEmitter();
        // Conexão recusada: agenda a nova tentativa, que então percebe o prazo.
        queueMicrotask(() => req.emit("error", new Error("ECONNREFUSED")));
        return req;
      },
      timeoutMs: 20,
    }),
  ).rejects.toThrow(/não ficou pronto dentro do prazo/);

  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  // Depois do timeout o processo já foi encerrado: stop não deve tentar matar
  // de novo nem deixar referência pendente.
  await server.stop();
  expect(child.kill).toHaveBeenCalledOnce();
});

it("mantém stop concorrente pendente até o processo confirmar saída", async () => {
  const child = fakeChild();
  const server = createServerLifecycle({
    processSpawner: () => child,
    projectDir: "/crm",
    resourcesDir: "/crm/.next/standalone",
    isDevelopment: false,
    env: {},
    fileExists: () => true,
  });
  const starting = server.start("/isolated/B.sqlite", {
    request: (
      _url: string,
      callback: (response: { resume: () => void }) => void,
    ) => {
      const req = new EventEmitter();
      queueMicrotask(() => callback({ resume() {} }));
      return req;
    },
  });
  await starting;
  let resolved = false;
  const firstStop = server.stop().then(() => {
    resolved = true;
  });
  const secondStop = server.stop();
  await Promise.resolve();
  expect(resolved).toBe(false);
  expect(child.kill).toHaveBeenCalledOnce();
  child.exitCode = 0;
  child.emit("exit", 0);
  await Promise.all([firstStop, secondStop]);
  expect(resolved).toBe(true);
});

it("falha prontamente se o processo próprio morrer antes da readiness", async () => {
  const child = fakeChild();
  let spawned!: () => void;
  const spawnReady = new Promise<void>((resolve) => {
    spawned = resolve;
  });
  const server = createServerLifecycle({
    processSpawner: () => {
      spawned();
      return child;
    },
    projectDir: "/crm",
    isDevelopment: true,
    env: {},
  });
  const pending = server.start("/isolated/B.sqlite", {
    request: () => new EventEmitter(),
    timeoutMs: 10000,
  });
  await spawnReady;
  child.emit("exit", 1);
  await expect(pending).rejects.toThrow(/encerrou antes de ficar pronto/);
});

function readyRequest() {
  return (_url: string, callback: (response: { resume: () => void }) => void) => {
    const req = new EventEmitter();
    queueMicrotask(() => callback({ resume() {} }));
    return req;
  };
}

it("passa CRM_ASSETS_DIR ao filho quando assetsDir é informado", async () => {
  const child = fakeChild();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  const spawn = vi.fn(() => child);
  const server = createServerLifecycle({
    processSpawner: spawn,
    projectDir: "/crm",
    isDevelopment: true,
    env: {},
  });

  await server.start("/isolated/B.sqlite", {
    assetsDir: "/isolated/assets",
    request: readyRequest(),
  });

  expect(spawn.mock.calls[0][2]).toMatchObject({
    env: { CRM_ASSETS_DIR: "/isolated/assets" },
  });
  await server.stop();
});

it("não define CRM_ASSETS_DIR quando assetsDir é omitido", async () => {
  const child = fakeChild();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  });
  const spawn = vi.fn(() => child);
  const server = createServerLifecycle({
    processSpawner: spawn,
    projectDir: "/crm",
    isDevelopment: true,
    env: {},
  });

  await server.start("/isolated/B.sqlite", { request: readyRequest() });

  expect(spawn.mock.calls[0][2].env).not.toHaveProperty("CRM_ASSETS_DIR");
  await server.stop();
});
