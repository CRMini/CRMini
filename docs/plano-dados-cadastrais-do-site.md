# Plano: dados cadastrais da empresa a partir do site

Status: implementado em 2026-11-01; aguardando validação do usuário.

## 1. Contexto e problema

O cadastro de cliente (`src/components/client-form.tsx`) hoje exige digitação manual de
todos os dados da empresa — nome, CNPJ, telefone, e-mail e endereço — embora muitos
deles estejam publicados no site da própria empresa. O formulário já possui um
recurso relacionado: o botão "Buscar logo do site", que chama
`POST /api/logo/from-site` (`src/app/api/logo/from-site/route.ts`) e extrai candidatos
de logo via `extractIconUrls` (`src/lib/site-logo.ts`).

| Item               | Como é resolvido hoje                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Logo do site       | `POST /api/logo/from-site` → `toPublicTarget` + `fetchGuarded` → `extractIconUrls` → `saveLogo` |
| Endereço           | `GET /api/cep` (ViaCEP) preenche logradouro/cidade/estado a partir do CEP digitado              |
| Demais campos      | digitação manual, um a um                                                                       |
| Dados estruturados | **não aproveitados** (JSON-LD/OpenGraph/microdata do site são ignorados)                        |

Esta feature reaproveita o pipeline do logo para, a partir do site informado, **sugerir**
os dados cadastrais (razão social, nome fantasia, CNPJ, telefone, e-mail e endereço),
sempre com revisão campo a campo pelo usuário antes de aplicar.

## 2. Decisão recomendada

**Reusar o transporte já auditado do logo (`safe-http` + `safe-url`) e acrescentar um
módulo puro de extração (`src/lib/company-profile.ts`) que lê dados estruturados e texto
visível da home do site**, sem tocar no schema, sem migração e sem dependência nova.

A extração é dividida em duas camadas, como no logo:

1. **Rota** `POST /api/company/from-site` — busca a home do site (mesmas guardas de
   SSRF, prazo e teto de página do logo) e devolve o resultado estruturado.
2. **Módulo puro** `src/lib/company-profile.ts` — transforma o HTML em campos com
   `value`, `source` e `confidence`, sem I/O (testável com HTML literal).

A UI exibe uma **prévia revisável campo a campo**: cada valor encontrado tem um
checkbox e a indicação da origem; por padrão só os campos vazios do formulário vêm
marcados; nada é aplicado sem clicar em "Aplicar dados".

## 3. Propriedades do desenho (restrições fixas)

- **Sem migration e sem mudança de schema.** Os dados entram nas colunas já existentes
  de `clients` (`database/init.sql:30-51`): `company_name`, `trade_name`, `tax_id`,
  `phone`, `email`, `postal_code`, `street`, `street_number`, `complement`, `city`,
  `state`, `country`. A gravação continua pelo POST/PUT de
  `src/app/api/clients/route.ts` (que exige apenas `company_name`); a feature não cria
  nem altera colunas.
- **Sem dependência nova.** Sem cheerio/jsdom/parser HTML. Assim como `site-logo.ts`,
  a leitura é tolerante por regex/replace. Justificativa: o alvo é extrair um conjunto
  pequeno e conhecido de atributos (tags `<script type="application/ld+json">`,
  `<meta>`, `tel:`/`mailto:`, `itemprop` e um CNPJ/telefone no texto). Um parser DOM
  completo traria um custo de bundle e uma superfície de segurança maiores para nenhum
  ganho real; o módulo fica puro e testável com HTML literal, no mesmo estilo do logo.
- **Somente a home.** Nenhum crawl e nenhuma página de contato na v1 (ver §6).
- **Nenhum dado é salvo automaticamente.** O servidor não grava nada; a aplicação só
  muda o formulário local após o usuário marcar e confirmar.

## 4. Contratos

### 4.1 Novo módulo puro `src/lib/company-profile.ts`

Tipos e assinaturas:

```ts
export type FieldSource =
  "json-ld" | "opengraph" | "microdata" | "links" | "text";
export type Confidence = "high" | "medium" | "low";

export type CompanyField = {
  value: string; // já formatado para exibição (máscara aplicada)
  source: FieldSource;
  confidence: Confidence;
};

// Chaves = colunas reais de `clients` preenchíveis por esta feature.
export type ClientFieldKey =
  | "company_name"
  | "trade_name"
  | "tax_id"
  | "phone"
  | "email"
  | "postal_code"
  | "street"
  | "street_number"
  | "city"
  | "state"
  | "country";

export const COMPANY_PROFILE_FIELDS: readonly ClientFieldKey[]; // lista canônica

export type CompanyProfile = {
  fields: Partial<Record<ClientFieldKey, CompanyField>>;
};

export function extractCompanyProfile(
  html: string,
  baseUrl: string,
): CompanyProfile;
```

Regras de contrato do módulo:

- **Puro e determinístico**: não lê rede, disco nem ambiente; apenas `html` + `baseUrl`.
- `baseUrl` inválida → devolve `{ fields: {} }` (como `extractIconUrls` devolve `[]`).
- **Precedência por campo**: a primeira fonte válida vence; uma fonte de confiança
  menor **não** sobrescreve um valor já extraído de fonte melhor. Ordem de tentativa:
  JSON-LD > OpenGraph/meta > microdata > links (`tel:`/`mailto:`) > texto visível.
- **Decodifica entidades** HTML básicas (`&amp;`, `&quot;`, `&#39;`, `&lt;`, `&gt;`) e
  **trim** nos valores. Valores vazios após limpeza são descartados.
- Campos que não passarem na validação (CNPJ inválido, e-mail de terceiros, telefone
  sem DDD etc.) são **descartados**, nunca devolvidos.
- O módulo **não infere** `industry`/segmento, `notes`, `contacts` nem `logo_path`
  (ver §5).

> O módulo precisa de três helpers hoje privados em `src/lib/site-logo.ts`
> (`decodeEntities`, `readAttributes`, `resolveUrl`). Decisão: **duplicar** esses
> helpers pequenos dentro de `company-profile.ts` em vez de refatorar `site-logo.ts`
> (mudança local e sem risco, conforme AGENTS.md). Uma eventual extração para
> `src/lib/html-tags.ts` fica registrada como melhoria futura, não neste plano.

### 4.2 Novo utilitário puro `src/lib/cnpj.ts`

```ts
export function normalizeCnpj(value: string | null | undefined): string;
// remove separadores, converte para maiúsculas; só [0-9A-Z]
export function isValidCnpj(value: string | null | undefined): boolean;
// true apenas para 14 caracteres válidos com dígitos verificadores corretos
```

Validação (formato alfanumérico já suportado por `formatCnpj`):

- Exatamente 14 caracteres após normalizar; as 12 primeiras posições aceitam
  `[0-9A-Z]` e as 2 últimas são dígitos.
- Cada posição tem valor `código ASCII do caractere − 48`: dígito `'0'–'9'` → `0–9`;
  letra `'A'–'Z'` → `17–42` (A=17, B=18, …, Z=42), conforme a IN RFB nº 2.229/2024.
  **Atenção:** não usar `A=10` (mapeamento alfabético comum) — o valor oficial é o
  ASCII−48, senão todo CNPJ com letra é rejeitado.
- Vetor oficial de teste: `12.ABC.345/01DE-35` (1º DV 3, 2º DV 5); o mesmo cálculo
  reproduz os CNPJs numéricos atuais.
- **1º dígito verificador**: soma das 12 primeiras posições com pesos
  `[5,4,3,2,9,8,7,6,5,4,3,2]`; resto `= soma % 11`; DV `= resto < 2 ? 0 : 11 - resto`.
- **2º dígito verificador**: soma das 13 primeiras posições com pesos
  `[6,5,4,3,2,9,8,7,6,5,4,3,2]`; mesma regra de resto.
- O CNPJ só é aceito se os dois DVs baterem; caso contrário é **descartado**.
- CNPJs com os 14 caracteres idênticos (ex.: `00000000000000`) são rejeitados, pois
  sites usam esse valor como placeholder.

### 4.3 Nova rota `src/app/api/company/from-site/route.ts`

```ts
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse>;
```

- Corpo: `{ website: string }` (JSON). Ausente/inválido → 400
  `"Informe o site da empresa."` (mesma voz do logo).
- Reusa de `@/lib/safe-url`: `toPublicTarget` (valida esquema/porta/credenciais antes
  de qualquer I/O).
- Reusa de `@/lib/safe-http`: `startDeadline`, `fetchGuarded`, `exceedsDeclaredSize`,
  `readLimitedBody`, `discardBody` e as classes de erro (`InvalidTargetError`,
  `BlockedAddressError`, `DeadlineExceededError`).
- Constantes (espelhando o logo): `totalTimeoutMs = 20000`,
  `maxPageBytes = 512 * 1024`, `userAgent = "CRMini-CompanyProfile/1.0"`,
  `accept = "text/html,application/xhtml+xml"`. Deadline global e teto de página
  **idênticos** ao logo: o custo dominante é o mesmo (uma página), então não há
  justificativa para limites diferentes. Só o `User-Agent` difere, para não confundir
  tráfego/cache das duas features (segue o mesmo padrão `CRMini-*/1.0`).
- Fluxo: `fetchGuarded(target)` → `response.ok` senão descarta corpo e falha →
  `exceedsDeclaredSize`/`readLimitedBody` com 512 KB → `extractCompanyProfile(html,
url.href)` → monta a resposta.
- Resposta **200**:

```ts
{
  source_url: string;                                              // URL final da home
  fields: Partial<Record<ClientFieldKey, CompanyField>>;           // só os encontrados
  missing: ClientFieldKey[];                                       // canônicos ausentes
}
```

- **404** quando `fields` vier vazio: `"Nenhum dado cadastral encontrado no site."`
- **400** para destino inválido `"Site inválido. Use um endereço http(s) público."`
  e para endereço bloqueado `"Esse endereço não pode ser consultado."`
- **502** para site inacessível/timeout/status de erro:
  `"Não foi possível acessar o site. Verifique o endereço ou sua conexão."`
- `console.error("Failed to fetch company profile", error)` no catch, **sem logar HTML
  nem dados extraídos** (mesmo padrão do logo, que loga só o erro).

### 4.4 Arquivos afetados

| Arquivo                                         | Mudança                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/company-profile.ts` (novo)             | módulo puro de extração (§4.1, §5)                                         |
| `src/lib/cnpj.ts` (novo)                        | validação de CNPJ alfanumérico (§4.2)                                      |
| `src/app/api/company/from-site/route.ts` (novo) | rota POST (§4.3, §6)                                                       |
| `src/components/client-form.tsx`                | botão "Buscar dados do site", painel de prévia revisável e estados (§7)    |
| `src/app/globals.css`                           | classes do painel de prévia, escopadas por `main.records-page` (§7)        |
| `docs/padrao-visual.md`                         | tabela §13 e checklist §15, se o painel virar componente visual novo (§11) |
| `README.md`                                     | linha "Formulários", descrição da busca e estrutura de rotas (§11)         |

## 5. Regras de extração por campo

Prioridade das fontes por campo. `confidence` reflete a confiabilidade da **origem**,
não do valor.

| Campo           | Origem (ordem) e regra                                                                                                                                                                                                                                                                                                                                                                                                                        | `confidence` por fonte                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `company_name`  | 1. JSON-LD `Organization`/`LocalBusiness`/`Corporation`/`NGO`: `legalName` ou `name`; 2. OpenGraph `og:site_name`; 3. microdata `itemprop="name"` dentro de `itemtype*Organization`.                                                                                                                                                                                                                                                          | json-ld `high`; microdata `medium`; opengraph `medium` |
| `trade_name`    | 1. JSON-LD `alternateName` (primeiro não vazio). Não há equivalente confiável em OG/microdata.                                                                                                                                                                                                                                                                                                                                                | json-ld `medium`                                       |
| `tax_id`        | 1. JSON-LD `taxID` / `vatID` / `identifier` (quando casar com CNPJ); 2. texto: regex de CNPJ no HTML visível. Sempre passa por `isValidCnpj`; valor inválido é descartado. Aplicado `formatCnpj` ao sair.                                                                                                                                                                                                                                     | json-ld `high`; texto (validado) `medium`              |
| `phone`         | 1. JSON-LD `telephone`; 2. microdata `itemprop="telephone"`; 3. links `href^=tel:`; 4. texto: regex de telefone com DDD (2 dígitos + 8–9 dígitos), varrendo o HTML **sem tags** (atributos não são fonte). Descarta `0800`, `3003`, números sem DDD e assinante todo zero; o prefixo internacional `+55` é removido antes da validação e o ramal é descartado **mantendo o número principal**. Normalizado com o utilitário existente (§5.1). | json-ld `high`; microdata/links `medium`; texto `low`  |
| `email`         | 1. JSON-LD `email`; 2. microdata `itemprop="email"`; 3. links `href^=mailto:`. Preferir valores do domínio do site; descartar terceiros e exemplos (§5.1).                                                                                                                                                                                                                                                                                    | json-ld `high`; microdata/links `medium`               |
| `postal_code`   | 1. JSON-LD `address.postalCode`; 2. microdata `itemprop="postalCode"`. Exigir 8 dígitos (ou `NNNNN-NNN`); aplicar `formatCep`.                                                                                                                                                                                                                                                                                                                | json-ld `high`; microdata `medium`                     |
| `street`        | 1. JSON-LD `address.streetAddress`; 2. microdata `itemprop="streetAddress"`. Texto livre com split de número heurístico (§5.2).                                                                                                                                                                                                                                                                                                               | json-ld/microdata `medium` (split heurístico)          |
| `street_number` | Derivado do `streetAddress` pela heurística §5.2. Nunca extraído isoladamente.                                                                                                                                                                                                                                                                                                                                                                | `medium` (sempre)                                      |
| `city`          | 1. JSON-LD `address.addressLocality`; 2. microdata `itemprop="addressLocality"`.                                                                                                                                                                                                                                                                                                                                                              | json-ld `high`; microdata `medium`                     |
| `state`         | 1. JSON-LD `address.addressRegion`; 2. microdata `itemprop="addressRegion"`. Aceitar UF (2 letras) ou nome do estado.                                                                                                                                                                                                                                                                                                                         | json-ld `high`; microdata `medium`                     |
| `country`       | 1. JSON-LD `address.addressCountry`; 2. microdata `itemprop="addressCountry"`. Aceitar nome por extenso ou código ISO (`BR`, `Brasil`).                                                                                                                                                                                                                                                                                                       | json-ld `high`; microdata `medium`                     |

**Campos que NÃO devem ser inferidos e por quê:**

- `industry`/segmento — lista fechada em `src/lib/segments.ts` (`CLIENT_SEGMENTS`);
  qualquer heurística de título/rodapé produziria um segmento errado ou fora da lista.
- `notes` — dado interno do usuário, jamais vem do site.
- `contacts` — pessoas físicas; fora de escopo e arriscado sob LGPD.
- `logo_path` — já coberto por `POST /api/logo/from-site`; misturar os dois fluxos
  complicaria a prévia e a confirmação.
- `complement` — texto livre e ambíguo demais para extração confiável; sempre manual.
- `company_name` a partir de `<title>` — o título costuma misturar slogan, segmento e
  sufixo do site ("Home | Acme — Soluções em TI") e, na edição, tende a repetir um valor
  que o usuário já digitou. Sem `og:site_name` nem microdata, é melhor não sugerir nada
  do que sugerir um nome errado em um campo obrigatório. Reavaliar só com dados reais.

### 5.1 E-mail e telefone

- **E-mail**: compara o domínio do endereço com o hostname de `baseUrl`; aceita o
  próprio domínio e subdomínios. Descarta: plataformas de hospedagem/construtores
  (domínios que contenham `wix`, `squarespace`, `weebly`, `webnode`, `site123`,
  `godaddy`, `wordpress`, `hostinger`), domínios de exemplo (`example.com`,
  `example.org`, `example.net`, `email.com`, `domain.com`) e caixas de não-resposta
  (`no-reply`, `noreply`, `do-not-reply`, `webmaster`).
- **Telefone**: aplica `formatPhoneForDisplay` de `src/lib/phone.ts` — formata apenas
  números brasileiros completos e inequívocos (10 ou 11 dígitos, sem `0` inicial) e
  **preserva como texto** valores ambíguos (0800, ramal, internacional não-55), que
  o usuário revisa antes de aplicar. Isso evita reescrever um telefone real com máscara
  errada.

### 5.2 Split heurístico do `streetAddress`

`streetAddress` é texto livre; a separação logradouro/número é sempre heurística
(`confidence: medium`):

- Se o valor termina com um número (com letra opcional, ex.: `"Rua das Flores, 123"`,
  `"Av. Paulista, 1000 A"`): o **último** grupo `número[+letra]` vai para
  `street_number` e o restante (sem vírgula/separador final) para `street`.
- Regex de referência: `^(.*?)[,\s]+(\d+\s*[A-Za-z]?)$` → `street = trim($1)`,
  `street_number = trim($2)`.
- **Sem número no fim** (ex.: `"Centro Empresarial XYZ"`): tudo em `street` e
  `street_number = ""`.
- `complement` nunca é extraído.

## 6. Fluxos

**Busca de dados a partir do site**

1. Usuário preenche o campo Site e clica em "Buscar dados do site".
2. Cliente dispara `POST /api/company/from-site` com `{ website }`, protegido por
   `profileRequestId` (resposta fora de ordem é descartada, como `logoRequestId`).
3. Rota valida o alvo (`toPublicTarget`) e busca **somente a home** com `fetchGuarded`
   (deadline global 20 s, 512 KB, redirects manuais revalidados).
4. `extractCompanyProfile` lê JSON-LD (incluindo `@graph`/arrays e JSON malformado
   tolerado), OpenGraph, microdata, `tel:`/`mailto:` e texto visível.
5. Resposta 200 traz `fields` (encontrados) e `missing` (ausentes). A UI monta a
   prévia: uma linha por campo encontrado, com valor, origem e checkbox.
6. Por padrão, só os campos **vazios** do formulário vêm marcados. Nada é aplicado
   ainda.
7. Usuário ajusta a seleção e clica em "Aplicar dados"; os campos marcados são
   gravados no estado local (`setData`) com os valores já formatados. Campos não
   marcados (inclusive os já preenchidos) permanecem intactos.
8. O usuário pode cancelar/reabrir a prévia a qualquer momento antes de aplicar.

**Decisão: somente a home, sem crawl.** A v1 não segue links internos nem visita
`/contato`. Custo: sites que só publicam dados estruturados em páginas internas não
terão campos encontrados (a UI mostra o estado vazio/missing). Benefício: uma única
requisição por busca — menor latência, menor superfície de SSRF e nenhum risco de
"passear" por um site alheio (uso aceitável). Rastreio de páginas internas fica como
fase futura, se houver demanda.

**Após aplicar o endereço, não dispara lookup de CEP.** O preenchimento usa `setData`
direto (mesma técnica do autocomplete de CEP no sucesso), sem chamar
`lookupPostalCode`; o lookup de CEP só roda no `onBlur` do campo CEP. Justificativa:
a busca já traz o endereço completo declarado pelo site; consultar o ViaCEP em
seguida sobrescreveria o que o usuário acabou de revisar com dados potencialmente
divergentes.

## 7. UI no `client-form.tsx`

**Botão e estado**

- Novo botão `filter-button` "Buscar dados do site" **no `.form-section-heading` da seção
  "Dados da empresa"**, como segunda coluna (mesmo padrão de "＋ Adicionar contato" em
  "Pessoas de contato"). Fica acima dos campos e do bloco `.logo-upload`, o que resolve a
  baixa descoberta do gatilho; não deve parecer parte do fluxo de imagem. Abaixo do botão,
  uma dica (`aria-describedby`): "Preenche nome, CNPJ, telefone, e-mail e endereço".
  O painel de prévia vem depois do `form-grid` dessa seção (ver abaixo). Na edição, o
  painel fica acima do endereço mesmo contendo campos de endereço — é o resultado de uma
  única busca e precisa ser lido como um bloco.
- O campo Site recebe a dica "Endereço usado para buscar o logo e os dados cadastrais.",
  que liga o valor digitado aos dois recursos do site.
- Sempre habilitado, exceto durante a busca (texto "Buscando..."). Clique sem site
  (vazio ou só espaços) exibe `Informe o site da empresa.` no campo Site, move o foco
  para o input e **não** dispara requisição — o mesmo comportamento de falta de
  informação usado nos demais campos.
- Novos estados locais: `searchingProfile`, `profile` (resultado em memória),
  `profileSelection` (conjunto de campos marcados), `profileStatus`
  (`"idle" | "loading" | "empty" | "error" | "ready" | "applied"`) e o ref
  `profileRequestId = useRef(0)`.
- `searchSiteProfile()` espelha `searchSiteLogo()`: incrementa o `profileRequestId`,
  seta `searchingProfile`, limpa o `siteError`, chama a rota em JSON, ignora respostas
  com `requestId` defasado, mapeia `>= 500` para `setError` (`.form-error`) e os demais
  erros para `siteError` (`.form-field.has-error` + `.form-field-error`).

**Painel de prévia (novo bloco visual, dentro da seção "Dados da empresa")**

- Renderizado após o `.form-grid` da seção "Dados da empresa", com `role="region"` e
  `aria-label="Dados encontrados no site"` e um título `h3`/rótulo visível.
- Estado "carregando": `<p role="status">Buscando dados do site...</p>`.
- Estado vazio (200 com `fields` vazio ou só `missing`): mensagem textual
  (`Nenhum dado cadastral encontrado no site.`) com a ação de fechar.
- Estado pronto: uma linha por campo encontrado. Cada linha contém:
  - rótulo do campo (ex.: "Razão social"),
  - valor encontrado,
  - indicação da origem (ex.: `JSON-LD`, `Site`, `Telefone no site`),
  - `checkbox` com `checked` = campo vazio no formulário por padrão.
- A lista é marcada com `aria-live="polite"` para anunciar chegada de resultados.
- Foco: ao abrir a prévia, mover o foco para o título/região do painel.
- Ações: "Aplicar dados" (`primary-button` ou `subtle-button`) e "Cancelar"
  (`subtle-button`). "Aplicar dados" aplica **somente os marcados**; "Cancelar"
  descarta a prévia e volta ao estado `idle`, permitindo reabrir.

**Erros de busca** seguem o padrão obrigatório do campo Site (mesmo do logo):
`.form-field.has-error` no campo Site + `.form-field-error` com `role="alert"` e
`aria-describedby`, **sem limpar nem marcar os demais campos**. Falhas 5xx caem no
`setError` geral (`<p className="form-error">`), como hoje.

**Não aplica nada automaticamente** e não sobrescreve campo preenchido sem marcação
explícita do usuário. Aplica apenas ao clicar em "Aplicar dados".

**Classes CSS novas** (escopadas por `main.records-page`, comentadas com o nome da
tela, no fim de `src/app/globals.css`, reutilizando tokens):

| Classe                     | Papel                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `.company-profile-panel`   | contêiner do painel (superfície `#fafcf9`, borda `--line`, raio `6px`) |
| `.company-profile-heading` | título + ações do painel                                               |
| `.company-profile-row`     | linha campo/valor/origem/checkbox                                      |
| `.company-profile-label`   | rótulo do campo (`10px`, `#555e55`)                                    |
| `.company-profile-value`   | valor encontrado (`12px`, `#222`)                                      |
| `.company-profile-origin`  | etiqueta de origem (chip discreto, `9–10px`, `#858b84`)                |

Se o painel se tornar um componente reutilizável no futuro, mover para
`src/components/` e registrar na tabela §13 de `docs/padrao-visual.md`; nesta v1 ele
fica inline em `client-form.tsx`, então a atualização do `padrao-visual.md` é só da
tabela de classes (§13) e do checklist (§15), não uma seção nova.

## 8. Segurança e privacidade

- **SSRF**: mantém `toPublicTarget` + `fetchGuarded` (revalidação de porta/esquema e
  DNS antes de cada requisição, inclusive após redirect). O residual TOCTOU de DNS
  rebinding documentado em `src/lib/safe-http.ts:20-23` permanece inalterado.
- **Sem persistência**: a rota não grava HTML nem os dados extraídos; tudo é efêmero
  em memória e devolvido em JSON.
- **Sem logging de conteúdo**: `console.error` recebe apenas o objeto de erro (como o
  logo), nunca o HTML nem os campos.
- **Não segue links internos**: uma única requisição à home; sem crawl em massa e sem
  persistência de páginas.
- **LGPD**: os dados são majoritariamente de pessoa jurídica, mas e-mail/telefone
  podem identificar pessoa física. A feature mitiga com revisão **campo a campo** e
  aplicação somente explícita; nada é persistido no servidor nem aplicado sem ação do
  usuário.
- **Uso aceitável / robots.txt**: a busca é pontual, disparada pelo usuário, uma página
  por clique. Não há scraping em massa nem desrespeito a `robots.txt` relevante para
  uso humano único; documentar essa limitação no README.
- **Limitação de dados**: a feature depende de o site declarar dados estruturados
  (JSON-LD/OG/microdata) ou exibir CNPJ/telefone/e-mail no texto da home; sites sem
  isso devolvem 404 com mensagem clara.

## 9. Plano de testes

Rotas mockam **apenas I/O** (`fetch` via `vi.spyOn(globalThis, "fetch")` e
`node:dns`), como `logo/from-site/route.test.ts` faz. O módulo `company-profile.ts` e
`cnpj.ts` rodam de verdade nos testes de rota (não são mockados), porque são puros —
o padrão do repositório mocka `saveLogo` (I/O) e não o extrator.

| Arquivo                                              | Casos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/cnpj.test.ts` (novo)                        | CNPJ numérico válido (ex.: `11.222.333/0001-81`); CNPJ alfanumérico válido com letras nas 12 primeiras posições; DV incorreto rejeitado; menos/mais de 14 posições; letra nas 2 últimas posições rejeitada; caracteres inválidos; `null`/vazio/`undefined`; `normalizeCnpj` remove máscara e converte caixa; casos-limite de resto (DV 0 vs 10/11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/company-profile.test.ts` (novo)             | cada fonte por campo (tabela §5); precedência JSON-LD > OG > microdata > links > texto (fonte fraca não sobrescreve forte); JSON-LD em `@graph` e em array; JSON-LD malformado é tolerado e não derruba o resto; JSON-LD sem `@type` relevante é ignorado; `og:site_name` (sem `<title>`); `tel:`/`mailto:`; microdata textual (`<span itemprop>`), escopada após o `itemtype` de organização; `+55` em `tel:` e no JSON-LD; ramal descartado mantendo o número principal; CNPJ do texto derivando telefone (regressão); e-mail de terceiro/`no-reply`/exemplo descartado; e-mail do próprio domínio aceito; CNPJ inválido no texto descartado; telefone sem DDD/0800/assinante zero descartado; normalização com `formatPhoneForDisplay`/`formatCnpj`/`formatCep`; split de endereço com/sem número; `baseUrl` inválida → `{ fields: {} }`; entidades decodificadas; dedupe preserva a 1ª ocorrência.                                         |
| `src/app/api/company/from-site/route.test.ts` (novo) | 400 corpo inválido/sem `website`/`website` não textual; 400 site inválido (ftp, credenciais, porta não padrão) sem chamar `fetch`; 400 DNS privado/endereço bloqueado; 400 redirect para IP privado/porta não permitida/sem `Location`; 502 site inacessível/timeout/DNS falho/status de erro; 502 página > 512 KB com `content-length`; página em stream que passa de 512 KB sem `content-length` → extrai do trecho lido (mesmo comportamento tolerante do logo); 200 com `fields` + `missing` corretos a partir de HTML real servido pelo `fetch` stub (JSON-LD válido, `@graph`, malformado); 404 quando nenhum campo é extraído; `User-Agent`/`Accept`/`redirect` manual/`cache` `no-store`; prazo global de 20 s; **não** mocka `company-profile` (extração real).                                                                                                                                                                       |
| `src/components/client-form.test.tsx` (ampliar)      | botão sempre habilitado (sem site, só espaços e preenchido) / "Buscando..." durante a busca; clique sem site mostra `Informe o site da empresa.`, foca o campo, marca `has-error`/`aria-invalid` e não chama `fetch`; digitar limpa o erro e permite nova busca; envia `{ website }` em JSON; renderiza painel com valores/origem/checkboxes; por padrão só campos vazios marcados; campo preenchido não sobrescrito sem marcação; "Aplicar dados" aplica só os marcados e não dispara `/api/cep`; "Cancelar" fecha e permite reabrir; erro da API no campo Site (`has-error` + `role="alert"`) sem marcar outros campos; 5xx no erro geral; resposta fora de ordem descartada (`profileRequestId`); falha de conexão com mensagem genérica; `role="region"`/`aria-label`/`aria-live`/foco no painel; gatilho dentro do cabeçalho da seção, com descrição acessível e dica visível; campo Site ligado à dica e ao erro por `aria-describedby`. |

Cobertura: os módulos novos entram em `coverage.include` sem exclusões; manter os
pisos atuais (`statements 80`, `branches 82`, `functions 72`, `lines 81`) sem baixá-los.
Validação final executada em 2026-11-01: `npm test` = 1343 testes em 91 arquivos;
`npm run coverage` = 86,80% statements, 85,46% branches, 83,03% functions, 88,71% lines
(`company-profile.ts` com 85,66% de statements e 90,33% de linhas; `cnpj.ts` 100%;
`api/company/from-site/route.ts` 97,67% de statements); `npm run lint` limpo;
`npm run build` com sucesso.

## 10. Riscos e pontos de atenção

1. **Dado errado do site**: JSON-LD mal preenchido (ex.: `telephone` do SAC, CNPJ de
   terceiro no rodapé, endereço desatualizado). Mitigação: prévia campo a campo, origem
   explícita e `confidence` visível; nada é aplicado sem revisão.
2. **Heurística de endereço**: split de `streetAddress` pode errar em formatos atípicos
   ("Rua 9 de Julho", número no meio). Mitigação: `confidence: medium`, número sempre
   visível na prévia e editável; `complement` sempre manual.
3. **Sites sem dados estruturados**: muitos sites não declaram JSON-LD/OG/microdata.
   A feature degrada para 404 com mensagem clara; o usuário continua digitando.
4. **Latência**: uma busca é uma ida à rede de até 20 s. Mitigação: botão com
   "Buscando..." desabilitado, deadline global e resposta fora de ordem descartada.
5. **SSRF**: endereços internos/privados seguem bloqueados; o TOCTOU residual de DNS
   rebinding documentado permanece. Não há novo vetor porque o transporte é o mesmo.
6. **Expectativa do usuário**: o botão "Buscar dados" pode sugerir que tudo será
   preenchido; a prévia revisável e o estado vazio precisam comunicar os limites.
7. **Manutenção do parser**: regex tolerante é frágil contra HTML arbitrário. Mitigação:
   escopo pequeno e bem testado, sem parser novo; custo documentado como trade-off.
8. **Falso positivo em texto livre**: sequências de dígitos que parecem CNPJ/telefone
   podem vir de atributos HTML (`data-*`, `content`, query strings), datas ou
   identificadores internos. Mitigação em vigor: remoção de todas as tags antes da
   varredura de texto, limites de dígito (`(?<!\d)`/`(?!\d)`), remoção de tokens com
   forma de CNPJ antes de procurar telefone, descarte de prefixos de serviço e de
   assinante todo zero, validação dos DVs do CNPJ e revisão campo a campo na prévia.

## 11. Documentação a atualizar

Atualizados em 2026-11-01:

- `README.md`: linha "Formulários", parágrafo sobre a busca de dados cadastrais,
  linha na seção "Estrutura" e parágrafo de regras.
- `docs/padrao-visual.md`: classes novas do painel na tabela §13 e item de
  acessibilidade no checklist §15.
- Sem mudanças em `database/init.sql`, `database/migrations/` ou `.env.example` — a
  feature não altera schema, nem variáveis de ambiente, nem comandos de execução.

## 12. Decisões aprovadas (não reabrir)

1. **Fonte dos dados**: somente o site da empresa (raspagem do HTML público da home).
   Nada de API de CNPJ, nada de LLM/modelo externo.
2. **Aplicação no formulário**: prévia revisável campo a campo — valores encontrados,
   checkbox por campo e origem; por padrão só os campos vazios vêm marcados; nada é
   sobrescrito sem marcação explícita; só aplica ao clicar em "Aplicar dados".
3. **Telefone/e-mail**: v1 usa **um** telefone (primeiro `telephone` do JSON-LD e, na
   falta dele, o primeiro `tel:`/microdata) e **um** e-mail (primeiro válido do próprio
   domínio). Múltiplos valores não viram linhas extras na prévia — evita duplicar
   linhas para o mesmo campo e deixar o painel ruidoso; a escolha entre vários fica
   para a fase 2.
4. **Nome fantasia**: `trade_name` continua no escopo, preenchido só por
   `alternateName` do JSON-LD; sem fonte confiável, o campo simplesmente não aparece na
   prévia.
5. **Ordem da prévia**: segue a ordem dos campos no formulário (`company_name`,
   `trade_name`, `tax_id`, `phone`, `email`, `postal_code`, `street`,
   `street_number`, `city`, `state`, `country`), não a ordem de descoberta no HTML.

## 13. Fora de escopo (fase 2)

1. **Página de contato**: visitar `/contato` ou `schema.org/ContactPage` quando a home
   não declarar dados — exige mais requisições, novo orçamento de prazo e decisão sobre
   crawl (uso aceitável).
2. **Múltiplos telefones/e-mails**: exibir alternativas por campo na prévia.
3. **Extrair os helpers de HTML** (`decodeEntities`, `readAttributes`, `resolveUrl`)
   de `site-logo.ts` para um módulo compartilhado, quando houver um terceiro
   consumidor.
