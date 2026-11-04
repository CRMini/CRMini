# Instruções para agentes

## Projeto e estrutura

- Este repositório contém um CRM em Next.js 15, React 19 e TypeScript, com SQLite local acessado via `better-sqlite3`.
- Páginas e rotas da aplicação ficam em `src/app`; componentes compartilhados em `src/components`; lógica reutilizável em `src/lib`.
- APIs ficam em `src/app/api`. O schema para bancos novos está em `database/init.sql`; alterações para bancos existentes são migrations manuais em `database/migrations`.
- Antes de alterar um fluxo, leia a página/componente, a rota de API e as constraints SQL relacionadas. Não presuma que a validação da interface protege a API.
- O padrão visual obrigatório para criar ou ajustar telas está em `docs/padrao-visual.md`.

## Regras de domínio observadas

- Um cliente representa uma empresa; contatos pertencem a um cliente por `client_id`. O nome da empresa é obrigatório e o cliente pode ser salvo sem contatos: contato é opcional e um cartão de contato sem nome não é persistido. Outros campos, incluindo aniversário, são opcionais.
- Clientes são desativados (`is_active = false`) em vez de excluídos pela aplicação. Isso preserva o histórico; oportunidades e tarefas também restringem exclusões por suas relações.
- Oportunidades devem apontar para um cliente e um contato daquele mesmo cliente. Os status válidos são `Em andamento`, `Desenvolvimento`, `Proposta`, `Aceite da proposta`, `Ganha` e `Perdida`. Uma oportunidade perdida exige motivo (`Preço`, `Prazo`, `Tecnologia` ou `Solução`); outros status não devem ter motivo de perda. Valores e horas de projeto não podem ser negativos.
- Moedas aceitas no schema são `BRL`, `USD`, `EUR` e `PES`.
- Tarefas devem apontar para cliente e contato correspondentes. Tipos aceitos: `email`, `telefone` e `compromisso`; status: `Aberto` e `Concluído`; assunto não pode ficar vazio.
- A duração de projeto é armazenada em horas: 8 horas por dia, 40 por semana e 160 por mês.
- Não invente regras de unicidade para CNPJ/e-mail, nem assuma que deve existir exatamente um contato principal. Confirme o requisito e avalie dados existentes antes de introduzir restrições.

## Dados, APIs e datas

- Valide entradas no servidor/API e mantenha a interface coerente. Use consultas SQL parametrizadas; não concatene dados recebidos do usuário em consultas.
- Preserve a associação entre cliente e contato em todas as operações. Mudanças que atualizem múltiplos registros relacionados devem usar transação e rollback em caso de falha.
- Em atualizações, não apague nem substitua dados existentes sem que o contrato do endpoint/formulário peça isso explicitamente. Trate campos opcionais e valores vazios de forma consistente com o fluxo existente.
- Datas civis (como aniversário e abertura de oportunidade) são `TEXT` no formato `YYYY-MM-DD`, não representam instantes e não devem sofrer conversão de fuso. Instantes (`created_at`, `updated_at`, `scheduled_at`) são `TEXT` ISO-8601 persistidos em UTC e apresentados na interface no fuso `America/Sao_Paulo`; preserve essa distinção.
- Booleanos são `INTEGER` 0/1 no banco; valores monetários e horas são `TEXT` com decimal canônico (ex.: `"1234.56"`) para preservar a precisão decimal.
- Não inclua dados pessoais reais em código, fixtures, logs ou testes. Evite expor dados desnecessários nas respostas das APIs.
- Problemas em um campo de formulário (valor inválido, consulta externa sem resultado etc.) DEVEM seguir o padrão de `docs/padrao-visual.md`: borda vermelha no controle e mensagem textual em `.form-field-error` logo abaixo, sem alterar os outros campos.

## Banco de dados

- Para banco novo, `database/init.sql` é aplicado automaticamente na abertura do banco pela conexão em `src/lib/db.ts`, que também habilita `PRAGMA foreign_keys = ON`. Migrations em `database/migrations` são manuais e devem ser aplicadas na ordem numérica, uma única vez, a bancos existentes compatíveis.
- A persistência é acessada pelos módulos públicos de `src/lib/repositories`, que delegam ao provedor escolhido por `CRM_DB_DRIVER` (hoje apenas `sqlite`). Novas implementações devem respeitar `contracts.ts` e ser registradas em `registry.ts`, sem fallback silencioso de banco.
- Antes de modificar schema ou preparar instruções de migration, confira o schema atual, migrations anteriores e os consumidores da coluna/tabela. Considere os dados existentes e faça backup antes de migrations destrutivas.
- Não aplique comandos ao banco nem remova o arquivo do banco (`database/crm.sqlite` ou `SQLITE_PATH`) como parte da tarefa sem autorização explícita. A remoção do arquivo apaga os dados locais.

## Testes e validação

- O projeto usa Vitest + React Testing Library; os testes ficam próximos aos módulos em `src/**/*.test.{ts,tsx}` (o `include` do Vitest cobre apenas `src/`). Execute `npm test` para rodar a suíte completa e `npm run test:components` para executar o alias mantido para Vitest.
- Toda alteração de comportamento ou regra de negócio deve incluir ou atualizar testes automatizados para sucesso, validação e casos-limite relevantes.
- Testes automatizados são obrigatórios para toda mudança funcional (incluindo correções e refatorações que alterem comportamento); não finalize sem cobertura correspondente. Lint, build e revisão manual não substituem testes.
- A cobertura é medida com `npm run coverage` (Vitest + V8), com relatório em texto e HTML em `coverage/` e pisos mínimos configurados em `vitest.config.mts` (statements 80, branches 82, functions 72, lines 81). O comando falha se a cobertura ficar abaixo dos pisos.
- Toda funcionalidade, endpoint, página ou regra nova deve vir com testes que a cubram: endpoints com status HTTP, mensagens de erro e chamada ao repositório; páginas com renderização e repasse de props/params; regras de domínio com sucesso, validação e limites. Se não for possível testar algo, registre o motivo explicitamente em vez de omitir.
- Não reduza os pisos de cobertura nem exclua arquivos do relatório para fazer a suíte passar; quando a cobertura subir de forma sustentada, eleve os pisos. Não crie testes que apenas verificam a existência de código (ex.: leitura de fonte com regex) ou que duplicam o teste de outro módulo.
- Testes de rota devem mockar os repositórios; regras de persistência e SQL ficam nos testes de repositório, com SQLite `:memory:` isolado.
- Antes de finalizar, rode `npm test`, `npm run coverage` e `npm run lint`; quando aplicável, valide também com `npm run build`. Relate com precisão quais comandos foram executados, os números de cobertura e seus resultados.

## Princípios de mudança

- Prefira mudanças locais, simples e consistentes com os padrões existentes; evite refatorações não relacionadas.
- Não instale dependências nem faça alterações no sistema fora do repositório sem autorização.
- Atualize `README.md` quando mudar comandos de execução, configuração, migrations ou procedimentos relevantes para quem desenvolve o projeto.

## Commits

- NUNCA crie commits, tags, `git push` ou publique releases por conta própria, mesmo com a implementação concluída e todas as validações verdes.
- Conclua a implementação, relate os comandos executados e o estado dos testes e, em seguida, aguarde a validação explícita do usuário (por exemplo, "validado", "pode commitar").
- Se o usuário pedir a mensagem de commit antes da validação, apenas sugira o texto; só execute o commit depois do aval explícito.
- Depois do aval, siga o padrão de mensagens descrito em `.agents/skills/commits-gitmoji/SKILL.md`.

