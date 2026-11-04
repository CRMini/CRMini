# CRMini

[![CI](https://github.com/CRMini/CRMini/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CRMini/CRMini/actions/workflows/ci.yml)
[![Release](https://github.com/CRMini/CRMini/actions/workflows/release.yml/badge.svg)](https://github.com/CRMini/CRMini/actions/workflows/release.yml)
[![Versão](https://img.shields.io/github/package-json/v/CRMini/CRMini?label=vers%C3%A3o)](https://github.com/CRMini/CRMini/releases)

Aplicação web de CRM para organizar empresas clientes, contatos, oportunidades e tarefas. Os dados são persistidos em um arquivo SQLite local; a interface permite acompanhar informações e atividades comerciais em um só lugar. O mesmo código roda no navegador (`npm run dev`) e em uma janela desktop com Electron.

## Funcionalidades

- **Visão geral:** métricas de contatos e oportunidades, oportunidades recentes e saudação com o nome configurado pelo usuário.
- **Clientes:** listagem, cadastro, edição, logo (enviado ou buscado automaticamente a partir do site do cliente) e desativação. Cada cliente pode ter vários contatos, exibidos no cadastro do cliente.
- **Contatos:** listagem com filtros, cadastro, edição, ativação/desativação e associação ao cliente.
- **Importação do LinkedIn:** seleção do `Connections.csv`, revisão das conexões, vínculo ou cadastro da empresa e importação em lote como contatos.
- **Oportunidades:** cadastro, acompanhamento por status, motivo de perda, valores, moedas, horas de projeto, página de detalhe com histórico e edição em rota própria.
- **Tarefas:** cadastro, filtros por dia/status e alteração entre `Aberto` e `Concluído`.
- **Histórico:** registro de eventos passados (reunião, ligação, e-mail, mensagem ou nota) na página do cliente, com vínculo opcional a um contato e a uma oportunidade. A consulta fica separada da edição do cadastro; eventos podem ser editados e excluídos logicamente.
- **Configurações:** nome do usuário (usado nas saudações) e, no aplicativo desktop, caminho do banco e pasta de imagens.
- **Aplicativo desktop:** splash de inicialização, barra lateral recolhível e atualização automática pelo GitHub Releases no app instalado.
- **Formulários:** autocomplete de endereço por CEP (ViaCEP), máscaras de CNPJ, CEP e telefone, além da busca de dados cadastrais pelo site da empresa.

## Tecnologias

- Next.js 15 e React 19
- TypeScript 5
- SQLite 3, acessado pela biblioteca `better-sqlite3` 13 (arquivo local, WAL e foreign keys)
- Electron 44, `electron-builder` 26 e `electron-updater` 6 para o aplicativo desktop
- ESLint 9 e Prettier 3 para análise estática e formatação
- Vitest 5 + React Testing Library/jsdom para testes automatizados de lógica e componentes React

## Requisitos

- Node.js **22.12 ou superior** e npm. Essa versão é exigida pelo Electron 44 e pelo Vitest 5.
- Para gerar os instaladores do Windows, o build precisa rodar em uma máquina Windows (veja [Distribuição](#distribuição-github-releases)).

## Configuração e execução local

Na raiz do repositório, instale as dependências:

```bash
npm install
```

Opcionalmente copie `.env.example` para `.env.local`. O Next.js e os scripts de banco (`db:seed` e `db:migrate`) leem esse arquivo. As variáveis disponíveis são:

- `SQLITE_PATH`: caminho do arquivo SQLite. Sem override, o banco fica em `$XDG_DATA_HOME/CRMini/crm.sqlite` ou `~/.local/share/CRMini/crm.sqlite` no Linux; `~/Library/Application Support/CRMini/crm.sqlite` no macOS; `%APPDATA%\CRMini\crm.sqlite` no Windows.
- `CRM_ASSETS_DIR`: pasta dos logos no modo web. Sem override, usa `./tmp/assets`. No aplicativo desktop o Electron define essa variável sozinho, junto do banco.
- `CRM_DB_DRIVER`: provedor de persistência lido no servidor. O único valor suportado atualmente é `sqlite`, usado também quando a variável não existe. Valores desconhecidos interrompem a inicialização com erro explícito, sem fallback silencioso para SQLite.

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

O comando `npm run desktop` executa `desktop:build` (equivalente a `npm run build && npm run prepare:standalone`) e, em seguida, `check:electron-abi` e o Electron servindo o build standalone (`.next/standalone/server.js`). Ele sempre gera o build antes de abrir a janela. Alterações no código do Electron exigem reiniciar o aplicativo. Veja também [electron/README.md](./electron/README.md).

O servidor standalone roda sob `ELECTRON_RUN_AS_NODE`. O `better-sqlite3` 13 usa prebuilds N-API (`prebuilds/<plataforma>-<arch>.node`), compatíveis com Node e Electron, então não é preciso reconstruir o módulo para cada runtime. O comando `npm run desktop` executa `npm run check:electron-abi` antes de abrir a janela e falha com uma mensagem explícita se o prebuild da plataforma não carregar.

A preferência de barra lateral recolhida/expandida é salva em `userData/preferences.json` no Electron e em `localStorage` (`crmini.sidebar.collapsed`) no navegador. A splash de inicialização permanece visível enquanto o banco/migrations e o servidor Next.js são preparados.

## Distribuição (GitHub Releases)

O aplicativo desktop é distribuído pelo GitHub Releases: enviar uma tag `vX.Y.Z` dispara o workflow `.github/workflows/release.yml`, que gera os instaladores em um runner `windows-latest` e os anexa à release da tag.

Para publicar uma versão:

1. Atualize `version` no `package.json` e no `package-lock.json` (prefira `npm version X.Y.Z --no-git-tag-version`) e faça um commit de versionamento.
2. Crie uma tag anotada no mesmo valor, com o prefixo `v`: `git tag -a vX.Y.Z -m "🔖 CRMini X.Y.Z"`.
3. Envie o commit e a tag: `git push origin main && git push origin vX.Y.Z`.

O critério de escolha do número (SemVer e a política para versões `0.x`) e o checklist completo estão em [`.agents/skills/release-semver/SKILL.md`](./.agents/skills/release-semver/SKILL.md). O workflow falha se a versão da tag (sem o `v`) não for idêntica à `version` do `package.json`. Ele também pode ser executado manualmente (`workflow_dispatch`): nesse caso o build e o empacotamento rodam, mas nenhuma release é publicada; os `.exe` gerados ficam disponíveis no artefato `crmini-windows` da execução (retenção de 7 dias).

Cada execução disparada por tag publica os dois instaladores e os metadados de atualização (`latest.yml` e `*.blockmap`):

- `CRMini-<versão>-setup.exe`: instalador NSIS por usuário, sem exigir administrador, com atalhos no menu Iniciar e na área de trabalho e desinstalador registrado. Desinstalar não apaga o banco, as preferências nem os logos do usuário.
- `CRMini-<versão>-portable.exe`: executa sem instalar, mas continua gravando os dados no diretório do usuário.
- `latest.yml` e `*.blockmap`: consumidos pelo `electron-updater` para oferecer a atualização automática.

O build precisa rodar no Windows: o `better-sqlite3` carrega um binário nativo por plataforma/arquitetura (`prebuilds/win32-x64.node`), então um pacote gerado em Linux não serve para Windows. Para gerar localmente em uma máquina Windows, use `npm run package:win` (instaladores em `dist/`) ou `npm run package:dir` (apenas o diretório `dist/win-unpacked`, útil para inspeção).

A partir da 0.2.0 o app instalado se atualiza pelo próprio GitHub Releases: o `electron-updater` lê o feed gerado a partir de `build.publish`, então o repositório precisa ser **público** e cada release precisa publicar `latest.yml` e os `*.blockmap` (o workflow valida esses arquivos antes de publicar). A checagem roda em segundo plano e o download só começa quando o usuário aceita; o `portable.exe` e o `npm run dev` não se atualizam. Para desligar a checagem no app instalado, defina `CRM_DISABLE_UPDATES=1`. O comportamento completo está em [electron/README.md](./electron/README.md).

As notas da release são geradas automaticamente a partir dos commits (`generate_release_notes`), mas podem vir apenas com o link do changelog. O checklist em [`.agents/skills/release-semver/SKILL.md`](./.agents/skills/release-semver/SKILL.md) orienta revisar e, se necessário, preencher a descrição em português.

Os binários **não são assinados**: o SmartScreen pode exibir o aviso "O Windows protegeu o seu PC" na primeira execução, e a liberação exige "Mais informações → Executar assim mesmo". A assinatura de código continua fora do fluxo; a atualização automática existe a partir da 0.2.0 e o aviso do SmartScreen também aparece nas atualizações. O plano técnico completo está em [docs/empacotamento-windows.md](./docs/empacotamento-windows.md).

## Banco de dados e migrations

O banco é um arquivo SQLite local no diretório de dados do usuário (configurável por `SQLITE_PATH`). No Electron, o banco padrão fica em `app.getPath("userData")/crm.sqlite`: `%APPDATA%\CRMini` no Windows, `~/.config/CRMini` no Linux e `~/Library/Application Support/CRMini` no macOS. A escolha de outro banco é feita em Configurações e fica salva nas preferências do usuário; o app reinicia para abrir o novo caminho, sem mover ou apagar o anterior. Se o caminho salvo não estiver disponível ou for inválido, o app informa o problema e oferece seletor explícito de recuperação; cancelar encerra o app preservando a preferência e sem criar banco vazio.

Na abertura, as migrations pendentes de `database/migrations` são executadas automaticamente em ordem e, em seguida, o schema de `database/init.sql` é reaplicado de forma idempotente (em banco novo, o `init.sql` cria tudo e as migrations históricas entram apenas no registro). No Electron, as migrations rodam antes de iniciar o Next.js, e uma falha impede a abertura da janela. A CLI também está disponível:

```bash
npm run db:migrate
npm run db:migrate -- /tmp/banco.sqlite
```

Antes de aplicar migrations pendentes, o runner cria uma cópia de segurança `<caminho-do-banco>.bak-<AAAAMMDDhhmmss>`; bancos criados por uma versão mais nova do CRM, com migrations desconhecidas, são recusados sem alteração. O formato append-only e as regras de `init.sql` estão em [database/migrations/README.md](./database/migrations/README.md).

No desktop, os logos ficam em `assets/` na mesma pasta do banco em uso (Configurações exibe o caminho). Para backup ou para levar o CRM a outro computador, encerre o app e copie o arquivo do banco (por exemplo, `<pasta>/crm.sqlite`) junto da pasta `<pasta>/assets/`; copiar só o banco deixa as imagens para trás. No modo web, os logos ficam em `CRM_ASSETS_DIR` ou, sem override, em `tmp/assets`, um armazenamento provisório não versionado. Além do upload, o logo pode ser buscado no site do cliente: a busca usa `<link rel="icon">`, `apple-touch-icon`, `og:image` e, por fim, `/favicon.ico`, e aceita apenas PNG, JPG ou WebP até 2 MB (SVG é rejeitado).

O cadastro de cliente também pode buscar os dados cadastrais no site da empresa: razão social, nome fantasia, CNPJ, telefone, e-mail e endereço. A busca lê os dados estruturados da home (JSON-LD, OpenGraph e microdata) e o texto visível, sem crawl e sem gravar nada no servidor; o resultado aparece em uma prévia revisável campo a campo, e campos já preenchidos só são substituídos com marcação explícita do usuário.

O histórico da página do cliente registra o que já aconteceu (evento = passado); agendamentos continuam em Tarefas (tarefa = futuro). Cada evento tem uma data civil (`occurred_at`), não pode ser futuro e aceita vínculo opcional com um contato e uma oportunidade do mesmo cliente. Em `/clientes/[id]` ficam o resumo, os contatos e o histórico; o formulário de edição fica em `/clientes/[id]/editar`.

Para descartar completamente o banco em uso e recriá-lo do zero, encerre o app e apague o arquivo indicado em Configurações no desktop (ou o caminho de `SQLITE_PATH`/padrão no modo web), junto dos arquivos `-wal` e `-shm` ao lado dele. Isso apaga todos os dados.

Para inserir os dados de demonstração (três empresas, seis contatos e três oportunidades), execute:

```bash
npm run db:seed
```

O seed pode ser executado novamente sem duplicar esses registros; ele usa `ON CONFLICT (id) DO UPDATE` e atualiza os registros de demonstração.

### Convenções de dados

- IDs são UUIDs em texto gerados pela aplicação.
- Booleanos são `INTEGER` 0/1 no banco e `true`/`false` nas respostas das APIs.
- Valores monetários e horas de projeto são `TEXT` com decimal canônico (ex.: `"1234.56"`), preservando a precisão decimal; somas do painel usam aritmética de centavos inteiros.
- Datas civis (aniversário, abertura de oportunidade) são `TEXT` no formato `YYYY-MM-DD`, sem conversão de fuso.
- Instantes (`created_at`, `updated_at`, `scheduled_at`) são `TEXT` ISO-8601 em UTC (`YYYY-MM-DDTHH:MM:SS.sssZ`), apresentados na interface no fuso `America/Sao_Paulo`.
- A busca textual usa `LIKE` do SQLite, que ignora maiúsculas/minúsculas apenas para caracteres ASCII.

## Importação do LinkedIn

A tela **Contatos → Importar do LinkedIn** (`/contatos/importar`) lê o `Connections.csv` exportado pelo LinkedIn. O arquivo é interpretado no navegador e não é enviado ao servidor; apenas as conexões selecionadas são enviadas para a API.

- O parser ignora o preâmbulo do export, remove BOM, aceita campos entre aspas e detecta `,`, `;` ou tabulação no cabeçalho.
- Limites: 5 MB e 10.000 conexões por arquivo; a importação aceita até 1.000 contatos por requisição.
- Duplicatas fortes são bloqueadas: mesma URL de perfil do LinkedIn em contato ativo (global) ou mesmo e-mail em contato ativo do mesmo cliente. A checagem é repetida no servidor.
- Empresas são associadas pelo nome normalizado (sem acentos, caixa e espaços repetidos). Empresas não cadastradas podem ser criadas em um formulário aberto logo abaixo da própria conexão, sem perder a seleção.
- O progresso (conexões interpretadas, seleção, filtros, página e rolagem) fica no `sessionStorage` desta aba por até duas horas. Assim, ao abrir o detalhe de um contato e voltar, a lista retorna exatamente ao ponto anterior. O rascunho é limpo ao descartar o arquivo ou fechar a aba e nunca contém o texto bruto do CSV.
- Links para o detalhe do contato a partir da importação usam `?returnTo=/contatos/importar`; o botão de voltar do formulário retorna à importação.
- A importação grava em uma única transação. Falhas de banco fazem rollback total; itens inválidos ou duplicados são devolvidos com o motivo.
- Nenhuma migration é necessária: `contacts` já possui os campos usados e não há índice único de e-mail ou LinkedIn.

## Testes e validação

Execute os testes automatizados (não precisam de serviços externos) com Vitest:

```bash
npm test
```

Os testes ficam próximos aos módulos em `src/` e são descobertos por `src/**/*.test.{ts,tsx}`. `npm run test:components` também executa a suíte Vitest completa. Os testes de repositório usam um banco SQLite em memória, isolado do banco local.

Para medir a cobertura (Vitest + V8, relatório em texto, HTML e JSON-summary em `coverage/`):

```bash
npm run coverage
```

A cobertura inclui `src/**/*.{ts,tsx}`, `electron/**/*.cjs` e `scripts/**/*.cjs`. O comando aplica os pisos mínimos configurados em `vitest.config.mts` (statements 80, branches 82, functions 72, lines 81) e falha se a cobertura ficar abaixo deles. Ao adicionar testes que elevem a cobertura de forma sustentada, atualize os pisos no mesmo commit.

Para verificar lint, formatação e gerar a versão de produção:

```bash
npm run lint
npm run format:check
npm run build
```

Use `npm run format` para aplicar o Prettier. O build usa `output: "standalone"`; por isso `npm run start` não é compatível com essa configuração. Para pré-visualizar a versão de produção no navegador, gere o standalone e execute o servidor diretamente:

```bash
npm run build
npm run prepare:standalone
node .next/standalone/server.js
```

### Integração contínua

O workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) roda em push para `main` e em pull requests, no Node.js 22: instala as dependências com `npm ci` e executa `npm run lint`, `npm run coverage` (testes + pisos de cobertura) e `npm run build`. Um push novo no mesmo ref cancela a execução anterior, e o relatório de `coverage/` é publicado como artefato `coverage-report` quando o job falha. `npm run format:check` ainda não é um gate do CI, porque há arquivos preexistentes fora do padrão do Prettier; a verificação continua local, antes do commit.

O workflow [`.github/workflows/release.yml`](./.github/workflows/release.yml) também executa `npm run coverage` antes de empacotar os instaladores, então uma tag `vX.Y.Z` não publica release com teste ou cobertura falhando.

## Verificação de responsividade

A checagem de responsividade é manual e opcional: abre cada rota no Chromium do Electron em modo headless, redimensiona a janela e reporta overflow de página e conteúdo cortado nas listagens (`.contact-row-actions` e `.task-status`). Ela percorre 10 rotas (incluindo `/configuracoes` e as telas de cadastro) em 21 larguras, de 320 a 1440 px, com as transições dos breakpoints 600/601, 680/681 e 900/901. Precisa de um servidor da aplicação rodando em paralelo — inicie `npm run dev` em outro terminal — e não faz parte de `npm test`. O Chromium usado é o do Electron, então as dependências de desenvolvimento precisam estar instaladas:

```bash
npm run layout:check
```

Para apontar para outra instância, defina `LAYOUT_BASE_URL` (padrão `http://localhost:3000`):

```bash
LAYOUT_BASE_URL=http://localhost:3001 npm run layout:check
```

O comando imprime uma linha por problema com rota, largura e medida, termina com `X verificações, Y problemas` e sai com código 1 se algo falhar. Listagens vazias impedem a medição de conteúdo cortado; rode `npm run db:seed` para usar os dados de demonstração.

## Estrutura

- `src/app/page.tsx`: visão geral do CRM, com métricas, oportunidades recentes e saudação.
- `src/app/clientes`: lista, cadastro e edição de clientes; o cadastro do cliente também gerencia os contatos vinculados.
- `src/app/contatos`: lista, cadastro e edição de contatos, com ativação/desativação e filtros.
- `src/app/contatos/importar`: revisão e importação das conexões exportadas do LinkedIn.
- `src/app/oportunidades`: lista, cadastro e acompanhamento de oportunidades.
- `src/app/tarefas`: lista, cadastro e alteração de status das tarefas.
- `src/app/configuracoes`: nome do usuário e, no desktop, caminho do banco e pasta de imagens.
- `src/app/api/clients`: endpoints de cadastro, consulta, edição e desativação de clientes.
- `src/app/api/contacts`: endpoints de contatos, incluindo consulta, edição e `PATCH` de ativação/desativação.
- `src/app/api/contacts/import`: importação transacional em lote das conexões selecionadas.
- `src/app/api/opportunities`: endpoints de oportunidades, incluindo alteração de status e motivo de perda.
- `src/app/api/tasks`: endpoints de tarefas, incluindo criação e alteração de status.
- `src/app/api/events`: histórico de eventos do cliente ou da oportunidade e registro de novos eventos.
- `src/app/api/settings`: leitura e gravação do nome do usuário em `app_settings`.
- `src/app/api/logo`: upload e leitura dos logos dos clientes.
- `src/app/api/logo/from-site`: busca o logo a partir do site informado.
- `src/app/api/company/from-site`: busca dados cadastrais a partir do site informado.
- `src/app/api/cep`: consulta de CEP no ViaCEP para autocompletar o endereço do cliente.
- `src/components`: componentes compartilhados (barra lateral, breadcrumbs, listagens, formulários e chip de atualização).
- `src/lib/db.ts`: conexão SQLite única, com schema inicial, migrations e foreign keys habilitadas.
- `src/lib/repositories`: fachadas públicas de acesso ao banco para clientes, contatos, oportunidades, tarefas, eventos, configurações e painel. `contracts.ts` define os contratos, `provider.ts` seleciona o provedor e `registry.ts` monta o conjunto usado pela aplicação; as implementações concretas ficam em `src/lib/repositories/sqlite`.
- `src/lib`: regras e utilitários de domínio (máscaras, CEP, telefone, datas, horas de projeto, métricas do painel, preferência da sidebar, caminhos de logos e parser do export do LinkedIn).
- `electron/`: processo principal, preload, splash, seleção de banco, migrations, servidor Next e atualização automática. Veja `electron/README.md`.
- `scripts/`: preparação do standalone, verificação do ABI do `better-sqlite3` e checagem de responsividade.
- `database/init.sql`: schema SQLite para bancos novos.
- `database/migrate.cjs`: runner que aplica o schema, registra/aplica migrations e gera backup antes de alterar bancos existentes.
- `database/migrations`: migrations SQL append-only para bancos existentes.
- `database/seed.sql` e `database/seed.mjs`: clientes, contatos e oportunidades de demonstração.
- `database/sqlite-paths.cjs`: resolução do banco padrão, validação de arquivos do CRM e migração do banco legado.
- `docs/padrao-visual.md`: padrão visual obrigatório para criação e ajuste de telas.
- `docs/empacotamento-windows.md`: plano técnico do empacotamento Windows.
- `docs/plano-assets-do-banco.md`: decisões sobre a pasta de imagens acompanhar o banco.
- `public/brand`: logos e favicon usados pela aplicação; `public/company-logos`: logos de demonstração.
- `assets/brand`: ícones por plataforma organizados a partir do Brand Kit (não integrados ao empacotamento atual; o instalador usa `public/brand/crmini-favicon.ico`).
- `src/app/globals.css`: estilos responsivos da aplicação.
- `src/app/layout.tsx`: layout raiz, metadados e montagem da barra lateral e do chip de atualização.

Clientes não são excluídos pela aplicação: a ação disponível os desativa e preserva o histórico. Contatos também são desativados em vez de removidos, podendo ser reativados. A duração de projeto é persistida em horas (8 por dia, 40 por semana e 160 por mês). Datas e horários seguem o padrão brasileiro na interface e o fuso `America/Sao_Paulo`; instantes são armazenados em UTC, enquanto campos de data civil permanecem sem conversão de fuso. Logos aceitam PNG, JPG ou WebP até 2 MB; no desktop eles são gravados em `assets/` junto do banco escolhido e, sem o app desktop, em `CRM_ASSETS_DIR` ou `tmp/assets`. A busca pelo site só ocorre por ação do usuário, substitui o logo atual após confirmação, exige site público acessível (endereços privados ou internos são bloqueados) e conexão com a internet. A busca de dados cadastrais é pontual (uma única requisição à home), exige site público, não persiste nada no servidor e nunca substitui um campo preenchido sem confirmação do usuário.
