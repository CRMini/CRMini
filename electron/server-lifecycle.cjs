const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

function createServerLifecycle({
  processSpawner = spawn,
  projectDir,
  isDevelopment,
  host = "127.0.0.1",
  env = process.env,
  resourcesDir = projectDir,
  dataDir,
  fileExists = fs.existsSync,
}) {
  let child;
  let url;
  let stopping;

  async function reservePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, resolve);
    });
    const port = server.address().port;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    return port;
  }

  function waitForExit(processRef) {
    return new Promise((resolve) => processRef.once("exit", resolve));
  }

  function clearChild(processRef) {
    if (child === processRef || processRef === undefined) {
      child = undefined;
      url = undefined;
    }
  }

  function killQuietly(processRef) {
    if (!processRef) return;
    if (processRef.exitCode !== null || processRef.signalCode !== null) return;
    processRef.kill("SIGTERM");
  }

  async function start(
    databasePath,
    {
      request = require("node:http").get,
      timeoutMs = 30000,
      assetsDir,
    } = {},
  ) {
    const port = await reservePort();
    url = `http://${host}:${port}`;

    const childEnv = {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: host,
      PORT: String(port),
      SQLITE_PATH: databasePath,
      // O aplicativo desktop sempre usa o banco local, mesmo que variáveis de
      // um ambiente web (CRM_DB_DRIVER/CRM_POSTGRES_URL) estejam herdadas.
      CRM_DB_DRIVER: "sqlite",
    };
    // Diretórios de recursos/dados para o servidor resolver init.sql, migrations
    // e logos sem depender de `process.cwd()` (que é somente leitura no pacote).
    if (resourcesDir !== undefined) childEnv.CRM_RESOURCES_DIR = resourcesDir;
    if (dataDir !== undefined) childEnv.CRM_DATA_DIR = dataDir;
    // Pasta de imagens derivada do banco: junto dele, os logos viajam na cópia.
    if (assetsDir !== undefined) childEnv.CRM_ASSETS_DIR = assetsDir;

    let args;
    let cwd;
    if (isDevelopment) {
      const nextBin = path.join(
        projectDir,
        "node_modules",
        "next",
        "dist",
        "bin",
        "next",
      );
      args = [nextBin, "dev", "--hostname", host, "--port", String(port)];
      cwd = projectDir;
    } else {
      const serverScript = path.join(resourcesDir, "server.js");
      if (!fileExists(serverScript)) {
        url = undefined;
        throw new Error(
          "Standalone ausente: rode `npm run build && npm run prepare:standalone` antes de iniciar.",
        );
      }
      args = [serverScript];
      cwd = resourcesDir;
    }

    let running;
    try {
      running = processSpawner(process.execPath, args, {
        cwd,
        stdio: "inherit",
        env: childEnv,
      });
    } catch (error) {
      clearChild();
      throw error;
    }
    child = running;
    let finished = false;
    let retryTimer;
    const ready = new Promise((resolve, reject) => {
      const onExit = (code) => {
        finished = true;
        clearChild(running);
        reject(
          new Error(`Next.js encerrou antes de ficar pronto (código ${code}).`),
        );
      };
      running.once("exit", onExit);
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        if (finished) return;
        if (Date.now() >= deadline) {
          finished = true;
          running.removeListener("exit", onExit);
          // Sem isso, um servidor que não fica pronto continua órfão segurando
          // a porta e o banco depois que a janela desiste.
          killQuietly(running);
          clearChild(running);
          return reject(new Error("Next.js não ficou pronto dentro do prazo."));
        }
        const req = request(`${url}/`, (response) => {
          if (finished) return;
          finished = true;
          clearTimeout(retryTimer);
          running.removeListener("exit", onExit);
          response.resume();
          resolve(url);
        });
        req.on("error", () => {
          if (!finished) retryTimer = setTimeout(check, 150);
        });
      };
      check();
    });
    return ready;
  }

  function stop() {
    if (stopping) return stopping;
    const running = child;
    if (!running || running.exitCode !== null || running.signalCode !== null) {
      child = undefined;
      url = undefined;
      return Promise.resolve();
    }
    stopping = (async () => {
      await new Promise((resolve) => {
        if (running.exitCode !== null || running.signalCode !== null)
          return resolve();
        const exited = waitForExit(running);
        running.kill("SIGTERM");
        exited.then(resolve);
      });
      child = undefined;
      url = undefined;
    })().finally(() => {
      stopping = undefined;
    });
    return stopping;
  }

  return {
    start,
    stop,
    get url() {
      return url;
    },
  };
}

module.exports = { createServerLifecycle };
