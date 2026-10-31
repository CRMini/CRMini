# CRMini

Aplicação web de CRM para organizar empresas clientes, contatos, oportunidades e tarefas. Os dados são persistidos em um arquivo SQLite local; a interface permite acompanhar informações e atividades comerciais em um só lugar.

## Tecnologias

- Next.js 15 e React 19
- TypeScript 5
- SQLite 3, acessado pela biblioteca `better-sqlite3` (arquivo local, sem servidor)
- ESLint 9 para análise estática
- Vitest + React Testing Library para testes automatizados de lógica e componentes React

## Requisitos

- Node.js 20.9 ou superior e npm

## Configuração e execução local

Na raiz do repositório, instale as dependências:

```bash
npm install
```

Opcionalmente copie `.env.example` para `.env.local` para definir `SQLITE_PATH`. Sem override, o banco fica em `$XDG_DATA_HOME/crminho/crm.sqlite` ou `~/.local/share/crminho/crm.sqlite` no Linux.

Inicie a aplicação:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Na primeira conexão, o arquivo do banco é criado e o schema de `database/init.sql` é aplicado automaticamente, sem etapa manual.

## Executar no Electron

Para desenvolver na janela desktop, use:

```bash
npm run desktop:dev
```

Esse comando inicia o Electron com `next dev`. Alterações no código do Next.js são atualizadas automaticamente, sem executar `npm run build`. Encerre outras instâncias do CRM antes de iniciar.

Para executar a versão de produção dentro do Electron:

```bash
npm run desktop
```

O comando `npm run desktop` executa `desktop:build` (equivalente a `npm run build && npm run prepare:standalone`) e, em seguida, inicia o Electron servindo o build standalone (`.next/standalone/server.js`). Ele sempre gera o build antes de abrir a janela. Alterações no código do Electron exigem reiniciar o aplicativo. Veja também [electron/README.md](./electron/README.md).

O servidor standalone roda sob `ELECTRON_RUN_AS_NODE`. O `better-sqlite3` 13 usa prebuilds N-API (`prebuilds/<plataforma>-<arch>.node`), compatíveis com Node e Electron, então não é preciso reconstruir o módulo para cada runtime. O comando `npm run desktop` executa `npm run check:electron-abi` antes de abrir a janela e falha com uma mensagem explícita se o prebuild da plataforma não carregar.

A preferência de barra lateral recolhida/expandida é salva em `userData/preferences.json` no Electron e em `localStorage` (`crmini.sidebar.collapsed`) no navegador.

## Distribuição (GitHub Releases)

O aplicativo desktop é distribuído pelo GitHub Releases: enviar uma tag `vX.Y.Z` dispara o workflow `.github/workflows/release.yml`, que gera os instaladores em um runner `windows-latest` e os anexa à release da tag.

Para publicar uma versão:

1. Atualize `version` no `package.json` e no `package-lock.json` (prefira `npm version X.Y.Z --no-git-tag-version`) e faça um commit de versionamento.
2. Crie uma tag anotada no mesmo valor, com o prefixo `v`: `git tag -a vX.Y.Z -m "🔖 CRMini X.Y.Z"`.
3. Envie o commit e a tag: `git push origin main && git push origin vX.Y.Z`.

O critério de escolha do número (SemVer e a política para versões `0.x`) e o checklist completo estão em [`.agents/skills/release-semver/SKILL.md`](./.agents/skills/release-semver/SKILL.md). O workflow falha se a versão da tag (sem o `v`) não for idêntica à `version` do `package.json`. Ele também pode ser executado manualmente (`workflow_dispatch`): nesse caso o build e o empacotamento rodam, mas nenhuma release é publicada; os `.exe` gerados ficam disponíveis no artefato `crmini-windows` da execução (retenção de 7 dias).

Cada execução disparada por tag anexa dois artefatos:

- `CRMini-<versão>-setup.exe`: instalador NSIS por usuário, sem exigir administrador, com atalhos no menu Iniciar e na área de trabalho e desinstalador registrado. Desinstalar não apaga o banco, as preferências nem os logos do usuário.
- `CRMini-<versão>-portable.exe`: executa sem instalar, mas continua gravando os dados no diretório do usuário.

O build precisa rodar no Windows: o `better-sqlite3` carrega um binário nativo por plataforma/arquitetura (`prebuilds/win32-x64.node`), então um pacote gerado em Linux não serve para Windows. Para gerar localmente em uma máquina Windows, use `npm run package:win` (instaladores em `dist/`) ou `npm run package:dir` (apenas o diretório `dist/win-unpacked`, útil para inspeção).

A partir da 0.2.0 o app instalado se atualiza pelo próprio GitHub Releases: o `electron-updater` lê o feed gerado a partir de `build.publish`, então o repositório precisa ser **público** e cada release precisa publicar `latest.yml` e os `*.blockmap` (o workflow valida esses arquivos antes de publicar). A checagem roda em segundo plano e o download só começa quando o usuário aceita; o `portable.exe` e o `npm run dev` não se atualizam. Para desligar a checagem no app instalado, defina `CRM_DISABLE_UPDATES=1`. O comportamento completo está em [electron/README.md](./electron/README.md).

Os binários **não são assinados**: o SmartScreen pode exibir o aviso "O Windows protegeu o seu PC" na primeira execução, e a liberação exige "Mais informações → Executar assim mesmo". A assinatura de código continua fora do fluxo; a atualização automática existe a partir da 0.2.0 e o aviso do SmartScreen também aparece nas atualizações. O plano técnico completo está em [docs/empacotamento-windows.md](./docs/empacotamento-windows.md).

## Banco de dados e migrations

O banco é um arquivo SQLite local no diretório de dados do usuário (configurável por `SQLITE_PATH`). Na abertura, as migrations pendentes de `database/migrations` são executadas automaticamente em ordem e, em seguida, o schema de `database/init.sql` é reaplicado de forma idempotente (em banco novo, o `init.sql` cria tudo e as migrations históricas entram apenas no registro). No Electron, a escolha do banco ocorre apenas na primeira inicialização e fica salva nas preferências do usuário; as migrations rodam antes de iniciar o Next.js, e uma falha impede a abertura da janela. Use Configurações para escolher outro banco; o app reinicia para abrir o novo caminho, sem mover ou apagar o anterior. Se o caminho salvo não estiver disponível ou for inválido, o app informa o problema e oferece seletor explícito de recuperação; cancelar encerra o app preservando a preferência e sem criar banco vazio.

Os logos enviados ficam em `assets/` na mesma pasta do banco em uso (Configurações exibe o caminho). Para backup ou para levar o CRM a outro computador, copie o arquivo `<pasta>/crm.sqlite` (encerre o app antes) junto da pasta `<pasta>/assets/`; copiar só o banco deixa as imagens para trás.

A pasta de dados do aplicativo desktop é `%APPDATA%\CRMini` (`~/.config/CRMini` no Linux).

Para inserir os dados de demonstração (três empresas, seus contatos e oportunidades de exemplo), execute:

```bash
npm run db:seed
```

O seed pode ser executado novamente sem duplicar esses registros.

Alterações de schema para bancos já existentes são migrations append-only em `database/migrations`, aplicadas automaticamente em ordem numérica na abertura do banco e também por `npm run db:migrate` (com caminho opcional: `npm run db:migrate -- /tmp/banco.sqlite`). Antes de aplicar migrations pendentes, o runner cria uma cópia de segurança `<caminho-do-banco>.bak-<AAAAMMDDhhmmss>`; bancos criados por uma versão mais nova do CRM, com migrations desconhecidas, são recusados sem alteração. Veja `database/migrations/README.md`. Para descartar completamente o banco local e recriá-lo do zero, apague o arquivo `database/crm.sqlite` — isso apaga todos os dados.

### Convenções de dados

- IDs são UUIDs em texto gerados pela aplicação.
- Booleanos são `INTEGER` 0/1 no banco e `true`/`false` nas respostas das APIs.
- Valores monetários e horas de projeto são `TEXT` com decimal canônico (ex.: `"1234.56"`), preservando a precisão decimal; somas do painel usam aritmética de centavos inteiros.
- Datas civis (aniversário, abertura de oportunidade) são `TEXT` no formato `YYYY-MM-DD`, sem conversão de fuso.
- Instantes (`created_at`, `updated_at`, `scheduled_at`) são `TEXT` ISO-8601 em UTC (`YYYY-MM-DDTHH:MM:SS.sssZ`), apresentados na interface no fuso `America/Sao_Paulo`.
- A busca textual usa `LIKE` do SQLite, que ignora maiúsculas/minúsculas apenas para caracteres ASCII.

## Testes e validação

Execute os testes automatizados (não precisam de serviços externos) com Vitest:

```bash
npm test
```

Os testes ficam próximos aos módulos em `src/` e são descobertos por `src/**/*.test.{ts,tsx}`. `npm run test:components` também executa a suíte Vitest completa. Os testes de repositório usam um banco SQLite em memória, isolado do banco local.

Para medir a cobertura (Vitest + V8, relatório em texto e HTML em `coverage/`):

```bash
npm run coverage
```

O comando aplica os pisos mínimos configurados em `vitest.config.mts` (statements 80, branches 82, functions 72, lines 81) e falha se a cobertura ficar abaixo deles. Ao adicionar testes que elevem a cobertura de forma sustentada, atualize os pisos no mesmo commit.

Para verificar o lint e gerar a versão de produção:

```bash
npm run lint
npm run build
```

Depois do build, a versão de produção pode ser iniciada com `npm run start`.

## Verificação de responsividade

A checagem de responsividade é manual e opcional: abre cada rota no Chromium do Electron em modo headless, redimensiona a janela e reporta overflow de página e conteúdo cortado nas listagens (`.contact-row-actions` e `.task-status`). Ela precisa de um servidor da aplicação rodando em paralelo — inicie `npm run dev` em outro terminal — e não faz parte de `npm test`. O Chromium usado é o do Electron, então as dependências de desenvolvimento precisam estar instaladas:

```bash
npm run layout:check
```

Para apontar para outra instância, defina `LAYOUT_BASE_URL` (padrão `http://localhost:3000`):

```bash
LAYOUT_BASE_URL=http://localhost:3001 npm run layout:check
```

O comando imprime uma linha por problema com rota, largura e medida, termina com `X verificações, Y problemas` e sai com código 1 se algo falhar. Listagens vazias impedem a medição de conteúdo cortado; rode `npm run db:seed` para usar os dados de demonstração.

## Estrutura

- `src/app/page.tsx`: visão geral do CRM.
- `src/app/clientes`: lista, cadastro e edição de clientes e contatos.
- `src/app/api/clients`: endpoints de cadastro, consulta, edição e exclusão.
- `src/app/api/cep`: consulta de CEP no ViaCEP para autocompletar o endereço do cliente.
- `src/app/oportunidades`: cadastro e acompanhamento de oportunidades.
- `src/app/tarefas`: tarefas.
- `src/lib/db.ts`: conexão SQLite única, com schema inicial, migrations e foreign keys habilitadas.
- `database/init.sql`: schema SQLite para bancos novos.
- `database/migrate.cjs`: runner que aplica o schema, registra/aplica migrations e gera backup antes de alterar bancos existentes.
- `database/migrations`: migrations SQL append-only para bancos existentes.
- `database/seed.sql` e `database/seed.mjs`: clientes, contatos e oportunidades de demonstração.
- `tmp/assets`: logos enviados no modo web (`npm run dev`); no desktop, ficam em `assets/` ao lado do banco. Não versionado.
- `src/app/globals.css`: estilos responsivos da aplicação.
- `docs/padrao-visual.md`: padrão visual obrigatório para criação e ajuste de telas.
- `src/app/layout.tsx`: layout raiz e metadados.

Clientes não são excluídos pela aplicação: a ação disponível os desativa e preserva o histórico. A duração de projeto é persistida em horas (8 por dia, 40 por semana e 160 por mês). Datas e horários seguem o padrão brasileiro na interface e o fuso `America/Sao_Paulo`; instantes são armazenados em UTC, enquanto campos de data civil permanecem sem conversão de fuso. Logos aceitam PNG, JPG ou WebP até 2 MB; no desktop eles são gravados em `assets/` junto do banco escolhido e, sem o app desktop, em `tmp/assets`, um armazenamento provisório não versionado.
