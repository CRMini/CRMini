# Desktop com Electron

Esta aplicação abre o CRM numa janela Electron. A interface e as APIs continuam sendo servidas pelo Next.js localmente; o Electron não transforma o Next em código nativo nem substitui o banco.

## Desenvolvimento

Execute o CRM em modo desktop com o servidor de desenvolvimento do Next.js:

```bash
npm run desktop:dev
```

O Electron inicia `next dev`; alterações no código são refletidas sem gerar um novo build. Encerre outras instâncias do CRM antes de iniciar.

## Executar a versão de produção

```bash
npm run desktop
```

`npm run desktop` executa `desktop:build` (`npm run build && npm run prepare:standalone`) e, em seguida, inicia o Electron servindo o build standalone de `.next/standalone/server.js`. O `desktop:build` sempre gera o build antes de abrir a janela.

O servidor standalone roda sob `ELECTRON_RUN_AS_NODE`. O `better-sqlite3` 13 usa prebuilds N-API (`prebuilds/<plataforma>-<arch>.node`), compatíveis com Node e Electron, então não é preciso reconstruir o módulo para cada runtime. O `npm run desktop` roda `npm run check:electron-abi` antes de abrir a janela e falha com uma mensagem explícita se o prebuild da plataforma não carregar.

Antes de iniciar o Next.js, o app aplica as migrations pendentes do banco escolhido em um processo Node separado (`electron/database-migrations.cjs` → `database/migrate.cjs`). Se a atualização falhar, a janela não abre: o app mostra o erro, informa o caminho do backup gerado e encerra sem alterar o restante do banco.

O servidor fica limitado a `127.0.0.1` em uma porta livre. Esta aplicação inicia e encerra o Next.js junto da janela. Na primeira inicialização, escolha o banco padrão (`app.getPath('userData')/crm.sqlite`), abrir banco existente ou criar/selecionar arquivo; a escolha é persistida em `userData/preferences.json`. A sidebar Configurações permite trocar o caminho e reinicia o app após confirmação do seletor nativo. O banco anterior nunca é movido ou apagado. Se o caminho persistido não estiver disponível ou for inválido, o app informa o problema e oferece seletor explícito de recuperação; cancelar encerra o app preservando a preferência e sem criar arquivo vazio. Para backup, encerre o app antes de copiar o arquivo, ou use a API SQLite de backup.

O layout da barra lateral (expandida ou recolhida) também fica em `userData/preferences.json`, no campo `sidebarCollapsed` (`true` = recolhida; ausente ou qualquer outro valor = expandida). A preferência é gravada pelo processo principal via IPC (`preferences:get-sidebar-collapsed`/`preferences:set-sidebar-collapsed`) porque o servidor usa uma porta aleatória: a origem `127.0.0.1:<porta>` muda a cada execução e o `localStorage` do renderer não seria reaproveitado. No navegador (sem Electron), o fallback é `localStorage` com a chave `crmini.sidebar.collapsed`.

## Caminhos de recursos e dados

O servidor Next resolve seus diretórios por variáveis de ambiente injetadas pelo Electron:

- `CRM_RESOURCES_DIR`: raiz dos recursos somente leitura. `src/lib/db.ts` lê `init.sql` e `migrations/` em `<CRM_RESOURCES_DIR>/database`. No pacote, aponta para `resources/app`; em produção local, para `.next/standalone`; em dev, cai em `process.cwd()`.
- `CRM_DATA_DIR`: raiz dos dados graváveis do usuário (`app.getPath('userData')`). Guarda `preferences.json`, `updater.json` e, como fallback de leitura, os logos legados em `<CRM_DATA_DIR>/tmp/assets`.
- `CRM_ASSETS_DIR`: pasta dos logos, derivada do banco em uso (`<diretório do banco>/assets`) por `electron/assets-paths.cjs`. Na primeira abertura após a atualização, os logos de `<CRM_DATA_DIR>/tmp/assets` são movidos para lá uma única vez (marca `legacyAssetsMigratedAt` em `preferences.json`); o diretório legado continua como fallback de leitura.

O `userData` vem de `app.getName()`. Com o `productName` na raiz do `package.json` e o `app.setName("CRMini")` no `main.cjs`, a pasta é `%APPDATA%\CRMini` (`~/.config/CRMini` no Linux) tanto no pacote quanto no modo dev. Não há migração de pastas antigas: nenhuma versão publicada usou outro nome.

Sem essas variáveis (ex.: `npm run dev`), o comportamento é o atual: `process.cwd()` como base e logos em `tmp/assets`.

## Layout do standalone

Após `npm run prepare:standalone`, `.next/standalone` contém:

- `server.js` — entrypoint do Next standalone.
- `.next/static/` e `public/` — copiados pelo script (o Next não os rastreia via `fs`).
- `database/` — `init.sql`, `migrations/` e os `.cjs` usados pelo processo de migrations.
- `node_modules/better-sqlite3` — copiado pelo script para garantir o prebuild N-API da plataforma (o tracing do Next pode omiti-lo).

## Empacotamento (Windows)

O empacotamento usa `electron-builder`, configurado no campo `build` do `package.json` (não há `electron-builder.yml`). Em uma máquina Windows:

```bash
npm run package:win
```

O comando executa `desktop:build` (build + standalone) e gera em `dist/` o instalador NSIS (`CRMini-<versão>-setup.exe`, per-user, sem admin) e o `CRMini-<versão>-portable.exe`. `npm run package:dir` gera apenas `dist/win-unpacked`, sem instaladores.

O pacote contém:

- `resources/app.asar` — `electron/**/*`, `database/sqlite-paths.cjs` e as dependências de produção (o `better-sqlite3` usado pelo processo principal fica fora do asar via `asarUnpack: **/*.node`).
- `resources/app/` — o standalone do Next (`extraResources` de `.next/standalone`), consumido por `standaloneDir()` como `process.resourcesPath/app`. O `node_modules` do standalone é copiado em uma entrada `extraResources` separada (`app/node_modules`), porque o electron-builder ignora `node_modules` ao levar um diretório inteiro para `resources`.
- `resources/icon.ico` — cópia de `public/brand/crmini-favicon.ico` (em desenvolvimento, o ícone opcional vem de `build/icon.ico`).

O build precisa rodar no Windows porque o `better-sqlite3` é carregado de um prebuild por plataforma/arquitetura; não há cross-build a partir de Linux. O `npmRebuild` fica desligado (`build.npmRebuild: false`) porque o `better-sqlite3` 13 traz prebuilds N-API compatíveis com Node e Electron (ver `scripts/check-electron-abi.cjs`), então `@electron/rebuild` não é necessário e só acrescentaria tempo e risco de compilar do fonte no runner.

A publicação é feita pelo workflow `.github/workflows/release.yml`, que ao enviar uma tag `v*` valida o conteúdo de `dist/win-unpacked` e anexa os `.exe` ao GitHub Releases. O mesmo workflow pode ser disparado manualmente (`workflow_dispatch`): ele executa build e empacotamento sem publicar release e deixa os `.exe` gerados no artefato `crmini-windows` da execução (retenção de 7 dias).

## Atualização automática

A partir da 0.2.0 o app instalado verifica novas versões no GitHub Releases. A dependência de produção é `electron-updater`. O feed vem do campo `build.publish` do `package.json` (`provider: github`, `owner: CRMini`, `repo: CRMini`, `releaseType: release`): o electron-builder gera `resources/app-update.yml` a partir dele e o código não chama `setFeedURL`. Por isso o repositório precisa ser **público** e cada release precisa publicar `latest.yml` e os `*.blockmap` — o workflow valida `latest.yml` (versão e hash), `app-update.yml` (`provider: github` com `owner` e `repo` iguais aos de `build.publish`) e os blockmaps antes de publicar.

Instalações anteriores à mudança de endereço do repositório leem o `app-update.yml` gravado no próprio pacote e continuam apontando para o endereço antigo; elas dependem do redirect do GitHub até serem atualizadas para uma versão gerada com o endereço novo.

A primeira checagem acontece cerca de 10 s após abrir o app e depois a cada 4 h (`electron/updater.cjs`). Checagens automáticas respeitam um intervalo mínimo de 30 min, persistido em `userData/updater.json`, e recebem jitter de ±10%; falhas entram em backoff de 15 min → 30 min → 1 h → 6 h. Como o intervalo mínimo de 30 min prevalece sobre o primeiro degrau do backoff, a primeira nova tentativa após uma falha ocorre em 30 min, e não em 15 min. Falha de checagem é silenciosa para o usuário (só log no processo principal); falha de download ou de instalação aparece no chip.

O chip fica fixo no canto superior direito (`src/components/update-chip.tsx`, renderizado no `RootLayout`) e é visível em todas as telas. Seus estados são “Atualizar para {versão}”, “Baixando atualização… {N}%” com barra de progresso (sem cancelar), “Reiniciar para atualizar”, “Reiniciando para atualizar…” e “Não foi possível atualizar.” com “Tentar novamente”. Sem `window.crmDesktop.updates` (navegador ou `npm run dev`), com `enabled: false`, nos estados `idle`/`checking` e no erro de checagem, o chip não renderiza nada.

O download só começa no clique e a instalação só ocorre em “Reiniciar para atualizar”: `autoDownload`, `autoInstallOnAppQuit`, `allowDowngrade` e `allowPrerelease` ficam desligados. Ao instalar, o servidor Next é encerrado antes de `quitAndInstall(true, true)`.

A atualização existe apenas no app instalado (`app.isPackaged`). O `portable.exe` nunca se atualiza (`PORTABLE_EXECUTABLE_DIR`/`PORTABLE_EXECUTABLE_FILE`), `CRM_DISABLE_UPDATES=1` (aceita `1`, `true` ou `yes`) desliga a checagem e `npm run dev` não tem feed.

Quem está na 0.1.0 não tem updater e precisa instalar a 0.2.0 manualmente uma única vez.

## Limitações / próximos passos

- O empacotamento Windows está configurado para NSIS + portable (x64). macOS e Linux empacotados continuam fora do escopo.
- Os binários não são assinados: o SmartScreen exibe aviso na primeira execução e também nas atualizações (ver [docs/empacotamento-windows.md](../docs/empacotamento-windows.md)).
- Não há canal de pré-release nem rollback automático: a atualização oferece apenas as versões estáveis publicadas no GitHub Releases.
