// Atualização automática no processo principal. Tudo (electron, electron-updater,
// timers, relógio e rede) é injetado para manter o módulo testável sem Electron e
// sem tocar em `resources/app-update.yml` — o feed vem do arquivo gerado no pacote.

const UPDATER_EVENTS = [
  "update-available",
  "update-not-available",
  "error",
  "download-progress",
  "update-downloaded",
];

const PORTABLE_ENV_KEYS = [
  "PORTABLE_EXECUTABLE_DIR",
  "PORTABLE_EXECUTABLE_FILE",
];

const OPT_OUT_VALUES = ["1", "true", "yes"];

// Mensagens do electron-updater carregam URL de asset (que pode ter token) e
// caminhos locais. Nada disso pode chegar ao renderer nem ao log.
const SENSITIVE_PATTERNS = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[endereço omitido]"],
  [/\b[a-z]:\\[^\s"'<>]+/gi, "[caminho omitido]"],
  [/(?<![\w.-])\/(?:[\w.-]+\/)+[\w.-]+/g, "[caminho omitido]"],
  [/\btoken=[^\s&]+/gi, "token=[omitido]"],
];

const REPOSITORY_HINT =
  "verifique se o repositório é público e se a release tem latest.yml";

function rawMessage(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.message === "string") return value.message;
  if (value === undefined || value === null) return "";
  try {
    return String(value);
  } catch {
    return "";
  }
}

// Texto de erro sempre passa por aqui: remove endereços/caminhos, normaliza
// espaços e limita o tamanho para o snapshot continuar enxuto.
function sanitizeMessage(value, maxLength = 300) {
  let text = rawMessage(value).replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  if (!text) text = "Falha desconhecida ao atualizar.";
  const limit =
    Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 300;
  return text.length > limit ? text.slice(0, limit) : text;
}

// Repositório privado e release sem artefato costumam aparecer como 404/"not
// found" no electron-updater; nesse caso a dica economiza uma investigação.
function looksLikeRepositoryProblem(value) {
  const text = rawMessage(value);
  return (
    /\b404\b/.test(text) ||
    /not found/i.test(text) ||
    /cannot find/i.test(text) ||
    /private repo/i.test(text)
  );
}

function percentValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function resolveDisabledReason(appInfo, env) {
  const flag =
    typeof env?.CRM_DISABLE_UPDATES === "string"
      ? env.CRM_DISABLE_UPDATES.trim().toLowerCase()
      : "";
  if (OPT_OUT_VALUES.includes(flag)) return "opt-out";
  if (!appInfo.isPackaged) return "development";
  if (PORTABLE_ENV_KEYS.some((key) => hasText(env?.[key]))) return "portable";
  return undefined;
}

/**
 * Cria o controlador de atualização automática.
 *
 * @param {object} options
 * @param {{ isPackaged: boolean, version: string }} options.appInfo
 * @param {object|null} options.autoUpdater instância do electron-updater ou null
 * @param {(snapshot: object) => Promise<void>} [options.onInstallError] chamada
 *   quando a instalação falha, para o processo principal restaurar o app
 * @returns {{ start: Function, stop: Function, getSnapshot: Function,
 *   check: Function, download: Function, install: Function,
 *   handleAutoUpdaterEvent: Function, isEnabled: Function }}
 */
function createUpdater({
  appInfo,
  autoUpdater,
  env = process.env,
  logger = console,
  broadcast = () => {},
  scheduler = { setTimeout, clearTimeout },
  now = Date.now,
  random = Math.random,
  storage = { getLastCheckAt: () => null, setLastCheckAt: () => {} },
  beforeInstall = async () => {},
  quitAndInstall = (silent, force) => autoUpdater.quitAndInstall(silent, force),
  onInstallError = async () => {},
  initialDelayMs = 10_000,
  intervalMs = 4 * 60 * 60 * 1000,
  minAutomaticIntervalMs = 30 * 60 * 1000,
  errorBackoffMs = [15 * 60e3, 30 * 60e3, 60 * 60e3, 6 * 60 * 60e3],
  jitterRatio = 0.1,
  progressThrottleMs = 250,
  maxErrorMessageLength = 300,
} = {}) {
  if (!appInfo || typeof appInfo !== "object") {
    throw new TypeError(
      "createUpdater exige appInfo com isPackaged e version.",
    );
  }

  const currentVersion =
    typeof appInfo.version === "string"
      ? appInfo.version
      : String(appInfo.version ?? "");
  const disabledReason = resolveDisabledReason(appInfo, env);
  // Sem instância do electron-updater não há como checar nada; o app continua
  // funcionando e o chip de atualização simplesmente não aparece.
  const enabled = disabledReason === undefined && Boolean(autoUpdater);

  const state = {
    status: "idle",
    targetVersion: undefined,
    progress: undefined,
    error: undefined,
    checkedAt: undefined,
  };

  let started = false;
  let timer;
  let listeners = [];
  let checkPromise;
  let downloadPromise;
  let errorAttempt = 0;
  let lastProgressPercent;
  let lastProgressAt = -Infinity;
  let lastSnapshotJson;
  let lastCheckAutomatic = false;
  // Estado da tentativa de instalação em curso: o electron-updater reporta falha
  // por evento `error` (e devolvendo `false`), então a mesma tentativa pode ser
  // sinalizada mais de uma vez e a restauração do app deve ocorrer uma só vez.
  let installFailureHandled = false;
  let installErrorNotification;

  function getSnapshot() {
    const snapshot = {
      enabled,
      status: state.status,
      currentVersion,
    };
    if (disabledReason !== undefined) snapshot.reason = disabledReason;
    if (state.targetVersion) snapshot.targetVersion = state.targetVersion;
    if (state.progress) snapshot.progress = { ...state.progress };
    if (state.error) snapshot.error = { ...state.error };
    if (state.checkedAt) snapshot.checkedAt = state.checkedAt;
    return snapshot;
  }

  // Só avisa o renderer quando o snapshot muda: progresso repetido e transições
  // redundantes ficariam re-renderizando o chip sem necessidade.
  function emit() {
    const snapshot = getSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSnapshotJson) return snapshot;
    lastSnapshotJson = serialized;
    try {
      const result = broadcast(snapshot);
      if (result && typeof result.catch === "function") {
        result.catch((error) =>
          logger.warn(
            `Falha ao publicar estado do atualizador: ${rawMessage(error)}`,
          ),
        );
      }
    } catch (error) {
      // Janela fechada/destruída não pode derrubar o processo principal.
      logger.warn(
        `Falha ao publicar estado do atualizador: ${rawMessage(error)}`,
      );
    }
    return snapshot;
  }

  // Campos presentes no patch com valor null são removidos do snapshot;
  // campos ausentes permanecem como estão.
  function transition(status, patch = {}) {
    state.status = status;
    for (const key of ["targetVersion", "progress", "error"]) {
      if (Object.hasOwn(patch, key)) state[key] = patch[key] ?? undefined;
    }
    if (Object.hasOwn(patch, "checkedAt")) {
      state.checkedAt = patch.checkedAt ?? undefined;
    }
    return emit();
  }

  function unavailable() {
    return {
      ok: false,
      error: "Atualizações indisponíveis.",
      snapshot: getSnapshot(),
    };
  }

  function failure(message) {
    return { ok: false, error: message, snapshot: getSnapshot() };
  }

  function jitter(delayMs) {
    const base = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
    const ratio = Math.abs(finiteNumber(jitterRatio, 0));
    const offset = (random() * 2 - 1) * base * ratio;
    return Math.max(0, Math.round(base + offset));
  }

  function backoffDelay(attempt = errorAttempt) {
    const values =
      Array.isArray(errorBackoffMs) && errorBackoffMs.length > 0
        ? errorBackoffMs
        : [intervalMs];
    const index = Math.min(Math.max(attempt, 1) - 1, values.length - 1);
    const value = values[index];
    return Number.isFinite(value) && value >= 0 ? value : intervalMs;
  }

  function isoTimestamp(timestamp) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  function isBusy() {
    return (
      state.status === "downloading" ||
      state.status === "downloaded" ||
      state.status === "installing"
    );
  }

  function lastCheckAt() {
    try {
      const value = Number(storage.getLastCheckAt());
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function recordCheckTime(timestamp) {
    try {
      storage.setLastCheckAt(timestamp);
    } catch (error) {
      logger.warn(
        `Falha ao registrar a checagem de atualização: ${rawMessage(error)}`,
      );
    }
  }

  function msUntilAutomaticCheckAllowed() {
    const last = lastCheckAt();
    if (last === null) return 0;
    const elapsed = now() - last;
    if (!Number.isFinite(elapsed)) return 0;
    if (elapsed >= minAutomaticIntervalMs) return 0;
    return Math.max(0, minAutomaticIntervalMs - elapsed);
  }

  function clearTimer() {
    if (timer === undefined) return;
    try {
      scheduler.clearTimeout(timer);
    } catch {
      // Timer já disparou ou foi descartado.
    }
    timer = undefined;
  }

  function scheduleNext(delayMs) {
    if (!started || !enabled) return;
    clearTimer();
    timer = scheduler.setTimeout(() => {
      timer = undefined;
      runAutomaticCheck();
    }, jitter(delayMs));
  }

  // A checagem automática respeita o intervalo mínimo desde a última checagem
  // (inclusive manual) para dois processos/reaberturas não consultarem o feed
  // repetidamente, e nunca interrompe um download/instalação em curso.
  function runAutomaticCheck() {
    if (!started || !enabled) return;
    if (checkPromise || isBusy()) {
      scheduleNext(intervalMs);
      return;
    }
    const remaining = msUntilAutomaticCheckAllowed();
    if (remaining > 0) {
      scheduleNext(remaining);
      return;
    }
    clearTimer();
    check().catch((error) => {
      logger.error(
        `Falha inesperada ao verificar atualizações: ${rawMessage(error)}`,
      );
    });
  }

  function logCheckFailure(error, message) {
    const hint = looksLikeRepositoryProblem(error)
      ? ` ${REPOSITORY_HINT}.`
      : "";
    logger.warn(`Falha ao verificar atualizações: ${message}.${hint}`);
  }

  function handleCheckError(error) {
    // Evento e rejeição da promessa podem chegar para a mesma falha.
    if (state.status !== "checking") return getSnapshot();
    errorAttempt += 1;
    const message = sanitizeMessage(error, maxErrorMessageLength);
    const snapshot = transition("error", {
      error: { phase: "check", message, visible: false },
      progress: null,
    });
    if (lastCheckAutomatic) {
      logCheckFailure(error, message);
      scheduleNext(backoffDelay());
    } else {
      logger.warn(`Falha ao verificar atualizações: ${message}`);
    }
    return snapshot;
  }

  function handleDownloadError(error) {
    if (state.status !== "downloading") return getSnapshot();
    const message = sanitizeMessage(error, maxErrorMessageLength);
    const snapshot = transition("error", {
      error: { phase: "download", message, visible: true },
      progress: null,
    });
    logger.error(`Falha ao baixar a atualização: ${message}`);
    return snapshot;
  }

  function targetVersionFrom(payload, fallback) {
    return hasText(payload?.version) ? payload.version : fallback;
  }

  function handleUpdateAvailable(payload) {
    // Evento de uma checagem antiga não pode mexer no estado atual.
    if (state.status !== "checking") return getSnapshot();
    errorAttempt = 0;
    return transition("available", {
      targetVersion: targetVersionFrom(payload, undefined),
      progress: null,
      error: null,
    });
  }

  function handleUpdateNotAvailable() {
    if (state.status !== "checking") return getSnapshot();
    errorAttempt = 0;
    return transition("idle", {
      targetVersion: null,
      progress: null,
      error: null,
    });
  }

  function handleDownloadProgress(payload) {
    if (state.status !== "downloading") return getSnapshot();
    const percent = percentValue(payload?.percent);
    if (percent === null) return getSnapshot();
    const timestamp = now();
    // Progresso é ruidoso: só vale emitir quando o inteiro muda e passou o
    // intervalo mínimo desde a última emissão.
    if (percent === lastProgressPercent) return getSnapshot();
    if (timestamp - lastProgressAt < progressThrottleMs) return getSnapshot();
    lastProgressPercent = percent;
    lastProgressAt = timestamp;
    return transition("downloading", {
      progress: {
        percent,
        transferred: finiteNumber(payload?.transferred),
        total: finiteNumber(payload?.total),
        bytesPerSecond: finiteNumber(payload?.bytesPerSecond),
      },
    });
  }

  function handleUpdateDownloaded(payload) {
    if (state.status !== "downloading") return getSnapshot();
    return transition("downloaded", {
      targetVersion: targetVersionFrom(payload, state.targetVersion),
      progress: null,
      error: null,
    });
  }

  function handleUpdaterError(error) {
    if (state.status === "checking") return handleCheckError(error);
    if (state.status === "downloading") return handleDownloadError(error);
    if (state.status === "installing") return handleInstallError(error);
    // Falhas fora de uma fase ativa (ex.: depois de baixar) não mudam o fluxo,
    // mas continuam registradas para diagnóstico.
    logger.warn(
      `Evento de erro ignorado do atualizador: ${sanitizeMessage(
        error,
        maxErrorMessageLength,
      )}`,
    );
    return getSnapshot();
  }

  // Instalação falhou: guarda `targetVersion` e deixa o estado em `error` para o
  // chip mostrar o problema e `download()`/`install()` aceitarem nova tentativa.
  // A restauração do app (servidor, janela) é do processo principal e nunca pode
  // fazer esta transição falhar.
  function failInstall(error) {
    if (installFailureHandled) return getSnapshot();
    installFailureHandled = true;
    const message = sanitizeMessage(error, maxErrorMessageLength);
    const snapshot = transition("error", {
      error: { phase: "install", message, visible: true },
      progress: null,
    });
    logger.error(`Falha ao instalar a atualização: ${message}`);
    installErrorNotification = Promise.resolve()
      .then(() => onInstallError(snapshot))
      .catch((restoreError) => {
        logger.error(
          `Falha ao restaurar o aplicativo após erro de instalação: ${rawMessage(
            restoreError,
          )}`,
        );
      });
    return snapshot;
  }

  function handleInstallError(error) {
    if (state.status !== "installing") return getSnapshot();
    return failInstall(error);
  }

  function handleAutoUpdaterEvent(name, payload) {
    if (!enabled) return getSnapshot();
    // Durante a instalação o processo está encerrando: só `error` ainda importa,
    // porque é assim que o electron-updater sinaliza que o reinício não ocorreu.
    if (state.status === "installing" && name !== "error") return getSnapshot();
    switch (name) {
      case "update-available":
        return handleUpdateAvailable(payload);
      case "update-not-available":
        return handleUpdateNotAvailable();
      case "download-progress":
        return handleDownloadProgress(payload);
      case "update-downloaded":
        return handleUpdateDownloaded(payload);
      case "error":
        return handleUpdaterError(payload);
      default:
        return getSnapshot();
    }
  }

  function check({ manual = false } = {}) {
    if (!enabled) return Promise.resolve(unavailable());
    // Single-flight: chamadas concorrentes reaproveitam a mesma requisição, e o
    // agendamento não dispara uma segunda checagem em paralelo.
    if (checkPromise) return checkPromise;
    if (isBusy()) return Promise.resolve(failure("Atualização em andamento."));

    const startedAt = now();
    recordCheckTime(startedAt);
    lastCheckAutomatic = !manual;
    transition("checking", {
      checkedAt: isoTimestamp(startedAt),
      targetVersion: null,
      progress: null,
      error: null,
    });

    checkPromise = (async () => {
      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        handleCheckError(error);
      }
      if (state.status === "error") {
        return failure(
          state.error?.message ?? "Falha ao verificar atualizações.",
        );
      }
      return { ok: true, snapshot: getSnapshot() };
    })()
      .finally(() => {
        checkPromise = undefined;
        if (!started || !enabled || !lastCheckAutomatic) return;
        // Backoff em erro; intervalo normal em sucesso (ou quando nenhum evento
        // chegou e o estado continua em "checking").
        scheduleNext(state.status === "error" ? backoffDelay() : intervalMs);
      })
      .catch((error) => {
        logger.error(
          `Falha inesperada ao verificar atualizações: ${rawMessage(error)}`,
        );
        return failure("Falha ao verificar atualizações.");
      });

    return checkPromise;
  }

  function download() {
    if (!enabled) return Promise.resolve(unavailable());
    // Single-flight do download: repetir o clique não reinicia o arquivo.
    if (downloadPromise) return downloadPromise;
    if (state.status === "downloaded") {
      return Promise.resolve({ ok: true, snapshot: getSnapshot() });
    }
    if (state.status === "installing") {
      return Promise.resolve(failure("Atualização em andamento."));
    }
    const canDownload =
      state.status === "available" ||
      (state.status === "error" && Boolean(state.targetVersion));
    if (!canDownload) {
      return Promise.resolve(failure("Atualização não disponível."));
    }

    lastProgressPercent = undefined;
    lastProgressAt = -Infinity;
    transition("downloading", { progress: null, error: null });

    downloadPromise = (async () => {
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        handleDownloadError(error);
      }
      if (state.status === "error") {
        return failure(
          state.error?.message ?? "Falha ao baixar a atualização.",
        );
      }
      return { ok: true, snapshot: getSnapshot() };
    })().finally(() => {
      downloadPromise = undefined;
    });

    return downloadPromise;
  }

  async function install() {
    if (!enabled) return unavailable();
    // Nova tentativa depois de uma falha de instalação: o arquivo já foi baixado,
    // então `error` com `phase: "install"` também pode reinstalar.
    const canRetryInstall =
      state.status === "error" &&
      state.error?.phase === "install" &&
      Boolean(state.targetVersion);
    if (state.status !== "downloaded" && !canRetryInstall) {
      return failure("Atualização não baixada.");
    }

    installFailureHandled = false;
    installErrorNotification = undefined;
    transition("installing", { progress: null, error: null });
    try {
      // Última chance de persistir dados/fechar recursos antes de reiniciar.
      await beforeInstall();
      // Um `error` durante o beforeInstall já encerrou esta tentativa: reiniciar
      // agora seria instalar sem o processo pronto.
      if (state.status === "installing") {
        if (quitAndInstall(true, true) === false) {
          throw new Error(
            "O electron-updater não aceitou reiniciar para instalar.",
          );
        }
        // `quitAndInstall` sinaliza falha emitindo `error` (e devolvendo
        // `false`), não lançando. Por isso esperamos um tick real — o `scheduler`
        // injetado é manual nos testes e um setTimeout pendente travaria o
        // `await` — antes de qualquer `ok: true`, para o evento da mesma volta do
        // event loop chegar.
        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (error) {
      failInstall(error);
    }
    if (state.status === "installing") {
      return { ok: true, snapshot: getSnapshot() };
    }
    // Falha por exceção, retorno `false` ou evento: só responde depois de
    // aguardar a restauração pedida ao processo principal.
    await installErrorNotification;
    return failure(state.error?.message ?? "Falha ao instalar a atualização.");
  }

  function configureAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = logger;
  }

  function subscribe() {
    listeners = UPDATER_EVENTS.map((name) => {
      const listener = (payload) => handleAutoUpdaterEvent(name, payload);
      autoUpdater.on(name, listener);
      return { name, listener };
    });
  }

  function unsubscribe() {
    for (const { name, listener } of listeners) {
      try {
        autoUpdater.removeListener(name, listener);
      } catch {
        // Instância já descartada: não há o que remover.
      }
    }
    listeners = [];
  }

  function start() {
    if (started) return;
    if (!enabled) {
      started = true;
      logger.info(
        `Atualizações automáticas desabilitadas (${disabledReason ?? "electron-updater ausente"}).`,
      );
      return;
    }
    configureAutoUpdater();
    subscribe();
    started = true;
    // A primeira checagem é adiada para não competir com a abertura da janela.
    scheduleNext(initialDelayMs);
  }

  function stop() {
    started = false;
    clearTimer();
    unsubscribe();
  }

  return {
    start,
    stop,
    getSnapshot,
    check,
    checkOnStartup: runAutomaticCheck,
    download,
    install,
    handleAutoUpdaterEvent,
    isEnabled: () => enabled,
  };
}

/**
 * Registra os canais IPC do atualizador e devolve a função de descarte.
 *
 * @param {object} options
 * @param {{ handle: Function, removeHandler: Function }} options.ipcMain
 * @param {ReturnType<typeof createUpdater>} options.updater
 * @param {(event: object) => boolean} [options.trustedSender]
 * @returns {() => void}
 */
function registerUpdaterIpc({ ipcMain, updater, trustedSender = () => false }) {
  const handlers = {
    "updates:get-state": () => updater.getSnapshot(),
    "updates:check": () => updater.check({ manual: true }),
    "updates:download": () => updater.download(),
    "updates:install": () => updater.install(),
  };

  function isTrusted(event) {
    try {
      return Boolean(trustedSender(event));
    } catch {
      return false;
    }
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      const snapshot = updater.getSnapshot();
      if (!isTrusted(event)) {
        return { ok: false, error: "Origem não autorizada.", snapshot };
      }
      // Os canais são zero-arg de propósito: nada do renderer entra no updater.
      if (args.length > 0) {
        return { ok: false, error: "Requisição inválida.", snapshot };
      }
      return handler();
    });
  }

  let disposed = false;
  return function dispose() {
    if (disposed) return;
    disposed = true;
    for (const channel of Object.keys(handlers)) {
      ipcMain.removeHandler(channel);
    }
  };
}

module.exports = { createUpdater, registerUpdaterIpc };
