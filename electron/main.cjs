const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { applyMigrations } = require("./database-migrations.cjs");
const { createDatabaseManager } = require("./database-manager.cjs");
const { createServerLifecycle } = require("./server-lifecycle.cjs");
const { createServerShutdown } = require("./server-shutdown.cjs");
const { standaloneDir, brandAssetPath } = require("./resource-paths.cjs");
const {
  assetsDirFor,
  legacyAssetsDir,
  moveLegacyAssets,
} = require("./assets-paths.cjs");
const { createUpdater, registerUpdaterIpc } = require("./updater.cjs");

// O nome do app define `userData` (`app.getName()`). Sem isto, o pacote usa o
// `name` do package.json ("crmini") e cai em `%APPDATA%\crmini` em vez de
// `%APPDATA%\CRMini`; chamar `setName` aqui iguala desenvolvimento e pacote.
app.setName("CRMini");

const host = "127.0.0.1";
const isDevelopment = process.argv.includes("--dev");
const resourcesDir = standaloneDir({ app, isDevelopment, dirname: __dirname });
const dataDir = app.getPath("userData");
let mainWindow;
// Uma falha ao parar o servidor não pode prender o app no `before-quit`; ela
// libera a saída sem marcar o servidor como parado (contrato usado ao instalar).
let quitAfterServerStopFailure = false;
// Encerramento em curso: `onInstallError` não pode subir o servidor de novo e
// deixá-lo órfão enquanto a saída já foi liberada.
let quitting = false;
// Caminho do banco em uso, para o servidor subir de novo se a instalação falhar.
let activeDatabasePath;
// Pasta de logos correspondente ao banco em uso; o reinício do servidor após
// falha de atualização precisa repassá-la, senão os logos deixam de aparecer.
let activeAssetsDir;

// `lastCheckAt` fica em userData no mesmo estilo tolerante de `preferences.json`:
// arquivo ausente ou corrompido vale `null` e a falha de escrita nunca chega ao
// app — perder o horário da última checagem só adia/antecipa a próxima.
const updaterFile = path.join(dataDir, "updater.json");

function readLastCheckAt() {
  try {
    const parsed = JSON.parse(fs.readFileSync(updaterFile, "utf8"));
    const value = Number(parsed?.lastCheckAt);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveLastCheckAt(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return;
  const destination = updaterFile;
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(
      temporary,
      JSON.stringify({ lastCheckAt: value }, null, 2),
    );
    fs.renameSync(temporary, destination);
  } catch (error) {
    console.warn(
      `Falha ao registrar a checagem de atualização: ${error.message}`,
    );
  }
}

// O feed vem de `resources/app-update.yml`; o electron-updater só é carregado
// quando existe instalação real para atualizar. Qualquer falha aqui desabilita o
// recurso em vez de impedir a abertura do CRM.
function loadAutoUpdater() {
  if (!app.isPackaged) return null;
  const optOut = process.env.CRM_DISABLE_UPDATES;
  if (
    typeof optOut === "string" &&
    ["1", "true", "yes"].includes(optOut.trim().toLowerCase())
  ) {
    return null;
  }
  const isPortable = [
    "PORTABLE_EXECUTABLE_DIR",
    "PORTABLE_EXECUTABLE_FILE",
  ].some(
    (key) =>
      typeof process.env[key] === "string" && process.env[key].trim() !== "",
  );
  if (isPortable) return null;
  try {
    return require("electron-updater").autoUpdater ?? null;
  } catch (error) {
    console.warn(`electron-updater indisponível: ${error.message}`);
    return null;
  }
}

function broadcastUpdateState(snapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send("updates:state", snapshot);
  }
}

app.setAppUserModelId("br.com.crmini.app");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const server = createServerLifecycle({
    projectDir: path.resolve(__dirname, ".."),
    resourcesDir,
    dataDir,
    isDevelopment,
    host,
  });

  // Parada única, compartilhada por `before-quit` e `beforeInstall`: quem chega
  // depois reaproveita a mesma promessa em vez de iniciar outra parada. Em caso
  // de falha a promessa é descartada, permitindo uma nova tentativa.
  const shutdown = createServerShutdown({ stop: () => server.stop() });

  const databaseManager = createDatabaseManager({
    app,
    dialog,
    getMainWindow: () => mainWindow,
    beforeRestart: () => shutdown.stopOnce(),
    getServerUrl: () => server.url,
  });

  ipcMain.handle("database:get-path", (event) =>
    databaseManager.handleGetPath(event),
  );
  ipcMain.handle("database:choose", (event) =>
    databaseManager.handleChoose(event),
  );
  ipcMain.handle("assets:get-path", (event) =>
    databaseManager.handleGetAssetsPath(event),
  );
  ipcMain.handle("preferences:get-sidebar-collapsed", (event) =>
    databaseManager.handleGetSidebarCollapsed(event),
  );
  ipcMain.handle("preferences:set-sidebar-collapsed", (event, collapsed) =>
    databaseManager.handleSetSidebarCollapsed(event, collapsed),
  );

  // Antes da janela: o preload já pode chamar `updates:*` no primeiro render e o
  // estado inicial precisa estar disponível. O updater não segura a inicialização:
  // `start()` só é chamado depois do `loadURL`.
  const updater = createUpdater({
    appInfo: { isPackaged: app.isPackaged, version: app.getVersion() },
    autoUpdater: loadAutoUpdater(),
    storage: {
      getLastCheckAt: readLastCheckAt,
      setLastCheckAt: saveLastCheckAt,
    },
    broadcast: broadcastUpdateState,
    // Para o Next pela mesma promessa do `before-quit` e só libera a saída depois
    // que o filho realmente encerrou; uma falha aborta a instalação (o chip
    // mostra erro e o app continua aberto).
    beforeInstall: async () => {
      try {
        await shutdown.stopOnce();
      } catch (error) {
        console.warn(
          `Falha ao parar o servidor antes de atualizar: ${error.message}`,
        );
        throw error;
      }
    },
    // A instalação falhou (o electron-updater avisa por evento): sobe o Next de
    // novo, com o mesmo banco, para a janela não ficar com conteúdo morto.
    onInstallError: async () => {
      // O app já está saindo: reiniciar o Next aqui o deixaria órfão.
      if (quitting) return;
      if (!activeDatabasePath) return;
      // Servidor ainda de pé (falha antes da parada): nada a restaurar.
      if (!shutdown.stopped) return;
      let serverUrl;
      try {
        serverUrl = await server.start(activeDatabasePath, {
          assetsDir: activeAssetsDir,
        });
      } catch (error) {
        // Restaurar é melhor esforço: a falha aqui não pode derrubar o app.
        console.warn(
          `Falha ao reiniciar o servidor após erro de atualização: ${error.message}`,
        );
        return;
      }
      // Servidor de volta: a próxima saída precisa pará-lo de novo.
      shutdown.reset();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        await mainWindow.loadURL(serverUrl);
      } catch (error) {
        console.warn(
          `Falha ao recarregar a janela após reiniciar o servidor: ${error.message}`,
        );
      }
    },
  });

  registerUpdaterIpc({
    ipcMain,
    updater,
    trustedSender: databaseManager.trustedSender,
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function isServerUrl(url) {
    try {
      const target = new URL(url);
      return target.origin === new URL(server.url).origin;
    } catch {
      return false;
    }
  }

  function openExternal(url) {
    // Só http(s): evita abrir `file:`, `javascript:` ou outros esquemas vindos de
    // um link renderizado na página.
    try {
      const { protocol } = new URL(url);
      if (protocol !== "http:" && protocol !== "https:") return;
    } catch {
      return;
    }
    shell.openExternal(url).catch(() => {});
  }

  function windowIcon() {
    // No dev o ícone ainda não foi gerado: só usa se o arquivo existir.
    const candidate = app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "..", "build", "icon.ico");
    return fs.existsSync(candidate) ? candidate : undefined;
  }

  async function createWindow() {
    // Inicializa listeners e dispara uma única checagem durante o boot. A
    // promessa não é aguardada, portanto feed/download nunca bloqueia o app.
    try {
      updater.start();
      if (updater.isEnabled()) {
        updater.checkOnStartup();
      }
    } catch (error) {
      console.warn(`Falha ao iniciar o atualizador: ${error.message}`);
    }
    // Janela isolada, sem preload/IPC: dá feedback imediato enquanto a escolha
    // do banco, migrations e boot do Next acontecem no processo principal.
    const splashWindow = new BrowserWindow({
      width: 420,
      height: 260,
      resizable: false,
      frame: false,
      show: true,
      center: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    splashWindow.loadFile(path.join(__dirname, "splash.html"), {
      query: {
        logo: pathToFileURL(
          brandAssetPath(resourcesDir, "crmini-horizontal-light.svg"),
        ).href,
      },
    });
    const databasePath = await databaseManager.chooseDatabase();
    if (!databasePath) {
      if (!splashWindow.isDestroyed()) splashWindow.close();
      app.quit();
      return;
    }
    try {
      await applyMigrations({ databasePath, resourcesDir });
    } catch (error) {
      console.error(error);
      // A preferência só é salva depois da migração: se o banco falhar, a próxima
      // abertura volta a oferecer a escolha em vez de repetir o mesmo erro.
      dialog.showErrorBox("Não foi possível atualizar o banco", error.message);
      if (!splashWindow.isDestroyed()) splashWindow.close();
      app.quit();
      return;
    }
    databaseManager.saveDatabasePath(databasePath);
    // Pasta de imagens junto ao banco; na primeira abertura após a atualização,
    // move os logos legados (`userData/tmp/assets`) uma única vez. Falha na
    // migração só registra aviso e não impede a janela de abrir.
    const assetsDir = assetsDirFor({ databasePath, dataDir });
    if (databaseManager.readPreferences().legacyAssetsMigratedAt === undefined) {
      try {
        const result = moveLegacyAssets({
          legacyDir: legacyAssetsDir(dataDir),
          destination: assetsDir,
        });
        if (result.failed > 0)
          console.warn(
            `Logos legados: ${result.moved} movidos, ${result.failed} com falha (permanecem em ${legacyAssetsDir(dataDir)}).`,
          );
      } catch (error) {
        console.warn(`Falha ao mover logos legados: ${error.message}`);
      }
      databaseManager.markLegacyAssetsMigrated();
    }
    try {
      const serverUrl = await server.start(databasePath, { assetsDir });
      activeDatabasePath = databasePath;
      activeAssetsDir = assetsDir;
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        icon: windowIcon(),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      // Navegação restrita ao servidor local: links internos seguem na mesma
      // janela; qualquer outra origem vai para o navegador externo. Nunca abre
      // janela filha, que escaparia destes handlers.
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isServerUrl(url)) mainWindow.loadURL(url).catch(() => {});
        else openExternal(url);
        return { action: "deny" };
      });
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (isServerUrl(url)) return;
        event.preventDefault();
        openExternal(url);
      });
      await mainWindow.loadURL(serverUrl);
      if (!splashWindow.isDestroyed()) splashWindow.close();
      // start/check são idempotentes/single-flight; recriar a janela não duplica.
    } catch (error) {
      console.error(error);
      if (!splashWindow.isDestroyed()) splashWindow.close();
      app.quit();
    }
  }

  app
    .whenReady()
    .then(createWindow)
    .catch((error) => {
      dialog.showErrorBox("Erro no banco", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    // Também no caminho que já libera a saída: o servidor parado não pode voltar.
    quitting = true;
    if (shutdown.stopped || quitAfterServerStopFailure) return;
    event.preventDefault();
    shutdown.stopOnce().then(
      () => {
        // Só depois da parada concluída o before-quit seguinte pode passar.
        app.quit();
      },
      (error) => {
        // A falha não marca o servidor como parado, mas também não pode prender o
        // app: libera esta saída e mantém o erro registrado.
        console.warn(
          `Falha ao parar o servidor antes de encerrar: ${error.message}`,
        );
        quitAfterServerStopFailure = true;
        app.quit();
      },
    );
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
