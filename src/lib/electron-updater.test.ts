import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

type UpdateSnapshot = {
  enabled: boolean;
  reason?: "development" | "portable" | "opt-out";
  status: string;
  currentVersion: string;
  targetVersion?: string;
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };
  error?: { phase: string; message: string; visible: boolean };
  checkedAt?: string;
};

type UpdaterResult = {
  ok: boolean;
  error?: string;
  snapshot: UpdateSnapshot;
};

type FakeAutoUpdater = EventEmitter & {
  checkForUpdates: ReturnType<typeof vi.fn>;
  downloadUpdate: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
  autoDownload?: boolean;
  autoInstallOnAppQuit?: boolean;
  allowDowngrade?: boolean;
  allowPrerelease?: boolean;
  logger?: unknown;
};

type Updater = {
  start: () => void;
  stop: () => void;
  getSnapshot: () => UpdateSnapshot;
  check: (options?: { manual?: boolean }) => Promise<UpdaterResult>;
  checkOnStartup: () => void;
  download: () => Promise<UpdaterResult>;
  install: () => Promise<UpdaterResult>;
  handleAutoUpdaterEvent: (name: string, payload?: unknown) => UpdateSnapshot;
  isEnabled: () => boolean;
};

const { createUpdater, registerUpdaterIpc } =
  require("../../electron/updater.cjs") as {
    createUpdater: (options: Record<string, unknown>) => Updater;
    registerUpdaterIpc: (options: Record<string, unknown>) => () => void;
  };

const UPDATER_EVENTS = [
  "update-available",
  "update-not-available",
  "error",
  "download-progress",
  "update-downloaded",
];

// Deixa as microtasks do check/download assentarem sem usar relógio real.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Drena só microtasks: uma promessa que depende de `setImmediate` continua
// pendente depois destas voltas, que é justamente o que o tick de instalação
// precisa provar.
async function drainMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function createFakeAutoUpdater(): FakeAutoUpdater {
  const autoUpdater = new EventEmitter() as unknown as FakeAutoUpdater;
  autoUpdater.checkForUpdates = vi.fn().mockResolvedValue(undefined);
  autoUpdater.downloadUpdate = vi.fn().mockResolvedValue(undefined);
  autoUpdater.quitAndInstall = vi.fn();
  return autoUpdater;
}

// Agendador manual: guarda os callbacks e os atrasos para o teste decidir
// quando cada timer dispara, sem depender de timers reais.
function createScheduler() {
  let nextId = 1;
  const timers = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    delays,
    setTimeout: vi.fn((callback: () => void, delayMs: number) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      delays.push(delayMs);
      return id;
    }),
    clearTimeout: vi.fn((id: number) => {
      timers.delete(id);
    }),
    pending: () => timers.size,
    async runNext() {
      const iterator = timers.entries();
      const first = iterator.next();
      if (first.done) throw new Error("Nenhum timer agendado");
      const [id, callback] = first.value;
      timers.delete(id);
      callback();
      await flush();
    },
  };
}

type SetupOverrides = {
  appInfo?: { isPackaged: boolean; version: string };
  autoUpdater?: FakeAutoUpdater | null;
  env?: Record<string, string | undefined>;
  random?: () => number;
  jitterRatio?: number;
  initialDelayMs?: number;
  intervalMs?: number;
  minAutomaticIntervalMs?: number;
  errorBackoffMs?: number[];
  maxErrorMessageLength?: number;
  beforeInstall?: ReturnType<typeof vi.fn>;
  quitAndInstall?: ReturnType<typeof vi.fn>;
  onInstallError?: ReturnType<typeof vi.fn>;
};

function setup(overrides: SetupOverrides = {}) {
  const clock = { value: 1_750_000_000_000 };
  const autoUpdater =
    overrides.autoUpdater === undefined
      ? createFakeAutoUpdater()
      : overrides.autoUpdater;
  const scheduler = createScheduler();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const broadcast = vi.fn();
  const storageState = { lastCheckAt: null as number | null };
  const storage = {
    getLastCheckAt: vi.fn(() => storageState.lastCheckAt),
    setLastCheckAt: vi.fn((value: number) => {
      storageState.lastCheckAt = value;
    }),
  };
  const beforeInstall = overrides.beforeInstall ?? vi.fn(async () => {});
  const quitAndInstall = overrides.quitAndInstall ?? vi.fn();
  const onInstallError = overrides.onInstallError ?? vi.fn(async () => {});

  const updater = createUpdater({
    appInfo: overrides.appInfo ?? { isPackaged: true, version: "0.2.0" },
    autoUpdater,
    env: overrides.env ?? {},
    logger,
    broadcast,
    scheduler,
    now: () => clock.value,
    random: overrides.random ?? (() => 0.5),
    storage,
    beforeInstall,
    quitAndInstall,
    onInstallError,
    initialDelayMs: overrides.initialDelayMs ?? 10_000,
    intervalMs: overrides.intervalMs ?? 4 * 60 * 60 * 1000,
    minAutomaticIntervalMs: overrides.minAutomaticIntervalMs ?? 30 * 60 * 1000,
    errorBackoffMs: overrides.errorBackoffMs ?? [
      15 * 60e3,
      30 * 60e3,
      60 * 60e3,
      6 * 60 * 60e3,
    ],
    jitterRatio: overrides.jitterRatio ?? 0.1,
    ...(overrides.maxErrorMessageLength === undefined
      ? {}
      : { maxErrorMessageLength: overrides.maxErrorMessageLength }),
  });

  // Avança o relógio pelo atraso do último timer agendado e o dispara: é o que
  // o processo principal veria quando o tempo realmente passasse.
  async function tick() {
    const delay = scheduler.delays.at(-1);
    if (delay === undefined) {
      throw new Error("Nenhum timer agendado para avançar");
    }
    clock.value += delay;
    await scheduler.runNext();
  }

  return {
    updater,
    autoUpdater,
    scheduler,
    logger,
    broadcast,
    storage,
    storageState,
    beforeInstall,
    quitAndInstall,
    onInstallError,
    clock,
    tick,
  };
}

type Context = ReturnType<typeof setup> & { autoUpdater: FakeAutoUpdater };

async function reachAvailable(context: Context) {
  // Em produção `start()` é quem assina os eventos do electron-updater.
  context.updater.start();
  await context.updater.check({ manual: true });
  context.autoUpdater.emit("update-available", { version: "0.3.0" });
}

async function reachDownloading(context: Context) {
  await reachAvailable(context);
  await context.updater.download();
}

async function reachDownloaded(context: Context) {
  await reachDownloading(context);
  context.autoUpdater.emit("update-downloaded", { version: "0.3.0" });
}

describe("createUpdater: guards", () => {
  it("habilita quando empacotado, fora do portátil e sem opt-out", () => {
    const { updater } = setup();

    expect(updater.isEnabled()).toBe(true);
    expect(updater.getSnapshot()).toEqual({
      enabled: true,
      status: "idle",
      currentVersion: "0.2.0",
    });
  });

  it("desabilita em desenvolvimento sem registrar timers nem listeners", async () => {
    const { updater, scheduler, autoUpdater, broadcast, logger } = setup({
      appInfo: { isPackaged: false, version: "0.2.0" },
    });

    updater.start();

    expect(updater.isEnabled()).toBe(false);
    expect(scheduler.setTimeout).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(0);
    for (const event of UPDATER_EVENTS) {
      expect(autoUpdater.listenerCount(event)).toBe(0);
    }
    expect(broadcast).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("development"),
    );

    const result = await updater.check({ manual: true });
    expect(result.ok).toBe(false);
    expect(result.snapshot).toEqual({
      enabled: false,
      reason: "development",
      status: "idle",
      currentVersion: "0.2.0",
    });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it.each([
    ["PORTABLE_EXECUTABLE_DIR", "/opt/crmini"],
    ["PORTABLE_EXECUTABLE_FILE", "/opt/crmini/CRMini.exe"],
  ])("desabilita em execução portátil (%s)", (key, value) => {
    const { updater } = setup({ env: { [key]: value } });

    expect(updater.isEnabled()).toBe(false);
    expect(updater.getSnapshot().reason).toBe("portable");
  });

  it.each(["1", "true", "YES", "TrUe"])(
    "desabilita por CRM_DISABLE_UPDATES=%s",
    (value) => {
      const { updater } = setup({ env: { CRM_DISABLE_UPDATES: value } });

      expect(updater.isEnabled()).toBe(false);
      expect(updater.getSnapshot().reason).toBe("opt-out");
    },
  );

  it("não trata CRM_DISABLE_UPDATES=0 como opt-out", () => {
    const { updater } = setup({ env: { CRM_DISABLE_UPDATES: "0" } });

    expect(updater.isEnabled()).toBe(true);
    expect(updater.getSnapshot().reason).toBeUndefined();
  });

  it("dá prioridade ao opt-out sobre desenvolvimento", () => {
    const { updater } = setup({
      appInfo: { isPackaged: false, version: "0.2.0" },
      env: { CRM_DISABLE_UPDATES: "1" },
    });

    expect(updater.getSnapshot().reason).toBe("opt-out");
  });

  it("desabilita sem instância do electron-updater sem quebrar", () => {
    const { updater, scheduler, logger } = setup({ autoUpdater: null });

    expect(updater.isEnabled()).toBe(false);
    expect(updater.getSnapshot()).toEqual({
      enabled: false,
      status: "idle",
      currentVersion: "0.2.0",
    });
    expect(() => updater.start()).not.toThrow();
    expect(scheduler.pending()).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("electron-updater ausente"),
    );
  });

  it("rejeita appInfo ausente", () => {
    expect(() => createUpdater({ autoUpdater: null, env: {} })).toThrow(
      TypeError,
    );
  });
});

describe("createUpdater: transições", () => {
  it("check → checking com checkedAt e depois available", async () => {
    const { updater, autoUpdater, clock } = setup();
    updater.start();

    const pending = updater.check({ manual: true });
    expect(updater.getSnapshot().status).toBe("checking");
    expect(updater.getSnapshot().checkedAt).toBe(
      new Date(clock.value).toISOString(),
    );
    await pending;

    // Sem evento do electron-updater o estado continua em "checking".
    expect(updater.getSnapshot().status).toBe("checking");

    autoUpdater.emit("update-available", { version: "0.3.0" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "available",
      targetVersion: "0.3.0",
    });
  });

  it("update-not-available volta para idle", async () => {
    const { updater, autoUpdater } = setup();
    updater.start();

    await updater.check({ manual: true });
    autoUpdater.emit("update-not-available");

    expect(updater.getSnapshot().status).toBe("idle");
    expect(updater.getSnapshot().targetVersion).toBeUndefined();
  });

  it("erro na checagem vira error com phase check e visible false", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("feed fora"));

    const result = await updater.check({ manual: true });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("feed fora");
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: { phase: "check", message: "feed fora", visible: false },
    });
  });

  it("download → downloading e update-downloaded → downloaded", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;

    await reachAvailable(context);

    const pending = updater.download();
    expect(updater.getSnapshot().status).toBe("downloading");
    await pending;
    expect(updater.getSnapshot().status).toBe("downloading");

    autoUpdater.emit("update-downloaded", { version: "0.3.0" });

    expect(updater.getSnapshot()).toMatchObject({
      status: "downloaded",
      targetVersion: "0.3.0",
    });
    expect(updater.getSnapshot().progress).toBeUndefined();
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("download-progress atualiza percentual e bytes", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;

    await reachDownloading(context);
    autoUpdater.emit("download-progress", {
      percent: 42.4,
      transferred: 1024,
      total: 4096,
      bytesPerSecond: 512,
    });

    expect(updater.getSnapshot().progress).toEqual({
      percent: 42,
      transferred: 1024,
      total: 4096,
      bytesPerSecond: 512,
    });
  });

  it("install passa por installing e chama beforeInstall antes de quitAndInstall", async () => {
    const context = setup();
    const { updater, beforeInstall, quitAndInstall } = context;

    await reachDownloaded(context);

    const result = await updater.install();

    expect(result.ok).toBe(true);
    expect(updater.getSnapshot().status).toBe("installing");
    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(beforeInstall.mock.invocationCallOrder[0]).toBeLessThan(
      quitAndInstall.mock.invocationCallOrder[0],
    );
  });

  it("falha em quitAndInstall vira error de instalação visível", async () => {
    const context = setup();
    const { updater, quitAndInstall, logger } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => {
      throw new Error("não foi possível reiniciar");
    });

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: {
        phase: "install",
        message: "não foi possível reiniciar",
        visible: true,
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("não foi possível reiniciar"),
    );
  });

  it("falha em beforeInstall impede quitAndInstall e vira error de instalação", async () => {
    const context = setup();
    const { updater, beforeInstall, quitAndInstall } = context;

    await reachDownloaded(context);
    beforeInstall.mockRejectedValueOnce(new Error("falha ao parar servidor"));

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: {
        phase: "install",
        message: "falha ao parar servidor",
        visible: true,
      },
    });
  });

  it("error durante beforeInstall aborta a instalação antes do quitAndInstall", async () => {
    const context = setup();
    const {
      updater,
      autoUpdater,
      beforeInstall,
      quitAndInstall,
      onInstallError,
    } = context;

    await reachDownloaded(context);
    beforeInstall.mockImplementationOnce(async () => {
      // O electron-updater sinaliza a falha enquanto o app ainda está em
      // `installing` e o `quitAndInstall` ainda não foi pedido.
      autoUpdater.emit("error", new Error("servidor não parou"));
    });

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("servidor não parou");
    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      targetVersion: "0.3.0",
      error: {
        phase: "install",
        message: "servidor não parou",
        visible: true,
      },
    });
    expect(onInstallError).toHaveBeenCalledTimes(1);
    expect(onInstallError).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        targetVersion: "0.3.0",
        error: {
          phase: "install",
          message: "servidor não parou",
          visible: true,
        },
      }),
    );
  });

  it("ignora eventos obsoletos fora da fase correspondente", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;
    updater.start();

    // download-progress fora de downloading não cria progresso.
    autoUpdater.emit("download-progress", { percent: 50 });
    expect(updater.getSnapshot().status).toBe("idle");
    expect(updater.getSnapshot().progress).toBeUndefined();

    await reachDownloading(context);
    const downloadingSnapshot = updater.getSnapshot();

    // update-not-available durante o download não volta para idle.
    autoUpdater.emit("update-not-available");
    expect(updater.getSnapshot()).toEqual(downloadingSnapshot);

    autoUpdater.emit("update-downloaded", { version: "0.3.0" });
    await updater.install();
    const installingSnapshot = updater.getSnapshot();
    expect(installingSnapshot.status).toBe("installing");

    // Durante a instalação o processo está encerrando: eventos que não são
    // `error` continuam sem efeito (só `error` sinaliza que o reinício falhou).
    autoUpdater.emit("update-available", { version: "9.9.9" });
    autoUpdater.emit("download-progress", { percent: 99 });
    autoUpdater.emit("update-not-available");
    expect(updater.getSnapshot()).toEqual(installingSnapshot);
  });

  it("error durante installing vira falha de instalação visível", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;

    await reachDownloaded(context);
    await expect(updater.install()).resolves.toMatchObject({ ok: true });
    expect(updater.getSnapshot().status).toBe("installing");

    autoUpdater.emit("error", new Error("tarde demais"));
    await flush();

    expect(updater.getSnapshot()).toEqual({
      enabled: true,
      status: "error",
      currentVersion: "0.2.0",
      targetVersion: "0.3.0",
      error: {
        phase: "install",
        message: "tarde demais",
        visible: true,
      },
      checkedAt: expect.any(String),
    });
  });

  it("erro fora de fase ativa é apenas registrado", async () => {
    const { updater, autoUpdater, logger } = setup();
    updater.start();

    autoUpdater.emit("error", new Error("falha solta"));

    expect(updater.getSnapshot().status).toBe("idle");
    expect(updater.getSnapshot().error).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("falha solta"),
    );
  });

  it("download quando já baixado não baixa de novo", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;

    await reachDownloaded(context);
    autoUpdater.downloadUpdate.mockClear();

    await expect(updater.download()).resolves.toMatchObject({ ok: true });
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("download fora de available/error retorna falha", async () => {
    const { updater, autoUpdater } = setup();

    const result = await updater.download();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Atualização não disponível.");
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("install fora de downloaded retorna falha sem chamar quitAndInstall", async () => {
    const context = setup();
    const { updater, quitAndInstall } = context;

    await reachDownloading(context);

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Atualização não baixada.");
    expect(quitAndInstall).not.toHaveBeenCalled();
  });
});

describe("createUpdater: instalação", () => {
  it("quitAndInstall devolvendo false vira error de instalação e ok false", async () => {
    const context = setup();
    const { updater, quitAndInstall, onInstallError } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => false);

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "O electron-updater não aceitou reiniciar para instalar.",
    );
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      targetVersion: "0.3.0",
      error: {
        phase: "install",
        message: "O electron-updater não aceitou reiniciar para instalar.",
        visible: true,
      },
    });
    expect(onInstallError).toHaveBeenCalledTimes(1);
  });

  it("error emitido dentro de quitAndInstall falha a instalação", async () => {
    const context = setup();
    const { updater, autoUpdater, quitAndInstall, onInstallError } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => {
      // electron-updater sinaliza a falha por evento, na mesma volta.
      autoUpdater.emit("error", new Error("falhou ao reiniciar"));
    });

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("falhou ao reiniciar");
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      targetVersion: "0.3.0",
      error: {
        phase: "install",
        message: "falhou ao reiniciar",
        visible: true,
      },
    });
    expect(onInstallError).toHaveBeenCalledTimes(1);
    expect(onInstallError).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        status: "error",
        currentVersion: "0.2.0",
        targetVersion: "0.3.0",
        error: {
          phase: "install",
          message: "falhou ao reiniciar",
          visible: true,
        },
      }),
    );
  });

  it("só resolve ok:true depois do tick do setImmediate e sem onInstallError", async () => {
    const context = setup();
    const { updater, quitAndInstall, onInstallError } = context;

    await reachDownloaded(context);

    let settled = false;
    const pending = updater.install().then((value) => {
      settled = true;
      return value;
    });

    // Microtasks bastam para chegar ao quitAndInstall; o tick real ainda não
    // ocorreu, então a instalação não pode ter sido dada como bem-sucedida.
    await drainMicrotasks();
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(updater.getSnapshot().status).toBe("installing");
    expect(onInstallError).not.toHaveBeenCalled();
  });

  it("error depois do tick vira error/install mesmo após ok:true", async () => {
    const context = setup();
    const { updater, autoUpdater, onInstallError } = context;

    await reachDownloaded(context);
    await expect(updater.install()).resolves.toMatchObject({ ok: true });

    autoUpdater.emit("error", new Error("reinício não ocorreu"));
    await flush();

    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      targetVersion: "0.3.0",
      error: {
        phase: "install",
        message: "reinício não ocorreu",
        visible: true,
      },
    });
    expect(onInstallError).toHaveBeenCalledTimes(1);
  });

  it("onInstallError roda uma única vez por tentativa mesmo com evento e false", async () => {
    const context = setup();
    const { updater, autoUpdater, quitAndInstall, onInstallError } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => {
      autoUpdater.emit("error", new Error("falha síncrona"));
      return false;
    });

    const result = await updater.install();

    // O evento e o retorno `false` descrevem a mesma falha.
    expect(result.ok).toBe(false);
    expect(result.error).toBe("falha síncrona");
    expect(onInstallError).toHaveBeenCalledTimes(1);
  });

  it("rejeição de onInstallError não quebra a instalação e é logada", async () => {
    const context = setup();
    const { updater, quitAndInstall, onInstallError, logger } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => false);
    onInstallError.mockRejectedValueOnce(new Error("restauração falhou"));

    const result = await updater.install();

    expect(result.ok).toBe(false);
    expect(onInstallError).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("restauração falhou"),
    );
  });

  it("install aceita nova tentativa depois de falha de instalação", async () => {
    const context = setup();
    const { updater, quitAndInstall, onInstallError } = context;

    await reachDownloaded(context);
    quitAndInstall.mockImplementationOnce(() => false);

    const failed = await updater.install();
    expect(failed.ok).toBe(false);
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      targetVersion: "0.3.0",
      error: { phase: "install" },
    });

    const retried = await updater.install();

    expect(retried.ok).toBe(true);
    expect(updater.getSnapshot()).toMatchObject({
      status: "installing",
      targetVersion: "0.3.0",
    });
    expect(quitAndInstall).toHaveBeenCalledTimes(2);
    // A tentativa bem-sucedida não pede restauração de novo.
    expect(onInstallError).toHaveBeenCalledTimes(1);
  });

  it("install após falha de beforeInstall também pode ser retentado", async () => {
    const context = setup();
    const { updater, beforeInstall, quitAndInstall } = context;

    await reachDownloaded(context);
    beforeInstall.mockRejectedValueOnce(new Error("servidor não parou"));

    const failed = await updater.install();
    expect(failed.ok).toBe(false);
    expect(quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: { phase: "install", message: "servidor não parou", visible: true },
    });

    const retried = await updater.install();

    expect(retried.ok).toBe(true);
    expect(beforeInstall).toHaveBeenCalledTimes(2);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe("createUpdater: concorrência", () => {
  it("duas checagens simultâneas chamam o autoUpdater uma vez", async () => {
    const { updater, autoUpdater } = setup();
    let resolveCheck!: () => void;
    autoUpdater.checkForUpdates.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCheck = resolve;
      }),
    );

    const first = updater.check({ manual: true });
    const second = updater.check({ manual: true });

    expect(second).toBe(first);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    resolveCheck();
    await first;
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("dois downloads simultâneos chamam o autoUpdater uma vez", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;
    await reachAvailable(context);

    let resolveDownload!: () => void;
    autoUpdater.downloadUpdate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
    );

    const first = updater.download();
    const second = updater.download();

    expect(second).toBe(first);
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);

    resolveDownload();
    await first;
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("check durante download retorna falha sem nova checagem", async () => {
    const context = setup();
    const { updater, autoUpdater } = context;
    await reachAvailable(context);

    let resolveDownload!: () => void;
    autoUpdater.downloadUpdate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
    );
    const downloading = updater.download();
    autoUpdater.checkForUpdates.mockClear();

    const result = await updater.check({ manual: true });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Atualização em andamento.");
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

    resolveDownload();
    await downloading;
  });
});

describe("createUpdater: agendamento", () => {
  it("permite disparar a checagem no boot sem esperar o timer inicial", async () => {
    const { updater, scheduler, autoUpdater } = setup();
    let resolveCheck!: () => void;
    autoUpdater.checkForUpdates.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCheck = resolve;
      }),
    );

    updater.start();
    const checking = updater.check();

    expect(updater.getSnapshot().status).toBe("checking");
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(scheduler.delays).toEqual([10_000]);

    resolveCheck();
    await checking;
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("primeira checagem ocorre após initialDelayMs e agenda intervalMs", async () => {
    const { updater, scheduler, autoUpdater, tick } = setup();

    updater.start();
    expect(scheduler.delays).toEqual([10_000]);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.allowPrerelease).toBe(false);
    for (const event of UPDATER_EVENTS) {
      expect(autoUpdater.listenerCount(event)).toBe(1);
    }

    await tick();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(scheduler.delays).toEqual([10_000, 4 * 60 * 60 * 1000]);
  });

  it("start é idempotente", () => {
    const { updater, scheduler, autoUpdater } = setup();

    updater.start();
    updater.start();

    expect(scheduler.delays).toEqual([10_000]);
    expect(autoUpdater.listenerCount("error")).toBe(1);
  });

  it("erro agenda backoff crescente e sucesso volta ao intervalo normal", async () => {
    const { updater, scheduler, autoUpdater, tick } = setup({
      minAutomaticIntervalMs: 0,
    });
    autoUpdater.checkForUpdates
      .mockRejectedValueOnce(new Error("primeira falha"))
      .mockRejectedValueOnce(new Error("segunda falha"));

    updater.start();
    await tick();

    expect(updater.getSnapshot().status).toBe("error");
    expect(scheduler.delays.at(-1)).toBe(15 * 60e3);

    await tick();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(scheduler.delays.at(-1)).toBe(30 * 60e3);

    // Sucesso agenda o intervalo normal e update-not-available zera o backoff.
    await tick();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3);
    autoUpdater.emit("update-not-available");
    expect(scheduler.delays.at(-1)).toBe(4 * 60 * 60 * 1000);

    // Próxima falha volta ao primeiro degrau do backoff.
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("terceira"));
    await tick();
    expect(scheduler.delays.at(-1)).toBe(15 * 60e3);
  });

  it("respeita minAutomaticIntervalMs desde a última checagem", async () => {
    const { updater, scheduler, storageState, autoUpdater, clock, tick } =
      setup();

    storageState.lastCheckAt = clock.value - 5 * 60e3;

    updater.start();
    await tick();

    // O primeiro timer dispara, mas ainda faltam 24m50s do intervalo mínimo.
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(scheduler.delays.at(-1)).toBe(30 * 60e3 - 5 * 60e3 - 10_000);

    await tick();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(storageState.lastCheckAt).toBe(clock.value);
  });

  it("startup checa imediatamente quando permitido e preserva o agendamento no cooldown", async () => {
    const allowed = setup();
    allowed.updater.start();
    allowed.updater.checkOnStartup();
    expect(allowed.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    await flush();
    expect(allowed.scheduler.delays).toEqual([10_000, 4 * 60 * 60 * 1000]);

    const recent = setup();
    recent.storageState.lastCheckAt = recent.clock.value - 5 * 60e3;
    recent.updater.start();
    recent.updater.checkOnStartup();
    expect(recent.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(recent.scheduler.delays.at(-1)).toBe(25 * 60e3);
  });

  it("checagem manual não agenda o próximo ciclo", async () => {
    const { updater, scheduler } = setup();

    updater.start();
    await updater.check({ manual: true });

    expect(scheduler.delays).toEqual([10_000]);
  });

  it.each([
    [0, 900],
    [0.5, 1000],
    [1, 1100],
  ])("jitter determinístico com random=%s", (randomValue, expectedDelay) => {
    const { updater, scheduler } = setup({
      initialDelayMs: 1000,
      jitterRatio: 0.1,
      random: () => randomValue,
    });

    updater.start();

    expect(scheduler.delays).toEqual([expectedDelay]);
  });

  it("stop limpa timers e listeners de forma idempotente", async () => {
    const { updater, scheduler, autoUpdater } = setup();

    updater.start();
    expect(scheduler.pending()).toBe(1);

    updater.stop();

    expect(scheduler.pending()).toBe(0);
    expect(scheduler.delays).toEqual([10_000]);
    for (const event of UPDATER_EVENTS) {
      expect(autoUpdater.listenerCount(event)).toBe(0);
    }

    expect(() => updater.stop()).not.toThrow();
    expect(scheduler.pending()).toBe(0);
  });
});

describe("createUpdater: throttle e sanitização", () => {
  it("throttle de progresso por inteiro repetido e por 250 ms", async () => {
    const context = setup();
    const { updater, autoUpdater, broadcast, clock } = context;

    await reachDownloading(context);
    autoUpdater.emit("download-progress", { percent: 10 });
    expect(updater.getSnapshot().progress?.percent).toBe(10);
    const emitted = broadcast.mock.calls.length;
    const emittedAt = clock.value;

    // Mesmo inteiro após arredondar: não emite.
    autoUpdater.emit("download-progress", { percent: 10.4 });
    expect(broadcast.mock.calls.length).toBe(emitted);

    // Inteiro novo, mas antes de 250 ms: não emite.
    autoUpdater.emit("download-progress", { percent: 11 });
    expect(broadcast.mock.calls.length).toBe(emitted);

    clock.value = emittedAt + 249;
    autoUpdater.emit("download-progress", { percent: 12 });
    expect(broadcast.mock.calls.length).toBe(emitted);

    clock.value = emittedAt + 250;
    autoUpdater.emit("download-progress", { percent: 13 });
    expect(broadcast.mock.calls.length).toBe(emitted + 1);
    expect(updater.getSnapshot().progress?.percent).toBe(13);
  });

  it("limita o percentual entre 0 e 100 e ignora valor não numérico", async () => {
    const context = setup();
    const { updater, autoUpdater, clock } = context;

    await reachDownloading(context);

    autoUpdater.emit("download-progress", { percent: -5 });
    expect(updater.getSnapshot().progress?.percent).toBe(0);

    clock.value += 250;
    autoUpdater.emit("download-progress", { percent: 250 });
    expect(updater.getSnapshot().progress?.percent).toBe(100);

    clock.value += 250;
    autoUpdater.emit("download-progress", { percent: "invalido" });
    expect(updater.getSnapshot().progress?.percent).toBe(100);
  });

  it("snapshot não expõe URL, caminho nem token", async () => {
    const { updater, autoUpdater, broadcast } = setup();
    updater.start();
    await updater.check({ manual: true });

    autoUpdater.emit(
      "error",
      new Error(
        "Falha em https://github.com/CRMini/CRMini/releases/download/v0.3.0/CRMini.exe (C:\\Users\\Ana\\AppData\\Local\\Temp\\x.yml) token=segredo123",
      ),
    );

    const serialized = JSON.stringify(updater.getSnapshot());
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("segredo123");
    expect(serialized).not.toContain("AppData");
    expect(serialized).not.toContain("github.com");

    const published = JSON.stringify(broadcast.mock.calls);
    expect(published).not.toContain("https://");
    expect(published).not.toContain("segredo123");

    const message = updater.getSnapshot().error?.message ?? "";
    expect(message).toContain("[endereço omitido]");
    expect(message).toContain("[caminho omitido]");
    expect(message).toContain("token=[omitido]");
  });

  it("mensagem de erro é truncada em maxErrorMessageLength", async () => {
    const { updater, autoUpdater } = setup({ maxErrorMessageLength: 16 });
    updater.start();
    await updater.check({ manual: true });

    autoUpdater.emit("error", new Error("x".repeat(80)));

    expect(updater.getSnapshot().error?.message).toBe("x".repeat(16));
  });

  it("mensagem vazia usa texto de fallback", async () => {
    const { updater, autoUpdater } = setup();
    updater.start();
    await updater.check({ manual: true });

    autoUpdater.emit("error", new Error("   "));

    expect(updater.getSnapshot().error?.message).toBe(
      "Falha desconhecida ao atualizar.",
    );
  });
});

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

function createIpcMain() {
  const handlers = new Map<string, IpcHandler>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  };
}

function createStubUpdater() {
  const snapshot: UpdateSnapshot = {
    enabled: true,
    status: "idle",
    currentVersion: "0.2.0",
  };
  return {
    snapshot,
    getSnapshot: vi.fn(() => snapshot),
    check: vi.fn(async () => ({ ok: true, snapshot })),
    download: vi.fn(async () => ({ ok: true, snapshot })),
    install: vi.fn(async () => ({ ok: true, snapshot })),
  };
}

function setupIpc(trustedSender: (event: unknown) => boolean) {
  const ipcMain = createIpcMain();
  const updater = createStubUpdater();
  const dispose = registerUpdaterIpc({
    ipcMain,
    updater,
    trustedSender,
  });
  return { ipcMain, updater, dispose };
}

describe("registerUpdaterIpc", () => {
  it("registra os quatro canais zero-arg", () => {
    const { ipcMain } = setupIpc(() => true);

    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      "updates:check",
      "updates:download",
      "updates:get-state",
      "updates:install",
    ]);
  });

  it("recusa origem não confiável sem mudar o estado", async () => {
    const { ipcMain, updater } = setupIpc(() => false);
    const handler = ipcMain.handlers.get("updates:check")!;

    const result = await handler({ sender: "outra-janela" });

    expect(result).toEqual({
      ok: false,
      error: "Origem não autorizada.",
      snapshot: updater.snapshot,
    });
    expect(updater.check).not.toHaveBeenCalled();
  });

  it("trata erro do trustedSender como origem não confiável", async () => {
    const { ipcMain, updater } = setupIpc(() => {
      throw new Error("destruída");
    });
    const handler = ipcMain.handlers.get("updates:download")!;

    expect(await handler({})).toEqual({
      ok: false,
      error: "Origem não autorizada.",
      snapshot: updater.snapshot,
    });
    expect(updater.download).not.toHaveBeenCalled();
  });

  it.each(["updates:check", "updates:download", "updates:install"])(
    "rejeita argumento extra em %s sem chamar o updater",
    async (channel) => {
      const { ipcMain, updater } = setupIpc(() => true);
      const handler = ipcMain.handlers.get(channel)!;

      const result = await handler({}, "payload");

      expect(result).toEqual({
        ok: false,
        error: "Requisição inválida.",
        snapshot: updater.snapshot,
      });
      expect(updater.check).not.toHaveBeenCalled();
      expect(updater.download).not.toHaveBeenCalled();
      expect(updater.install).not.toHaveBeenCalled();
    },
  );

  it("updates:get-state devolve o snapshot atual", async () => {
    const { ipcMain, updater } = setupIpc(() => true);
    const handler = ipcMain.handlers.get("updates:get-state")!;

    expect(await handler({})).toBe(updater.snapshot);
    expect(updater.getSnapshot).toHaveBeenCalled();
  });

  it("check/download/install delegam e devolvem { ok, snapshot }", async () => {
    const { ipcMain, updater } = setupIpc(() => true);

    const checkResult = await ipcMain.handlers.get("updates:check")!({});
    expect(updater.check).toHaveBeenCalledWith({ manual: true });
    expect(checkResult).toEqual({ ok: true, snapshot: updater.snapshot });

    const downloadResult = await ipcMain.handlers.get("updates:download")!({});
    expect(updater.download).toHaveBeenCalledTimes(1);
    expect(downloadResult).toEqual({ ok: true, snapshot: updater.snapshot });

    const installResult = await ipcMain.handlers.get("updates:install")!({});
    expect(updater.install).toHaveBeenCalledTimes(1);
    expect(installResult).toEqual({ ok: true, snapshot: updater.snapshot });
  });

  it("dispose remove os quatro handlers e é idempotente", () => {
    const { ipcMain, dispose } = setupIpc(() => true);

    dispose();

    expect(ipcMain.handlers.size).toBe(0);
    expect(
      ipcMain.removeHandler.mock.calls.map(([channel]) => channel),
    ).toEqual([
      "updates:get-state",
      "updates:check",
      "updates:download",
      "updates:install",
    ]);

    dispose();

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(4);
  });
});
