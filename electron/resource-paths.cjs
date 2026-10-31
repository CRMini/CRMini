const path = require("node:path");

// Centraliza a distinção entre os modos de execução do Electron:
// - empacotado: recursos sob `process.resourcesPath/app` (extraResources).
// - desenvolvimento: raiz do repositório (servidor `next dev`).
// - produção local: standalone gerado por `next build` (`.next/standalone`).
function standaloneDir({ app, isDevelopment = false, dirname = __dirname }) {
  if (app && app.isPackaged) return path.join(process.resourcesPath, "app");
  if (isDevelopment) return path.resolve(dirname, "..");
  return path.resolve(dirname, "../.next/standalone");
}

// Diretório de dados graváveis do usuário (banco, preferências, logos).
function dataDir(app) {
  return app.getPath("userData");
}

function databaseDir(resourcesDir) {
  return path.join(resourcesDir, "database");
}

function brandAssetPath(resourcesDir, filename) {
  return path.join(resourcesDir, "public", "brand", filename);
}

module.exports = { standaloneDir, dataDir, databaseDir, brandAssetPath };
