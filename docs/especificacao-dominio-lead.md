# Especificação de domínio — Lead e agregados

> Status: decisões D-01..D-10 aplicadas em 23/11/2026 — nenhum código, schema ou migration
> foi alterado; questões abertas restantes em §10.2 e nenhuma delas bloqueia o schema ou a
> conversão.
> Fonte: transcrição do pedido do usuário (23/11/2026) em `/tmp/opencode/lead-form-source.md`.
> Escopo: modelo de domínio do Lead (entidades, value objects, campos, enumerações,
> estados, invariantes, conversão e fronteiras de agregado). Fora de escopo: UI/UX,
> componentes, CSS, plano por arquivo, SQL executável, migrations, testes e cronograma.

---

## 1. Objetivo e escopo

O **Lead** é uma oportunidade de negócio **ainda não qualificada como conta** no CRM. Ele
captura uma empresa prospectada, o contato que a representa e as respostas de qualificação
comercial (BANT, prioridade, prazo, budget) e a comunicação iniciada, **antes** de existir
cliente, contato ou oportunidade.

O Lead é a **raiz** de um agregado próprio. Fica **de fora** deste agregado (são agregados
independentes que já existem ou que serão expandidos):

| Conceito | Agregado | Relação com o Lead |
|---|---|---|
| Empresa (conta) | `clients` | criada **na conversão** a partir do snapshot do Lead |
| Contato | `contacts` | criado **na conversão** a partir do contato do Lead |
| Oportunidade | `opportunities` | criada **na conversão**, vinculada ao Lead |
| Tarefa/evento de relacionamento | `tasks` / `events` | podem ser derivados da Comunicação do Lead |
| Ambiente Tecnológico, Contrato, Faturamento, Principais Concorrentes, Áreas de Oportunidade | `clients` (expansão futura) | preenchidos **depois** da conversão, não fazem parte do Lead |

As seções CONTATOS e EMPRESA da fonte existem apenas porque a conversão precisa preenchê-las;
não são entidades do agregado Lead.

**Por que o Lead não é um cliente inativo.** Um cliente (`clients.is_active = 0`) é uma conta
que já existiu, com relacionamento estabelecido; o Lead ainda não virou conta e pode terminar
em `Desqualificado` — um estado que não tem correspondente em `clients`. Reusar `clients`
exigiria inventar um estado "lead" sobre a mesma tabela e misturar dois ciclos de vida.

**Por que o Lead não é uma oportunidade em estado inicial.** `opportunities` exige
`client_id` e `contact_id` (um contato de um cliente) e tem o próprio ciclo
(`Em andamento` … `Ganha`/`Perdida`) com valores/horas de projeto. O Lead precede a conta e a
oportunidade; a oportunidade nasce **a partir** do Lead, na conversão, e não o substitui.

---

## 2. Mapa de agregados e fronteiras

```
Lead (raiz)
├── Empresa do lead            (value object snapshot — materializado em clients na conversão)
├── Contato do lead            (value object snapshot, 1:1 — materializado em contacts na conversão)
├── Qualificação comercial     (value object — BANT, prioridade, prazo, budget; exclusivo do Lead)
├── Comunicação                (value object — histórico, tipo, próxima interação; parcialmente levado à oportunidade)
└── Estado do lead             (enum de status + motivo de desqualificação + vínculo de conversão)
```

- **Entidades internas do Lead:** nenhuma com identidade própria. Empresa, contato,
  qualificação e comunicação são **value objects** que só ganham identidade (tornam-se linhas
  em `clients`, `contacts`, `opportunities`) **no momento da conversão**.
- **Cópia materializada na conversão:** Empresa → `clients`; Contato → `contacts`;
  parte da Comunicação → `opportunities` (e/ou `tasks`). Os value objects **não são**
  linhas pré-existentes em `clients`/`contacts`; são cópias feitas na transação de conversão.
- **Agregados independentes:** `clients`, `contacts`, `opportunities`, `tasks`, `events`
  continuam sendo seus próprios agregados. O Lead **referencia** a oportunidade criada
  (`opportunity_id`) depois da conversão, mas não é dono dela.

Fronteira de consistência: dentro do agregado Lead, a invariante "Desqualificado exige motivo"
e "conversão é idempotente" são garantidas pelo Lead. A consistência entre cliente/contato e
oportunidade (mesmo `client_id`) continua garantida pelas FKs compostas já existentes.

---

## 3. Entidades, value objects e campos

Convenções de tipo físico aplicadas (AGENTS.md e `database/init.sql`): IDs `TEXT` (UUID gerado
pela aplicação); booleanos `INTEGER` 0/1; dinheiro e horas `TEXT` decimal canônico; datas
civis `TEXT YYYY-MM-DD`; instantes `TEXT ISO-8601 UTC`; enumerações fechadas `TEXT` + CHECK;
listas extensíveis como FK para tabela de referência.

Nomes técnicos em snake_case, coerentes com as colunas existentes (`company_name`, `trade_name`,
`tax_id`, `industry`, `website`, `phone`, `email`, `postal_code`, `street`, `street_number`,
`complement`, `city`, `state`, `country`, `notes` em `clients`; `full_name`, `job_title`,
`email`, `phone`, `mobile` em `contacts`).

> Nota de modelagem: o contato do Lead é 1:1 e sem identidade própria, então foi modelado como
> colunas inline da raiz `leads` (prefixo `contact_`), e não como tabela filha. A alternativa
> (tabela filha) só se justifica se QA-11 concluir que o Lead pode ter mais de um contato.

### 3.1 Raiz — identidade, empresa e estado (tabela `leads`)

| Campo de negócio | Nome técnico | Tipo físico | Obrig. | Domínio/enumeração | Card. | Observação |
|---|---|---|---|---|---|---|
| ID | `id` | TEXT UUID | sim | — | 1 | PK |
| Razão Social | `company_name` | TEXT | sim | texto | 1 | obrigatória (como `clients.company_name`) |
| Nome Fantasia | `trade_name` | TEXT | sim | texto | 1 | |
| CNPJ | `tax_id` | TEXT | sim | CNPJ 14 pos. (máscara) | 1 | validação de formato; **sem unicidade** (QA-07) |
| Setor de Atuação | `industry_id` | TEXT → ref | sim | lista extensível | 1 | "adicionar opção" no combobox |
| Segmento | `segment_id` | TEXT → ref | sim | lista extensível | 1 | "adicionar opção" |
| Faturamento | `revenue_band` | TEXT | sim | enum fechado (6 faixas) | 1 | §4.1 |
| Nº de Funcionários | `employee_band` | TEXT | sim | enum fechado (5 faixas) | 1 | §4.1 |
| Endereço | `street` | TEXT | sim | texto | 1 | |
| Número | `street_number` | TEXT | sim | texto | 1 | |
| Complemento | `complement` | TEXT | não | texto | 0..1 | opcional (D-01) |
| Bairro | `neighborhood` | TEXT | sim | texto | 1 | obrigatório (D-01); não existe em `clients` hoje |
| Cidade | `city_id` | TEXT → ref | sim | lista extensível (seed 11) | 1 | "adicionar opção" |
| Estado | `state` | TEXT | sim | enum fechado 27 UFs | 1 | fonte omite SP/SE/TO (QA-13) |
| CEP | `postal_code` | TEXT | sim | CEP (máscara) | 1 | |
| País | `country_id` | TEXT → ref | sim | lista extensível (Brasil, México) | 1 | "adicionar opção" |
| Site da Empresa | `website` | TEXT | não | URL | 0..1 | opcional (D-01) |
| Descrição da Empresa | `description` | TEXT | não | texto livre | 0..1 | opcional (D-01) |
| Origem do Lead | `lead_source_id` | TEXT → ref | sim | lista extensível + "Outro" | 1 | |
| Origem do Lead (outro) | `lead_source_other` | TEXT | cond. | texto livre | 0..1 | exigido iff Origem = Outro |

> Escopo de D-01 (confirmado): **Complemento, Site da Empresa e Descrição da Empresa** são
> opcionais. **Bairro permanece obrigatório**, assim como Endereço, Número, Cidade, Estado,
> CEP e País.

### 3.2 Contato do lead (value object inline)

Todo o bloco `contact_*` é **opcional** (D-05). A exigência dos campos de endereço do contato
passa a ser regra de domínio condicional (§6.9), não obrigatoriedade de coluna.

| Campo de negócio | Nome técnico | Tipo físico | Obrig. | Domínio/enumeração | Card. | Observação |
|---|---|---|---|---|---|---|
| Nome do Contato | `contact_first_name` | TEXT | não | texto | 0..1 | |
| Sobrenome | `contact_last_name` | TEXT | não | texto | 0..1 | |
| Endereço = empresa? | `contact_same_address` | INTEGER 0/1 | não | booleano | 0..1 | default sugerido `1`; default não decidido (D-05) |
| Endereço (contato) | `contact_street` | TEXT | não | texto | 0..1 | exigido iff `same_address = 0` e contato capturado (§6.9) |
| Número | `contact_street_number` | TEXT | não | texto | 0..1 | idem |
| Complemento | `contact_complement` | TEXT | não | texto | 0..1 | idem |
| Bairro | `contact_neighborhood` | TEXT | não | texto | 0..1 | idem |
| Cidade | `contact_city_id` | TEXT → ref | não | mesma lista extensível da raiz | 0..1 | idem |
| Estado | `contact_state` | TEXT | não | enum 27 UFs | 0..1 | idem |
| CEP | `contact_postal_code` | TEXT | não | CEP | 0..1 | idem |
| País | `contact_country_id` | TEXT → ref | não | mesma lista extensível da raiz | 0..1 | idem |
| E-mail | `contact_email` | TEXT | não | e-mail (formato) | 0..1 | validação de formato; **sem unicidade** (D-08) |
| Telefone / WhatsApp | `contact_phone` | TEXT | não | telefone (máscara) | 0..1 | 1 campo para telefone/WhatsApp no Lead |
| Cargo | `contact_job_title_id` | TEXT → ref | não | lista extensível (seed 30) | 0..1 | "adicionar opção" |

O contato do Lead **não** mapeia 1:1 para `contacts`: `contacts` hoje não tem colunas de endereço
(será expandido — D-07) nem separa nome/sobrenome (usa `full_name`). Ver §11.

### 3.3 Qualificação comercial (value object inline)

| Campo de negócio | Nome técnico | Tipo físico | Obrig. | Domínio/enumeração | Card. | Observação |
|---|---|---|---|---|---|---|
| Solução desejada | `desired_solution` | TEXT | não | texto livre | 0..1 | opcional (D-06) |
| Dor Identificada | `identified_pain` | TEXT | não | texto livre | 0..1 | opcional (D-06) |
| Prioridade | `priority` | TEXT | não | enum fechado (4) | 0..1 | §4.1 |
| Previsão de Prazo | `expected_timeframe` | TEXT | não | enum fechado (5) | 0..1 | §4.1 |
| Budget | `budget` | TEXT decimal | não | moeda BRL, ≥ 0 | 0..1 | convenção de dinheiro; QA-14 (moeda) |
| BANT — Orçamento | `bant_budget` | TEXT | não | enum fechado (3) | 0..1 | Sim/Não/Em Definição |
| BANT — Decisor | `bant_authority` | TEXT | não | enum fechado (5) | 0..1 | Sim/Influenciador/Usuário/Compras/Outro |
| BANT — Decisor (outro) | `bant_authority_other` | TEXT | cond. | texto livre | 0..1 | exigido iff Decisor = Outro |
| BANT — Necessidade | `bant_need` | TEXT | não | enum fechado (3) | 0..1 | Sim/Parcial/Não |
| BANT — Prazo | `bant_timing` | TEXT | não | enum fechado (3) | 0..1 | Curto/Médio/Longo |

### 3.4 Comunicação (value object inline)

| Campo de negócio | Nome técnico | Tipo físico | Obrig. | Domínio/enumeração | Card. | Observação |
|---|---|---|---|---|---|---|
| Histórico do Contato | `contact_history` | TEXT (longo) | não | texto livre | 0..1 | campo largo com rolagem |
| Tipo de Integração | `communication_type` | TEXT | não | enum fechado (5) | 0..1 | §4.1 |
| Data Próxima Interação | `next_interaction_date` | TEXT YYYY-MM-DD | não | data civil | 0..1 | |
| Hora Próxima Interação | `next_interaction_time` | TEXT HH:MM | não | hora civil | 0..1 | QA-17 |

### 3.5 Estado, conversão e auditoria (colunas transversais da raiz)

| Campo de negócio | Nome técnico | Tipo físico | Obrig. | Domínio/enumeração | Card. | Observação |
|---|---|---|---|---|---|---|
| Status do Lead | `status` | TEXT | sim | enum fechado (6) | 1 | default `Novo`; `Qualificado` só via conversão (§5) |
| Motivo de desqualificação | `disqualification_reason` | TEXT | cond. | enum fechado (7) | 0..1 | exigido iff `Desqualificado` (§6) |
| Oportunidade vinculada | `opportunity_id` | TEXT → `opportunities(id)` | cond. | única | 0..1 | bicondicional com `status = Qualificado` (§6) |
| Convertido em | `converted_at` | TEXT ISO-8601 UTC | cond. | instante | 0..1 | bicondicional com `status = Qualificado` (§6) |
| Ativo | `is_active` | INTEGER 0/1 | sim | booleano, default 1 | 1 | soft delete, convenção do repositório — a fonte não trata desativação de Lead (QA-20) |
| Criado em / Atualizado em | `created_at` / `updated_at` | TEXT ISO-8601 UTC | sim | instante | 1 | auditoria padrão |

---

## 4. Enumerações e listas de referência

Três naturezas distintas, com implicações de modelagem diferentes:

| Natureza | Onde o valor vive | Consequência no modelo |
|---|---|---|
| Enumeração **fechada** | código do domínio (CHECK no banco; constante no código) | só muda com release/migration |
| Lista **extensível** pelo usuário ("adicionar opção") | **tabela de referência** com seed + inserção pelo usuário; campo aponta por FK | usuário pode incluir sem tocar em schema |
| Campo **"Outro"** + texto livre | enum fechada `Outro` **+** coluna texto companheira (`*_other`) | captura o valor digitado quando a opção não cobre |

### 4.1 Enumerações fechadas (valores exatos)

| Enumeração | Valores |
|---|---|
| Faturamento | `Até R$ 10 milhões`, `R$ 10 milhões a R$ 50 milhões`, `R$ 50 milhões a R$ 100 milhões`, `R$ 100 milhões a R$ 500 milhões`, `R$ 500 milhões a R$ 1 bilhão`, `Acima de R$ 1 bilhão` |
| Nº de Funcionários | `1-50`, `51-200`, `201-500`, `501-1.000`, `+1.001` |
| Estado (UF) | `AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SE, SP, TO` (27; ver QA-13) |
| Prioridade | `Baixa`, `Média`, `Alta`, `Urgente` |
| Previsão de Prazo | `Imediato`, `3 meses`, `6 meses`, `12 meses`, `Sem Previsão` |
| BANT — Orçamento | `Sim`, `Não`, `Em Definição` |
| BANT — Decisor | `Sim`, `Influenciador`, `Usuário`, `Compras`, `Outro` |
| BANT — Necessidade | `Sim`, `Parcial`, `Não` |
| BANT — Prazo | `Curto`, `Médio`, `Longo` |
| Status do Lead | `Novo`, `Em contato`, `Qualificando`, `Qualificado`, `Reunião agendada`, `Desqualificado` |
| Motivo de desqualificação | `Orçamento`, `Prazo`, `Sem Resposta`, `Fechado com o Concorrente`, `Optou por Solução Interna`, `Sem Capacidade de Entrega`, `Dados Inválidos` |
| Tipo de Integração | `Ligação`, `E-mail`, `WhatsApp`, `Reunião`, `Demonstração` |

> Nota: a fonte chama o campo de "Tipo de Integração", mas os valores descrevem o **canal da
> próxima interação**, não uma integração de sistema. O nome técnico adotado é
> `communication_type`; se o negócio confirmar que o rótulo é "Tipo de Interação", só o rótulo
> muda (QA-19).

### 4.2 Listas extensíveis pelo usuário (tabela de referência + seed)

| Lista | Seed (valores iniciais) |
|---|---|
| Setor de Atuação | (fonte não fornece seed; tabela começa vazia ou com valores atuais de `clients.industry`) |
| Segmento | (idem) |
| Cidade | `São Paulo, Santo André, São Bernardo do Campo, São Caetano do Sul, Diadema, Belo Horizonte, Canoas, Porto Alegre, Farroupilha, Bento Gonçalves, Itu` |
| País | `Brasil`, `México` |
| Cargo | `CEO (Diretor Presidente), COO (Diretor de Operações), CFO (Diretor Financeiro), CIO (Diretor de TI), CTO (Diretor de Tecnologia), CISO (Diretor de Segurança da Informação), Gerente Geral, Gerente de TI, Gerente de Infraestrutura, Gerente de Sistemas, Gerente de Segurança da Informação, Gerente de Projetos, Gerente Financeiro, Gerente de Compras, Gerente de RH, Gerente Comercial, Gerente de Marketing, Gerente de Operações, Coordenador de TI, Coordenador de Projetos, Coordenador Financeiro, Coordenador de Compras, Coordenador de RH, Arquiteto de Soluções, Analista de Infraestrutura, Analista de Segurança da Informação, Analista Financeiro, Analista de Compras, Analista de RH, Analista de Dados` |
| Origem do Lead | `Site, LinkedIn, Indicação de Funcionário, Indicação de Clientes, Indicação de Fornecedor, Indicação Microsoft, Evento, Webinar, Google Ads, Parceiro, Outbound, E-mail Marketing, Outro` |

### 4.3 Campos "Outro" com texto livre

| Campo | Coluna da opção | Coluna de texto companheira | Regra |
|---|---|---|---|
| Origem do Lead | `lead_source_id = Outro` | `lead_source_other` | exigida iff Origem = Outro |
| BANT — Decisor | `bant_authority = Outro` | `bant_authority_other` | exigida iff Decisor = Outro |

**Campos que podem ser vários (coleções).** A fonte pede multivalor em `Principais
Concorrentes`, `Áreas de Interesse` (contato) e `Áreas de Oportunidade` (empresa). Nenhum deles
pertence ao formulário de Lead: são da ficha de Contato/Empresa preenchida **depois** da
conversão. Por isso entram como coleção (tabela de ligação N:N para listas de referência, ou
linhas-filhas para concorrentes livres) **nos agregados `contacts`/`clients`**, não no `leads`.
Modelar como coleção — e não como string separada por vírgula — porque preserva integridade por
item, permite filtro/contagem e evita ambiguidade de parsing. Ver §11 (deltas).

---

## 5. Máquina de estados do Lead

Estados: `Novo`, `Em contato`, `Qualificando`, `Qualificado`, `Reunião agendada`,
`Desqualificado`.

- **Estado inicial:** `Novo` (quando o Lead é criado).
- **`Qualificado` não é um status manual.** É consequência da conversão bem-sucedida (D-04);
  essa decisão substitui a fonte, que descrevia "alterado manualmente". Não existe transição
  manual para `Qualificado`.
- **Estados terminais:** `Qualificado` (após conversão) e `Desqualificado` (com motivo). Nenhum
  deles aceita transição de saída.
- **Demais transições:** manuais (o usuário altera o status). Não há transição automática por
  data.

Tabela de transições **manuais** (não inclui `Qualificado`, alcançado apenas por conversão):

| De → Para | Permitida | Gatilho | Guarda/efeito |
|---|---|---|---|
| Novo → Em contato | sim | manual | — |
| Novo → Qualificando | sim | manual | — |
| Novo → Reunião agendada | sim | manual | — |
| Novo → Desqualificado | sim | manual | exige motivo |
| Em contato → Qualificando | sim | manual | — |
| Em contato → Reunião agendada | sim | manual | — |
| Em contato → Novo | sim | manual | (voltar) |
| Em contato → Desqualificado | sim | manual | exige motivo |
| Qualificando → Em contato | sim | manual | — |
| Qualificando → Reunião agendada | sim | manual | — |
| Qualificando → Desqualificado | sim | manual | exige motivo |
| Reunião agendada → Em contato | sim | manual | — |
| Reunião agendada → Qualificando | sim | manual | — |
| Reunião agendada → Desqualificado | sim | manual | exige motivo |
| Qualificado → * | **não** | — | terminal (imutável) |
| Desqualificado → * | **não** | — | terminal |

**Conversão (efeito, não status manual).** A ação "Criar Oportunidade" dispara a conversão
(§7). No sucesso, o Lead **muda para `Qualificado`** na mesma transação e `opportunity_id`/
`converted_at` são gravados. Desistir ou cancelar mantém o status anterior inalterado (D-02).
A conversão só pode ser disparada de `Em contato` ou `Qualificando` (D-09). Consequência: um
Lead em `Reunião agendada` precisa voltar a `Qualificando` ou `Em contato` antes de converter;
um Lead `Novo` precisa avançar ao menos até `Em contato`.

**Não definido pelo requisito (registrar como QA, não decidir em silêncio):**

| Caso em aberto | QA |
|---|---|
| Voltar de `Desqualificado` (reabrir Lead)? | QA-05 |

---

## 6. Invariantes e regras de validação de domínio

Regras no nível do domínio (não de UI), expressas de forma testável:

1. `status` é sempre um dos 6 valores; `Novo` é o estado inicial.
2. `Desqualificado` **exige** `disqualification_reason`; qualquer outro status **proíbe**
   `disqualification_reason` (espelha o par `status`/`loss_reason` de `opportunities`).
3. **Bicondicional de conversão:** `status = Qualificado` **se e somente se**
   `opportunity_id IS NOT NULL` e `converted_at IS NOT NULL`.
4. `Qualificado` é terminal e imutável: uma vez alcançado, `status`, `opportunity_id` e
   `converted_at` não podem mais ser alterados (conversão idempotente).
5. **Atomicidade:** a conversão cria empresa + contato + oportunidade e grava `Qualificado`,
   `converted_at` e `opportunity_id` na mesma transação. Falha ou cancelamento ⇒ zero linhas
   criadas e zero alterações (nem status, nem `converted_at`, nem `opportunity_id`).
6. `budget` ≥ 0 quando presente (espelha `opportunity_nonnegative_values`).
7. `tax_id` deve ter CNPJ válido no formato (14 posições, dígitos verificadores) quando
   presente — **sem** unicidade (QA-07).
8. `contact_email`, quando presente, deve ter formato de e-mail válido — **sem** unicidade
   (D-08).
9. Se `contact_same_address = 0` e o contato estiver sendo capturado, os campos de endereço do
   contato são exigidos; se `= 1` ou sem contato, ficam vazios. Default de `contact_same_address`
   sugerido `1`, ainda não decidido (D-05).
10. `lead_source_other` é exigido **se e somente se** `lead_source_id = Outro`; vazio caso
    contrário. Idem para `bant_authority_other` com `bant_authority = Outro`.
11. `next_interaction_time` (HH:MM) é válido quando presente; `next_interaction_date` é data
    civil válida (`YYYY-MM-DD`, round-trip), sem conversão de fuso.
12. `company_name` é obrigatório e não pode ser vazio (mesmo contrato de `clients`).
13. Contato é opcional para persistir o Lead (D-05), **mas** a conversão exige
    `contact_first_name` não vazio e `contact_email` válido, porque `contacts.full_name` é
    NOT NULL (D-10). Sobrenome continua opcional; `full_name` é composto com o que houver.
14. A conversão só é permitida quando `status` é `Em contato` ou `Qualificando` (D-09).

---

## 7. Conversão do Lead — contrato de fronteira

A conversão acontece quando o usuário dispara "Criar Oportunidade" e confirma o cadastro. É
**atômica** e **tudo ou nada** (D-02).

**Pré-condições (D-09, D-10):** o Lead deve estar em `Em contato` ou `Qualificando`; e
`contact_first_name` não vazio e `contact_email` válido devem estar preenchidos. O Lead pode
ter sido salvo sem contato (D-05), mas não pode ser convertido sem esses dois campos.

**Ordem efetiva da transação:** empresa → contato → oportunidade, para respeitar as FKs de
`opportunities` (`client_id` + `contact_id` obrigatórios). A tela pode apresentar o cadastro da
oportunidade primeiro, mas a persistência materializa empresa e contato antes de criar a
oportunidade.

| Passo | O que é criado/atualizado | Fonte |
|---|---|---|
| 1 | `clients` (empresa) | snapshot da Empresa do Lead (§3.1) |
| 2 | `contacts` (contato) | snapshot do Contato do Lead (§3.2) |
| 3 | `opportunities` | dados da qualificação levados (§3.3/§3.4) |
| 4 | promoção do Lead | `status = Qualificado` + `opportunity_id` + `converted_at` |

| Destino | Fonte (Lead) → campo de destino |
|---|---|
| `clients` | `company_name` → `company_name`; `trade_name` → `trade_name`; `tax_id` → `tax_id`; `industry_id` → `industry`; `segment_id` → (coluna nova `segment` — §11); `revenue_band` → (nova); `employee_band` → (nova); `street`/`street_number`/`complement`/`neighborhood`/`city_id`/`state`/`postal_code`/`country_id` → endereço; `website` → `website`; `description` → `notes` (ou nova `description`); `lead_source_id` → (nova `lead_source`) |
| `contacts` | `contact_first_name` + `contact_last_name` → `full_name` (composição; QA-10); `contact_job_title_id` → `job_title` (nome resolvido em `job_titles`); `contact_email` → `email`; `contact_phone` → `phone` (e/ou `mobile`); endereço do contato → colunas novas de endereço em `contacts` (D-07, ainda não implementado) |
| `opportunities` | `desired_solution` → `offered_solution`; `identified_pain` → `customer_need`; `budget` → `budget`/`value` (a confirmar); Comunicação → parcial (QA-08) |

**O que permanece exclusivo do Lead (não é copiado):** `priority`, `expected_timeframe`, o
bloco BANT completo, `disqualification_reason`, `contact_history` e a maior parte da
Comunicação. Esses dados descrevem a **qualificação**, não a conta.

**Atomicidade e tudo ou nada.** Empresa + contato + oportunidade + promoção do Lead
(`Qualificado` + `opportunity_id` + `converted_at`) ocorrem na **mesma transação**, com rollback
total em qualquer falha. Se o usuário desistir ("não" ou cancelar o cadastro da oportunidade),
**nada** é persistido: nem empresa, nem contato, nem oportunidade, nem mudança de status (D-02).

**Idempotência.** Um Lead converte **no máximo uma vez**: `Qualificado` é terminal (imutável) e
`opportunity_id` é único. Nova tentativa em Lead já `Qualificado` é rejeitada.

**Não existe outro caminho para `Qualificado`.** O único meio de o Lead chegar a `Qualificado` é
a conversão bem-sucedida (D-03, D-04). Não há status manual "Qualificado".

**Depois da conversão.** O Lead permanece `Qualificado` (sem estado "Convertido" — D-03) e
continua existindo como histórico da qualificação, referenciando a oportunidade. Se ficar
readonly/arquivado na listagem é decisão de produto, não de domínio.

**Nota histórica.** A fonte descrevia a criação da oportunidade antes de empresa/contato e
tratava `Qualificado` como status manual. Essas duas premissas foram substituídas pelas decisões
D-02 e D-04.

---

## 8. Convenções transversais

| Tema | Convenção aplicada ao Lead |
|---|---|
| Datas civis vs instantes | `next_interaction_date` (e `next_interaction_time` como hora civil) são civis, sem fuso; `created_at`, `updated_at`, `converted_at` são instantes ISO-8601 UTC |
| Moeda/dinheiro | `budget` é `TEXT` decimal canônico (ex.: `"1234.56"`), BRL; sem float |
| Booleanos | `contact_same_address`, `is_active` são `INTEGER` 0/1 |
| IDs | `id` é UUID `TEXT` gerado pela aplicação; FKs `TEXT` |
| Ativo/inativo | soft delete por `is_active` (Lead desativado não é deletado); `Desqualificado` **não** é `is_active = 0` — são conceitos distintos |
| Auditoria | `created_at`/`updated_at` em toda raiz, atualizados pela aplicação |
| Enumeração fechada | CHECK no banco + constantes no código; mudança exige migration |
| Lista extensível | tabela de referência + seed; usuário insere sem migration |
| Validação | no domínio/API, não só na UI; mensagens seguem `docs/padrao-visual.md` |

---

## 9. Dados pessoais e LGPD

Classificação dos campos do Lead (sem inventar base legal):

**Dado pessoal (identifica/relaciona a pessoa física):** `contact_first_name`,
`contact_last_name`, `contact_email`, `contact_phone`, `contact_job_title` (cargo), e o
endereço do contato quando preenchido (`contact_street` etc.). Também `contact_history` e
`lead_source_other`/`bant_authority_other` podem conter dado pessoal por serem texto livre.

**Dado pessoal indireto (PF) vs dado empresarial (PJ):** CNPJ, Razão Social, Nome Fantasia,
faturamento, nº de funcionários, segmento/setor e o endereço **da empresa** são dados da pessoa
jurídica — não são dado pessoal, mas o endereço/site podem eventualmente identificar pessoas
(sobretudo em empresas de pequeno porte/titular único).

**Sensível ao negócio (não é dado pessoal, mas é confidencial):** BANT (orçamento, autoridade,
necessidade, timing), `budget`, `desired_solution`, `identified_pain`, prioridade, prazo e o
motivo de desqualificação. Riscos comerciais se vazarem.

**Riscos a mitigar:** não expor contato/histórico do Lead em mensagens de erro, logs ou respostas
de API desnecessárias; manter dados no banco local; minimizar o que é copiado entre Lead e
oportunidade (copiar só o necessário à §7); considerar que "Dados Inválidos" como motivo de
desqualificação não exige guardar o dado inválido para provar o motivo. A decisão D-07 (expandir
`contacts` com endereço) **amplia a superfície de dado pessoal persistido**: o endereço do
contato passa a ser copiado para `contacts` na conversão e deve entrar na minimização/retensão,
não apenas no Lead. A definição de base legal (consentimento/legítimo interesse) é externa a
este documento.

---

## 10. Decisões e questões abertas

### 10.1 Decisões tomadas (23/11/2026)

| # | Decisão | QAs resolvidas | Consequência no modelo |
|---|---|---|---|
| D-01 | Complemento, Site da Empresa e Descrição da Empresa são **opcionais**; Bairro permanece **obrigatório** | QA-01 | §3.1: Complemento/Site/Descrição nullable; Bairro segue obrigatório junto com Endereço, Número, Cidade, Estado, CEP e País |
| D-02 | Conversão **atômica**, ordem empresa → contato → oportunidade; cancelar/desistir não persiste **nada** | QA-02, QA-04 | §7: tudo ou nada; desistir mantém o status anterior inalterado |
| D-03 | Após converter, o Lead permanece `Qualificado` (sem estado "Convertido") | QA-03 | §5, §6: `Qualificado` + `converted_at`/`opportunity_id` preenchidos |
| D-04 | `Qualificado` deixa de ser status manual e passa a ser **consequência da conversão** bem-sucedida | QA-02 (status), QA-04 (status), QA-15 | §5, §6: máquina de estados invertida; `Qualificado` terminal e só alcançável pela conversão |
| D-05 | Bloco `contact_*` inteiro é **opcional** no Lead | QA-16 | §3.2: todos nullable; `contact_same_address` default sugerido `1`, não decidido |
| D-06 | Qualificação Comercial e Comunicação são **opcionais** | QA-18 | §3.3, §3.4: todos nullable |
| D-07 | `contacts` será **expandido** com endereço | QA-09 | §11.2: colunas novas de endereço em `contacts` (decidido, ainda não implementado) |
| D-08 | Sem `UNIQUE` em e-mail; validar formato e, no máximo, avisar duplicidade na consulta/UI | QA-06 | §6.8: `contact_email` sem unicidade |
| D-09 | A conversão pode ser disparada de `Em contato` e `Qualificando` | QA-21 | §5, §6.14: guarda de estado `status IN ('Em contato','Qualificando')` |
| D-10 | A conversão exige `contact_first_name` e `contact_email` válido, ainda que o Lead possa ser salvo sem contato | QA-22 | §6.13, §7: pré-condição da transação; sobrenome opcional na composição de `full_name` |

### 10.2 Questões abertas

| # | Pergunta | Por que importa | Recomendação | Classificação | Se a resposta for outra |
|---|---|---|---|---|---|
| QA-05 | É possível voltar de `Desqualificado` (reabrir um Lead desqualificado)? | Define terminalidade e validações | Manter `Desqualificado` terminal; reabertura só via novo Lead | Não bloqueia (validação de aplicação) | Se permitir reabrir, remover terminalidade e decidir se o motivo é limpo |
| QA-07 | CNPJ do Lead deve ser único? | AGENTS.md proíbe inventar unicidade | **Não**; apenas validar formato | Não bloqueia | Se único, verificar duplicados existentes antes do índice |
| QA-08 | Como a Comunicação do Lead é levada à oportunidade ("se possível")? `Tipo de Integração` não mapeia 1:1 para `tasks.contact_type` | Afeta o que é copiado e onde | Copiar `contact_history` para `notes` da oportunidade; `Data/Hora Próxima Interação` geram tarefa (`compromisso`) quando houver; não forçar o mapeamento de tipo | Não bloqueia (default: copiar histórico para `notes`; tipo de interação fica no Lead) | Se não levar nada, a Comunicação permanece exclusiva do Lead |
| QA-10 | Lead pede Nome/Sobrenome separados; `contacts` usa `full_name` | Define a composição na conversão | Compor `full_name = contact_first_name + " " + contact_last_name`; se o CRM evoluir para Nome/Sobrenome, reavaliar `contacts` | Não bloqueia | Se separar em `contacts`, migration e migração de dados |
| QA-11 | O Lead tem exatamente um contato, ou pode ter vários? (contato agora é opcional) | Afeta a cardinalidade do value object e a conversão | Exatamente um quando houver (a fonte só descreve um) | Não bloqueia | Se N contatos, modelo passa a tabela filha e a conversão cria N linhas |
| QA-12 | "Origem do Lead" e "Origem do Contato" usam a mesma lista — é a mesma tabela de referência? | Evita duas listas duplicadas | Compartilhar uma lista de origem entre Lead e Contato | Não bloqueia | Se distintas, duas tabelas de referência |
| QA-13 | A lista de UFs da fonte omite SP, SE e TO (lista com 24); a ficha de Empresa diz "27 UFs" | Define o enum de `state` | Usar as 27 UFs oficiais (incluir SP, SE, TO) | Não bloqueia (correção óbvia) | Se mantiver a lista literal, usuários de SP/SE/TO não conseguem cadastrar |
| QA-14 | Budget do Lead é sempre BRL ou reusa o enum de moedas (`BRL/USD/EUR/PES`)? | Afeta o tipo de `budget` | BRL fixo no Lead (a fonte diz "moeda BRL") | Não bloqueia | Se multimoeda, adicionar `budget_currency` como em `opportunities` |
| QA-17 | "Hora da Próxima Interação" é hora civil (HH:MM) sem fuso? A "próxima interação" pode ser data passada? | Define tipo e validação | Hora civil `HH:MM`; data pode ser hoje ou futura (é agenda, não histórico) | Não bloqueia | Se exigir instante, armazenar ISO-8601 com fuso |
| QA-19 | "Tipo de Integração" é o canal da próxima interação (Ligação/E-mail/WhatsApp/Reunião/Demonstração) ou uma integração de sistema? | O rótulo sugere integração, mas os valores são canais de contato | Tratar como canal da próxima interação; rótulo "Tipo de Interação" | Não bloqueia | Se for integração de sistema, é outro conceito e outro campo |
| QA-20 | O Lead tem desativação (soft delete) como `clients`/`contacts`, ou só sai de cena por `Desqualificado`? | Define `is_active` e o filtro padrão das listagens | Manter `is_active` por consistência com o repositório, com `Desqualificado` como estado de negócio distinto | Não bloqueia | Se não houver desativação, remover `is_active` e ajustar listagem/filtros |

---

## 11. Deltas em relação ao modelo atual (clients/contacts)

### 11.1 Campos do formulário (Empresa) que **não existem** hoje em `clients`

| Campo (fonte) | Situação em `clients` | Impacto |
|---|---|---|
| Segmento | não existe (só `industry` = Setor) | coluna nova `segment` + tabela de referência |
| Faturamento (faixas) | não existe | coluna nova + enum fechado |
| Nº de Funcionários (faixas) | não existe | coluna nova + enum fechado |
| Bairro | não existe (`street`, `street_number`, `complement`, `city`, `state`, `postal_code`, `country` existem; `neighborhood` não) | coluna nova `neighborhood` |
| Matriz/Filial | não existe | coluna nova (fora do Lead, pós-conversão) |
| Pertence a Grupo + nome do Grupo | não existe | colunas novas (fora do Lead) |
| Porte da Empresa | não existe | coluna nova (fora do Lead) |
| Tipo de Conta | não existe | coluna nova (fora do Lead) |
| Status (Inativa/Ativa) | mapeia para `is_active` (0/1) | reuso, sem coluna nova |
| Origem do Lead | não existe | coluna nova `lead_source` + tabela de referência |
| Dados de Faturamento (contato, e-mail, moeda, telefone, condição, inadimplência) | não existe | colunas novas (fora do Lead) |
| Ambiente Tecnológico | não existe | coleção nova (fora do Lead) |
| Principais Concorrentes | não existe | coleção nova (fora do Lead) |
| Maturidade Digital | não existe | coluna nova (fora do Lead) |
| Áreas de Oportunidade | não existe | coleção nova (fora do Lead) |
| Contrato (data, vigência) | não existe | colunas novas (fora do Lead) |

### 11.2 Campos do formulário (Contato) que **não existem** hoje em `contacts`

| Campo (fonte) | Situação em `contacts` | Impacto |
|---|---|---|
| Nome + Sobrenome separados | existe `full_name` único | colisão (QA-10) |
| Departamento | não existe | coluna nova |
| E-mail corporativo (com duplicidade) | existe `email` (sem unicidade) | colisão de regra — decidido sem UNIQUE (D-08) |
| Telefone fixo / Celular/WhatsApp | existem `phone` e `mobile` | reuso |
| Endereço completo do contato | **não existe** (nenhuma coluna de endereço) | colunas novas — decidido (D-07), não implementado |
| Idioma preferencial | não existe | coluna nova |
| Papel no processo de compra | não existe | coluna nova (enum) |
| Nível de relacionamento | não existe | coluna nova (enum) |
| Posição em relação à Reply | não existe | coluna nova (enum) |
| Reporta a | não existe | coluna nova (autorreferência) |
| Áreas de interesse | não existe | coleção nova |
| Origem do Contato | não existe | coluna nova + tabela de referência (QA-12) |
| Status (Ativo/Inativo/Saiu da Empresa/Não Contatar) | existe `is_active` (booleano, 2 estados) | colisão: 4 estados vs booleano |
| Data da Última Interação | não existe | coluna nova (automática) |
| Empresa Relacionada | existe `client_id` | reuso |

### 11.3 Colisões e duplicações conceituais

| Colisão | Detalhe |
|---|---|
| `full_name` vs Nome/Sobrenome | `contacts` guarda um único campo; a fonte quer dois (Lead e Contato) |
| `is_active` (0/1) vs Status do Contato (4 estados) | a ficha de contato quer 4 estados; hoje só há ativo/inativo |
| `industry` (Setor) vs `segment` (Segmento) | dois campos que o usuário enxerga como distintos mas próximos; manter separados por tabela de referência |
| Origem do Lead vs Origem do Contato | mesma lista de valores em dois lugares (QA-12) |
| `phone`/`email` da empresa vs `contact_phone`/`contact_email` | hoje `clients` tem `phone`/`email` próprios; o Lead separa empresa e contato, e a conversão precisa decidir para onde cada um vai |
| `notes` vs `description` vs `contact_history` | três textos longos com papéis diferentes (descrição da empresa, observações da conta, histórico do contato) que não devem ser a mesma coluna |

---

## Referências citadas

- `database/init.sql` — tabelas `clients`, `contacts`, `opportunities`, `tasks`, `events` e convenções (IDs UUID, booleanos 0/1, moeda/horas TEXT decimal, datas civis vs instantes, CHECKs de `opportunities`).
- `src/lib/repositories/contracts.ts` — contratos atuais de `ClientsRepository`, `ContactsRepository`, `OpportunitiesRepository` (base para o contrato futuro de `LeadsRepository`).
- `database/migrations/README.md` — convenção append-only, sincronia `init.sql` ↔ migration, marcador `@applied-if`.
- `AGENTS.md` — regras de domínio, proibição de inventar unicidade/obrigatoriedade, transação, LGPD.
- `src/lib/cnpj.ts` / `src/lib/email.ts` — validação de formato existente (sem unicidade).
- `docs/plano-historico-eventos.md` — tom e nível de detalhe de documento do projeto.
