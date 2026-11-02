# Plano — Histórico de eventos (cliente e oportunidade)

> Status: **planejamento**. Nenhum arquivo de código, schema ou migration foi alterado.
> Este documento consolida o entendimento do pedido, as decisões recomendadas e o
> fatiamento em fases. D1–D3 foram confirmadas em 01/11/2026; D4–D7 continuam como
> recomendação e não bloqueiam o schema (D6/D7 são validações da API e D4 é a fase 4).
> A aderência ao código foi reverificada em 01/11/2026 após os commits de dados
> cadastrais do site — achados e ajustes no §12.

## 1. Problema e objetivo

Hoje o CRM registra o **futuro** (tarefas/compromissos) e o **estado atual** das
oportunidades, mas não o **que aconteceu** no relacionamento. O usuário precisa
registrar conversas e acontecimentos relevantes:

- ligados a um cliente, com ou sem oportunidade em andamento;
- ligados a uma oportunidade específica;
- e, em casos específicos, um evento poderia ser a **origem** de uma oportunidade
  (capacidade descartada; ver §7).

São, na prática, **duas superfícies da mesma feature**:

1. **Histórico na ficha do cliente** — visão completa do relacionamento.
2. **Histórico da oportunidade** — recorte do que aconteceu naquele negócio.

A segunda exige uma decisão de escopo: hoje **não existe tela de detalhe de
oportunidade** (`/oportunidades` tem apenas lista e formulário de criação).

## 2. Fronteira com “tarefas”

| Conceito | Quando | Onde vive hoje |
|---|---|---|
| Tarefa/compromisso | Futuro (agendar e-mail, ligação, reunião) | `tasks` |
| Evento | Passado (conversa que tive, fato registrado) | **novo** |

A UI deve deixar isso explícito no texto (“Registrar evento” vs “Nova tarefa”)
para não criar duas agendas concorrentes. Não há migração automática entre
tarefa e evento no escopo.

## 3. Decisões (D1–D3 confirmadas)

| # | Decisão | Recomendação | Status | Impacto se mudar |
|---|---|---|---|---|
| D1 | Superfícies | Ficha do cliente **+** página de detalhe da oportunidade | **Confirmado** | Sem a página de detalhe, a timeline da oportunidade precisaria de expansão de linha/drawer (mais gambiarra de a11y e CSS) |
| D2 | Granularidade da data | **Data civil** `YYYY-MM-DD` (`occurred_at`), ordenação com desempate por `created_at` | **Confirmado** | Data+hora exige `datetime-local`, conversão de fuso e instante ISO-8601 |
| D3 | Tipos de evento | Lista fechada `reuniao`, `ligacao`, `email`, `mensagem`, `nota` | **Confirmado** | SQLite não altera `CHECK`: mudar depois exige recriar a tabela |
| D4 | Edição/exclusão | Editar sim; excluir com **soft delete**; evento de origem não é excluível | **Confirmado** | Histórico imutável ou hard delete mudam endpoints e regras |
| D5 | Cardinalidade | Evento → no máximo **1** oportunidade; oportunidade → no máximo **1** evento de origem | Recomendado | N:N exigiria tabela de junção e “qual é a origem?” ficaria ambíguo |
| D6 | Cliente inativo | **Permitir** registrar evento (histórico é retrospectivo) | Recomendado | Bloquear exigiria a mesma guarda de `createOpportunity` |
| D7 | Data futura | **Rejeitar** `occurred_at` posterior a hoje em `America/Sao_Paulo` | Recomendado | Permitir futura confunde evento com tarefa |
| D8 | Onde ver o histórico | **Página de detalhe do cliente** em `/clientes/[id]` (somente leitura: resumo, contatos e histórico) + formulário em `/clientes/[id]/editar` | **Confirmado** | Manter a timeline no formulário obriga a abrir a edição para consultar; a página dedicada só de histórico (alternativa A) seria um passo intermediário |

## 4. Modelo de dados

Decisão estrutural: **uma tabela `events` com `opportunity_id` nullable**, não
duas tabelas. O motivo decisivo é o fluxo “evento vira origem de oportunidade”:
com duas tabelas, converter exigiria mover a linha (perdendo identidade e
`created_at`) e a timeline do cliente precisaria de `UNION` com validação
duplicada.

```sql
-- Fecha o par (oportunidade, cliente) para a FK composta de events.
-- id já é PK, então o índice é único por construção (sem risco nos dados atuais).
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_id_client_id_uidx
  ON opportunities(id, client_id);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  opportunity_id TEXT,
  contact_id     TEXT,
  event_type     TEXT NOT NULL CHECK (event_type IN ('reuniao','ligacao','email','mensagem','nota')),
  title          TEXT NOT NULL CHECK (length(trim(title)) > 0),
  details        TEXT,
  occurred_at    TEXT NOT NULL CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  is_origin      INTEGER NOT NULL DEFAULT 0 CHECK (is_origin IN (0, 1)),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT event_contact_client_fk FOREIGN KEY (contact_id, client_id)
    REFERENCES contacts(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT event_opportunity_client_fk FOREIGN KEY (opportunity_id, client_id)
    REFERENCES opportunities(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT event_origin_requires_opportunity
    CHECK (is_origin = 0 OR opportunity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS events_client_id_idx
  ON events(client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_opportunity_id_idx
  ON events(opportunity_id, occurred_at DESC);
-- Garante no máximo um evento de origem por oportunidade.
CREATE UNIQUE INDEX IF NOT EXISTS events_origin_opportunity_uidx
  ON events(opportunity_id) WHERE is_origin = 1;
```

Pontos que não podem ser esquecidos:

- **FK composta** `(opportunity_id, client_id)` e `(contact_id, client_id)`
  garantem no banco que evento, oportunidade e contato são do mesmo cliente.
  Com `NULL` na primeira coluna a FK é satisfeita (semântica *MATCH SIMPLE* do
  SQLite), o que é exatamente o caso “evento só do cliente”.
- **`ON DELETE RESTRICT`**, nunca `SET NULL` em FK composta: o SQLite tentaria
  anular também `client_id` (`NOT NULL`) e falharia.
- **`is_origin`** permanece no schema para compatibilidade; a conversão (F3) foi
  descartada. Status (`Ganha`/`Perdida`) é lido ao vivo da oportunidade.
- **`is_active`** só é usado pelo soft delete da fase 4; listagens filtram
  `is_active = 1`.
- **Sem unicidade de conteúdo**: dois eventos iguais no mesmo dia são válidos.
- **Ordem canônica**: `occurred_at DESC, created_at DESC, id DESC` (desempate
  determinístico para testes).

Migration `database/migrations/003_events.sql` com o mesmo DDL, `IF NOT EXISTS`
em tudo e `-- @applied-if: SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'`
na primeira linha, para o baseline de banco novo funcionar. `init.sql` e
migration precisam ficar idênticos (regra do `database/migrations/README.md`).

Ordem no `init.sql`: o índice único de `opportunities` entra junto ao bloco de
`opportunities`; a tabela `events` entra ao final, depois de `opportunities` e
`contacts`. Na migration, o índice vem antes do `CREATE TABLE events`.

Operação: **não** rodar `npm run db:migrate` no banco real durante o
desenvolvimento sem autorização explícita. Validar com SQLite `:memory:` e/ou
cópia temporária; ao abrir o app, o runner aplica a 003 no banco local com
backup automático antes de alterar o arquivo.

## 5. API

Rotas com `export const runtime = "nodejs"` e `params` assíncronos
(`Promise<{ id: string }>`), como nas rotas atuais do Next 15.

| Método | Rota | Uso | Sucesso | Erros principais |
|---|---|---|---|---|
| `GET` | `/api/events?client_id=&opportunity_id=&type=&limit=` | timeline do cliente ou da oportunidade | `200` | `400` sem filtro/`type` inválido; `503` falha de leitura |
| `POST` | `/api/events` | registrar evento | `201` | `400` validação/vínculo inválido |
| `PATCH` | `/api/events/{id}` | editar conteúdo e vínculos permitidos | `200` | `400`/`404` |
| `DELETE` | `/api/events/{id}` | soft delete | `204` | `409` evento de origem |
| `GET` | `/api/opportunities/{id}` | detalhe da oportunidade (F2) | `200` | `404`/`503` |

A rota de conversão `POST /api/events/{id}/opportunity` e a F3 foram **descartadas**.
O campo `is_origin` e o índice parcial permanecem no schema por compatibilidade,
sem fluxo de criação de origem.

Regras de `POST /api/events`:

- `client_id` obrigatório e existente; **cliente inativo é aceito** (D6).
- `title` obrigatório (`trim`), até 200 caracteres; `details` até 5000, vazio → `NULL`.
- `event_type` ausente → `nota`; fora da lista → `400`.
- `occurred_at` ausente → hoje em `America/Sao_Paulo`; formato inválido ou data
  futura → `400`.
- `contact_id` opcional e, se presente, do mesmo cliente.
- `opportunity_id` opcional e, se presente, do mesmo cliente.
- `is_origin` **não** é aceito no `POST` (só a conversão o define).
- Repositório devolve `null` para vínculo inválido → `400` com mensagem única
  (“Cliente, oportunidade ou contato válido não encontrado.”), seguindo o padrão
  de `createOpportunity`.

A validação do evento fica em `src/lib/event-validation.ts`
(`validateEvent(body): string | null`), no padrão de `src/lib/task-validation.ts`
e coerente com a extração recente de `company-profile.ts`/`cnpj.ts`: rota fina,
regras testáveis isoladamente e mensagens consistentes. Inclui tipo, título,
detalhes, `occurred_at` (data civil válida por round-trip, como em
`task-validation.ts`, e não futura), `client_id` e consistência de
`contact_id`/`opportunity_id` (a integração entre clientes continua garantida
pela FK composta).

O `PATCH` carrega o evento ativo, mescla apenas os campos editáveis
(`event_type`, `title`, `details`, `occurred_at`, `contact_id`,
`opportunity_id`) e revalida o resultado. `client_id` e `is_origin` são
imutáveis; em evento de origem a oportunidade não pode ser trocada. O `DELETE`
faz soft delete; evento de origem retorna `409` e um evento já inativo retorna
`204` de forma idempotente.

## 6. UI/UX

### 6.1 Página de detalhe do cliente — histórico em primeiro plano

`/clientes/[id]` passa a ser uma página **somente leitura** (`ClientDetail`), e o
formulário atual vai para `/clientes/[id]/editar` (`ClientForm`). Isso resolve a
mistura de consulta com edição e deixa o histórico visível sem abrir o formulário.

Layout de `/clientes/[id]`:

- `Breadcrumbs`: Meu espaço → Clientes → Detalhes do cliente;
- cabeçalho (`records-header`) com nome da empresa, nome fantasia/segmento,
  selo “Desativado” quando aplicável e ação **Editar cliente** → `/editar`;
- seção **Histórico** logo após o cabeçalho, com o `EventTimeline` (inclui
  “＋ Registrar evento”);
- seções somente leitura: Dados da empresa, Endereço, Pessoas de contato e
  Observações; use `input readOnly` para valores copiáveis e pares
  rótulo/valor para textos, conforme §9 do padrão visual;
- a timeline só monta depois que `GET /api/clients/{id}` carregar, para passar
  apenas contatos persistidos e manter o histórico coerente.

O formulário em `/clientes/[id]/editar` mantém `client-form--wide` (largura da
página) e ganha um breadcrumb “Cliente” com link de volta para o detalhe; a
timeline sai do formulário. O link “Ver detalhes →” da listagem continua
apontando para `/clientes/{id}` e agora abre o detalhe.

Alternativas descartadas: abas no formulário (não existe padrão de abas),
`/clientes/[id]/historico` isolado (seria um passo intermediário até o detalhe)
e linha expansível/drawer na listagem (espaço apertado e fora do padrão de
navegação).

### 6.2 Oportunidade — página `/oportunidades/[id]`

Criar tela de detalhe, alinhada ao `docs/padrao-visual.md` §9:

- `src/app/oportunidades/[id]/page.tsx` (server, só repassa `params`) +
  `src/components/opportunity-detail.tsx` (client, busca `GET /api/opportunities/{id}`);
- seguir o esqueleto de §9 (`main.records-page`, `Breadcrumbs`, `records-header`,
  `form-section` com `h2` e descrição curta), sem layout próprio e com uma única
  ação principal por seção;
- a página mostra os campos que hoje não aparecem na grade (`customer_need`,
  `offered_solution`, `notes`, budget, horas, contato) e a timeline;
- a edição fica em `/oportunidades/[id]/editar`, reaproveitando o formulário de
  criação no modo `edit` (cliente fixo e contato selecionável);
- na lista, a linha inteira abre o detalhe e a coluna “Ações” leva à edição.

Fallback consciente se a página de detalhe não entrar agora: timeline em linha
expansível da tabela. Custa menos, mas quebra a grade `role="table"`, exige
CSS/aria novos e não resolve a falta de visão detalhada — por isso não é a
recomendação.

### 6.3 Componente reutilizável

`src/components/event-timeline.tsx`:

```tsx
<EventTimeline
  clientId={id}              // ficha do cliente
  opportunityId={oppId}      // detalhe da oportunidade
  lockOpportunity            // na oportunidade, não permite trocar o vínculo
  showOpportunityLink        // na ficha do cliente, link “Ver oportunidade”
  allowPromote               // habilita “Criar oportunidade a partir deste evento”
/>
```

Comportamento:

- `GET /api/events?client_id=…` ou `?opportunity_id=…`, com `refresh()` após
  criar/converter;
- `<ol>`/`<li>` com `<time dateTime="YYYY-MM-DD">` formatado em pt-BR (sem
  conversão de fuso); tipo como etiqueta textual; título; detalhes; cliente,
  contato e oportunidade; selo “Origem da oportunidade” quando `is_origin`;
- estados obrigatórios (`docs/padrao-visual.md` §10): `role="status"` no
  carregamento, `.form-error` + `role="alert"` no erro, `EmptyState` no vazio;
- filtro por tipo (reusa `contact-filters`), sem depender só de cor;
- formulário de novo evento: tipo, título*, detalhes, data*, oportunidade
  (select carregado de `/api/opportunities?client_id=…`, portanto já filtrado
  pelo cliente; na tela da oportunidade fica fixo), contato opcional (lista
  recebida do cliente já carregado na ficha);
- erros de campo seguem `docs/padrao-visual.md` §8 (`.form-field.has-error`,
  `aria-invalid`, `.form-field-error`), sem limpar os demais campos.

Reuso: extrair o `Field` local de `client-form.tsx` para
`src/components/form-field.tsx` (mudança mecânica; evita duplicar a11y).

A conversão de evento em oportunidade (F3) foi descartada. O selo de origem
permanece para dados existentes, mas não há ação de promoção na timeline.

Na F4, cada item do histórico ganhou **Editar** (formulário inline preenchido,
com `PATCH`) e **Excluir** (confirmação + soft delete); eventos de origem não
exibem “Excluir”.

CSS: bloco novo em `globals.css` escopado em `main.records-page`, usando apenas
tokens existentes; sem biblioteca e sem `style={{}}`.

## 7. Fases e priorização

| Fase | Entrega | Esforço | Risco | Depende de | Status |
|---|---|---|---|---|---|
| **F0. Fundação** | `init.sql` + `003_events.sql` + índice único em `opportunities`; `events.ts` (`listEvents`, `getEvent`, `createEvent`); `event-validation.ts`; `POST/GET /api/events`; atualizar `db.test.ts`/`db-resources.test.ts` e `README.md`; testes de repositório e rota | M | Baixo | — | ✅ concluída |
| **F1. Detalhe do cliente** | `ClientDetail` em `/clientes/[id]` (resumo + contatos + histórico), `ClientForm` movido para `/clientes/[id]/editar`, `EventTimeline`, `form-field.tsx`, link/breadcrumbs, CSS, testes | M | Baixo | F0 | ✅ concluída |
| **F2. Timeline da oportunidade** | `GET /api/opportunities/{id}`, `/oportunidades/[id]`, `/oportunidades/[id]/editar`, `opportunity-detail`, linha clicável e coluna de ações, testes | G | Médio | F0, F1 | ✅ concluída |
| **F3. Origem (conversão)** | Descartada por decisão de produto | — | — | — | ❌ descartada |
| **F4. Ciclo de vida** | `PATCH`/`DELETE` de evento, edição inline, soft delete, bloqueio de origem, testes | M | Baixo | F0 | ✅ concluída |

Prioridade confirmada:

1. **F0 + F1 (P0)** — é o MVP que resolve a dor declarada: registrar e consultar
   o histórico do cliente. Sem UI nova complexa e com o dado já modelado para
   as próximas fases.
2. **F2 (P1)** — a segunda superfície. É a fase de maior esforço porque inclui
   uma tela nova, mas também corrige a ausência atual de detalhe da oportunidade.
3. **F4 (P1)** — edição e exclusão lógica dos eventos, com proteção do evento
   de origem. É a manutenção do histórico já existente.

F0–F2 e F4 concluídas; **F3 descartada**. A paginação por cursor fica como
evolução posterior, se o volume justificar.

## 8. Testes e validação

Obrigatórios pela AGENTS.md (`npm test`, `npm run coverage`, `npm run lint`,
`npm run build`):

- **Repositório** (`src/lib/repositories/events.test.ts`, SQLite `:memory:`):
  listagem por cliente inclui eventos com e sem oportunidade e resolve nomes;
  por oportunidade não vaza eventos de outra; filtro por tipo; limite; ordem e
  desempate; `is_origin` como `boolean`; rejeição de contato/oportunidade de
  outro cliente; cliente inativo aceito (intenção documentada).
- **Conversão** (`opportunities.test.ts`): sucesso, `not_found`,
  `already_linked`, `missing_contact`, `invalid_contact` e **rollback** forçando
  falha de `CHECK` (ex.: `status: "Perdida"` sem `loss_reason`) e verificando
  que o evento continua sem vínculo.
- **Rotas**: `events/route.test.ts` e `events/[id]/opportunity/route.test.ts`
  com repositórios mockados, cobrindo cada status HTTP e mensagem.
- **Componentes/páginas**: `event-timeline.test.tsx` (4 estados, filtro, submit,
  erro de campo sem limpar os demais, selo de origem, promoção),
  `opportunity-detail.test.tsx`, `oportunidades/[id]/page.test.tsx`;
  atualizar `client-form.test.tsx` e `opportunities-view.test.tsx` (nome vira link).
- **Infra de teste**: incluir `DELETE FROM events;` **antes** de
  `opportunities`/`clients` em todos os `cleanTables()` (FK `RESTRICT`);
  verificar `src/lib/migrations.test.ts` e os testes do Electron para o novo
  arquivo de migration e o baseline.
- **Listas exatas de schema**: `src/lib/db.test.ts` afirma a lista de tabelas e
  as versões `001`/`002`; `src/lib/db-resources.test.ts` afirma a lista de
  tabelas. Atualizar para incluir `events` e a versão `003` (sem isso, F0
  quebra a suíte).
- **`client-form.test.tsx`**: o `mockFetch` global devolve `{ id: "client-1" }`
  para qualquer URL e 7 asserções usam `calls[0]`. O helper precisa rotear
  `/api/events` e `/api/opportunities` para `[]`, e a timeline só deve montar
  após o carregamento do cliente — efeitos de componentes filhos rodam antes dos
  do pai, então um fetch no mount deslocaria `calls[0]`.
- Pisos de cobertura atuais (80/82/72/81) não mudam; os branches novos ficam
  concentrados nas duas rotas, na validação e no componente, cobertos pela
  tabela acima.

## 9. Riscos e pontos de atenção

- **Sincronia `init.sql` ↔ migration**: divergência quebra o baseline de banco
  novo (o `@applied-if` precisa retornar linha após o `init.sql`).
- **`ON DELETE SET NULL` em FK composta** quebra por `client_id NOT NULL`; usar
  `RESTRICT`.
- **Ordem de limpeza nos testes**: a nova FK `RESTRICT` exige `DELETE FROM events`
  primeiro.
- **Duplicidade conceitual com tarefas**: reforçar o texto “evento = passado,
  tarefa = futuro” na UI.
- **LGPD**: `details` é texto livre e pode conter dado pessoal; não logar
  conteúdo, não expor em mensagens de erro e manter tudo no banco local.
- **Sem autoria**: não há usuários no sistema; “quem registrou” não é rastreável
  e não entra no escopo.
- **Crescimento da timeline**: `LIMIT 50` (máx. 100) no MVP; paginação por
  cursor fica como evolução posterior.
- **README**: a feature anterior atualizou a lista de features, de rotas e a
  seção de comportamento. F0 deve acrescentar o histórico de eventos e
  `/api/events`; caso contrário a documentação diverge do código.
- **Banco real**: não rodar `npm run db:migrate` no banco de desenvolvimento sem
  autorização; validar com `:memory:` ou cópia temporária. A abertura do app
  aplica a 003 com backup automático.
- **`window.prompt`**: o padrão visual passou a tratá-lo como legado. A exclusão
  de evento (F4) deve usar confirmação própria (`window.confirm` ou diálogo),
  nunca `prompt`.
- **Documentação**: `AGENTS.md` diz que migrations são “manuais”, mas
  `src/lib/db.ts` e `database/migrations/README.md` as aplicam automaticamente.
  Corrigir o texto no mesmo PR da fase 0 (não é bloqueante).

## 10. Fora de escopo

Anexos, menções/autoria, notificações, lembretes, integração com e-mail/WhatsApp,
busca global em eventos, geração automática de evento por mudança de status,
edição em massa e importação de histórico existente.

## 11. Pendências (com recomendação)

Resolvido: superfícies (cliente + detalhe da oportunidade), F3 descartada, data
civil e lista de 5 tipos. Restam apenas decisões de validação/ciclo de vida; o
schema não muda por causa delas.

1. **Editar/excluir** — resolvido na F4: editar sim, soft delete sim, evento de
   origem indeletável.
2. **Cliente inativo** — (recomendado) permitir registrar evento; alternativa:
   bloquear como em oportunidades/tarefas.
3. **Data futura** — (recomendado) rejeitar; alternativa: permitir para registrar
   algo combinado que já aconteceu no mesmo dia.

## 12. Verificação de aderência (01/11/2026)

Reverificado após os 4 commits de dados cadastrais do site (`4f17dbc..7a0e702`).
Nenhum deles altera schema, migrations, dependências ou o fluxo de oportunidades.
Ajustes feitos neste documento a partir da verificação:

| Constatação | Impacto | Ajuste |
|---|---|---|
| `client-form.tsx` cresceu (877 linhas) com o painel de prévia; `Field` segue local | Extração de `Field` necessária; a timeline foi movida para a página de detalhe (D8) | §6.1 reescrita; formulário em `/editar` |
| `client-form.test.tsx` agora tem ~1.700 linhas, `mockFetch` global que devolve `{id:"client-1"}` e 7 asserções em `calls[0]` | Um fetch da timeline no mount deslocaria `calls[0]` (efeito de filho roda antes do pai) | Timeline condicionada a `loaded`; `mockFetch` roteado por URL (§6.1, §8) |
| `db.test.ts` afirma tabelas exatas e versões `001`/`002`; `db-resources.test.ts` afirma tabelas exatas | F0 quebraria a suíte ao adicionar `events`/`003` | Incluído no escopo de F0 (§7, §8) |
| `docs/padrao-visual.md` ganhou regras de a11y para painéis de prévia, `form-field-hint` e reforço de que `window.prompt` é legado | Timeline/formulário e F4 devem seguir o padrão atualizado | §6.1, §6.2, §9 |
| `README.md` passou a listar a nova rota e o comportamento da busca | Nova feature deve manter a mesma disciplina | §7 e §9 |
| `scripts/prepare-standalone.cjs` copia a pasta `database` inteira | Nenhum manifesto de migrations a atualizar | Sem ação |
| `next-env.d.ts` está modificado na árvore (`.next-dev` → `.next`, gerado pelo Next) | Não é mudança de feature | Não commitar junto com F0 |
| Oportunidades seguem sem página de detalhe (`opportunities-view.tsx` inalterado) | F2 continua necessária e com o mesmo escopo | Plano inalterado |
