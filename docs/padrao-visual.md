# Padrão visual das telas do CRMini

Documento normativo para criação e ajuste de qualquer tela da aplicação. Use as palavras **DEVE**, **NÃO DEVE** e **PREFIRA** como regras verificáveis em revisão.

## 1. Objetivo e fontes de verdade

O objetivo é que uma tela nova pareça parte do mesmo produto sem exigir decisões de design próprias: mesma estrutura de página, mesmos tokens, mesma tipografia e mesmos estados.

Hierarquia das fontes de verdade, da mais forte para a mais fraca:

1. `src/app/globals.css` — única folha de estilos, define tokens e classes.
2. Componentes de referência: `src/components/contacts-view.tsx` (listagem), `src/components/client-form.tsx` (formulário), `src/app/page.tsx` (painel), `src/components/opportunities-view.tsx` e `src/components/tasks-view.tsx` (listagens específicas).
3. Este documento — consolida e explica o padrão.

Se este documento divergir do CSS, o CSS vence e o documento DEVE ser corrigido. Regras parciais também existem em `.agents/skills/crm-list-ui-style/SKILL.md` e `.agents/skills/crm-ui-accessibility/SKILL.md`; elas continuam válidas e são compatíveis com este padrão.

O projeto NÃO usa biblioteca de componentes, Tailwind, CSS Modules nem CSS-in-JS. Novas dependências de interface NÃO DEVEM ser adicionadas sem autorização.

## 2. Princípios

- **Reutilize antes de criar.** Toda tela DEVE partir de `main.records-page`, `Breadcrumbs`, `records-header` e das classes de conteúdo já existentes.
- **NÃO crie paleta, tipografia, raios, sombras ou espaçamentos próprios.** Use os tokens de `:root` e as classes de `globals.css`.
- **NÃO use `style={{ ... }}` nem blocos `<style>` locais.** Exceções só para valores dinâmicos impossíveis em CSS (por exemplo, largura calculada em tempo de execução).
- **Escopo sempre por página.** CSS novo DEVE ser escopado por `main.records-page` (ou por uma classe de bloco da tela) para não alterar o painel nem outras telas.
- **CSS novo é exceção.** Se nenhuma classe existente atender, adicione o bloco no fim de `src/app/globals.css`, comentado com o nome da tela, seguindo o padrão dos blocos existentes.
- **Nomes de classe em kebab-case**, descritivos e ligados ao domínio ou ao bloco visual.
- **Interface em português do Brasil**, com datas, valores e telefones no formato local.
- **Mudança local.** Não refatore o painel, o CSS global ou componentes não relacionados à tarefa.

## 3. Tokens e cores

Definidos em `:root`, no topo de `src/app/globals.css`:

| Token                 | Valor                    | Uso                                                 |
| --------------------- | ------------------------ | --------------------------------------------------- |
| `--ink`               | `#171717`                | Texto principal, títulos de conteúdo                |
| `--muted`             | `#767676`                | Texto secundário, breadcrumbs                       |
| `--line`              | `#e7e7e7`                | Bordas de superfícies, divisores, sidebar           |
| `--accent`            | `#398653`                | Ação principal, links, foco, ênfase                 |
| `--accent-dark`       | `#286c40`                | Hover da ação principal                             |
| `--accent-soft`       | `#eaf3ec`                | Fundos de destaque, avatar, item ativo da navegação |
| `--wash`              | `#f5f5f5`                | Fundos neutros auxiliares                           |
| `--content-max-width` | `1216px`                 | Largura máxima de `main.records-page`               |
| `--content-gutter`    | `clamp(15px, 4vw, 48px)` | Respiro lateral de `main.records-page`              |

Cores literais estruturais que fazem parte do padrão e podem ser reutilizadas:

- `#dfe4dd` — borda de campos de formulário e de filtros.
- `#e6e9e5` — borda dos cards `form-section` e da grade de oportunidades.
- `#edf0eb`, `#edf0ec` — divisores internos suaves; `#e7ebe5` — borda de card de contato.
- `#858b84`, `#8a9089`, `#929890` — metadados e labels de baixa ênfase.
- `#777`, `#888` — texto de apoio.
- `#fafbf9`, `#fafcf9`, `#fcfdfb`, `#f5f7f4` — superfícies quase brancas do bloco de listagem/formulário.
- `#fafbf9ef` — fundo translúcido de `.form-actions`.
- `#3986531c` — anel de foco (accent a ~11%).
- `#a33` — erro e ação destrutiva; `#fff2f2` e `#f0d0d0` — superfície e borda de erro; `#aa33331f` — anel de foco de campo com erro.

Em código novo, **PREFIRA tokens** (`var(--accent)`, `var(--line)`); use hex literal apenas quando repetir um valor já consagrado acima. NÃO introduza verde, cinza, sombra ou gradiente fora dessa lista.

## 4. Tipografia

- **DM Sans** (400/500/600/700) no conteúdo, formulários, tabelas e navegação. `body` usa `14px`.
- **Manrope** (400–800) em títulos, valores de métrica e identificadores de marca. NUNCA use Manrope em corpo de texto.
- Escala observada no produto:

| Elemento                                     | Tamanho / peso                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `h1` de página (`.records-header h1`)        | `700 30px Manrope`, `letter-spacing: -0.8px` (`25px` até `680px`)           |
| `h2` de seção de formulário                  | `700 16px Manrope`                                                          |
| `h2` de seção do painel (`.section-heading`) | `700 17px Manrope`                                                          |
| Nome de registro em lista                    | `12px`, peso `600`                                                          |
| Corpo e campos                               | `12–13px`                                                                   |
| Texto de apoio / descrição                   | `11px`, cor `#777` ou `#888`                                                |
| Metadados e labels                           | `9–10px`                                                                    |
| Eyebrow e cabeçalho de tabela                | `9–10px`, `600–700`, caixa alta, `letter-spacing` entre `0.35px` e `1.15px` |

Rótulos de campo usam `10px`, peso `500`, cor `#555e55`. Destaques pontuais dentro de título usam `h1 span` em `18px` e `var(--accent)` (ex.: o `✳` do painel).

## 5. Estrutura da aplicação e da página

`src/app/layout.tsx` monta `div.app-shell` com `AppSidebar` e o conteúdo da rota:

- `.app-shell` — `display: flex`, `min-height: 100vh`.
- `.sidebar` — `248px` de largura (`--sidebar-width`), `position: sticky`, `height: 100dvh`, borda direita `--line`, `padding: 24px 16px`, `gap: 22px`. O botão `.sidebar-toggle` recolhe a barra para `72px` (`--sidebar-width-compact`, só ícones, rótulos com `font-size: 0`); em `900px` a barra expandida cai para `215px` e em `680px` vira uma faixa automática de `62px` com ícones centralizados, rótulos ocultos e o botão de recolher oculto.
- `.nav-item` — `41px` de altura, `13px`, ícone em `span` de `17px`; estado ativo com fundo `--accent-soft`, texto `--accent`, `font-weight: 600` e `border-left: 3px solid var(--accent)`.
- Preferência de layout — a barra recolhida é lembrada em `localStorage` (`crmini.sidebar.collapsed`) no navegador e em `userData/preferences.json` (`sidebarCollapsed`) no Electron, via `preload`/IPC (`src/lib/sidebar-preference.ts`).

Cada página renderiza seu próprio `<main>`. O padrão é `main.records-page`, que aplica `width: min(100%, var(--content-max-width))`, `margin: 0 auto`, `padding: clamp(24px, 4vw, 48px) var(--content-gutter)` e `flex: 1`.

NÃO USE em telas novas:

- `main.content` e `header.page-header` — layout legado, sem `Breadcrumbs` e sem o cabeçalho padrão. `page-header` não existe em `globals.css`.
- `.topbar`, `.breadcrumb` (singular) e `.form-breadcrumb` — legado ou órfão; o componente vigente é `Breadcrumbs` com a classe `.breadcrumbs`.

## 6. Anatomia obrigatória de uma tela

Toda tela DEVE seguir esta ordem:

1. `<main className="records-page">`
2. `<Breadcrumbs items={[...]} />` — primeiro item `Meu espaço` com `href: "/"`, último item sem `href`.
3. `<header className="records-header">` contendo:
   - `div` com `<p className="eyebrow">` (contexto em caixa alta), `<h1>` (nome da tela) e `<p className="subheading">` (uma frase curta);
   - no máximo uma ação principal à direita.
4. Conteúdo: filtros, listagem, formulário ou cards.
5. Ações de conclusão, quando houver formulário.

Esqueleto de referência:

```tsx
<main className="records-page">
  <Breadcrumbs
    items={[{ label: "Meu espaço", href: "/" }, { label: "Configurações" }]}
  />
  <header className="records-header">
    <div>
      <p className="eyebrow">PREFERÊNCIAS</p>
      <h1>Configurações</h1>
      <p className="subheading">Ajustes do aplicativo e do banco de dados.</p>
    </div>
  </header>
  {/* conteúdo */}
</main>
```

Regras do cabeçalho:

- A ação principal é um `primary-button`, com prefixo textual `＋` quando for criação (por exemplo, `＋ Novo cliente`).
- Em telas de formulário, a ação à direita PREFIRA um `text-link` de retorno com `←`; o envio fica em `.form-actions`.
- NÃO repita o nome da tela no `eyebrow`; ele comunica a área (RELACIONAMENTO, VENDAS, CADASTRO, PREFERÊNCIAS).
- NÃO use `h1` dentro do conteúdo: existe um único `h1` por tela.

## 7. Listagens

Escolha o padrão pela natureza dos dados, não por preferência:

| Situação                                                 | Padrão                                           |
| -------------------------------------------------------- | ------------------------------------------------ |
| Busca simples + poucos campos por registro               | `records-toolbar` + `client-list`/`client-row`   |
| Busca e filtros (cliente, status, data)                  | `contact-filters` + `contact-list`/`contact-row` |
| Muitas colunas comparáveis, com ação de edição por linha | grade semântica (`opportunity-table`)            |
| Resumo tabular curto no painel                           | `table-card` + `table`                           |

Barra de busca: `.records-toolbar` (borda `--line`, `padding: 12px 15px`, texto `11px` `#777`), com `input` sem borda e a contagem à direita.

Barra de filtros: `.contact-filters` (fundo branco, borda `--line`, raio `6px`, `padding: 11px 14px`, grid). Cada controle DEVE estar dentro de um `<label>` com `<span>` visível. Campos de filtro — inclusive `input[type="date"]` dentro de `label` — têm `38px` de altura, borda `#dfe4dd`, raio `4px`, fundo branco e fonte `12px DM Sans`. A contagem usa `.contact-count` (`11px`, `#858b84`, alinhada à direita).

Lista de registros:

- `.contact-list` — superfície branca, borda `--line`, raio `7px`.
- `.contact-row` — grid de 6 colunas (`44px minmax(120px,1.1fr) minmax(120px,1fr) minmax(130px,1fr) 28px auto`), `min-height: 88px`, `padding: 14px 17px`, divisor inferior. A primeira coluna é avatar (`.contact-list-avatar`, `40px`, círculo `--accent-soft`); a última (`auto`) contém as ações da linha.
- Hierarquia interna: `b` com `12px/600` para o nome; `small`/`span` com `10px` e `#858b84` para metadados; rótulos de metadado com `9px`, caixa alta e `letter-spacing`.

#### Ações de linha (clientes, contatos, oportunidades, histórico e importação)

- As ações ficam SEMPRE no fim da linha, no contêiner próprio da listagem (`client-row-actions`, `contact-row-actions`, `opportunity-row-actions`, `event-item-actions`, `linkedin-import-actions`), alinhadas à direita.
- Cada ação é um botão de pictograma (`.row-action`, ou `RowActionLink`/`RowActionButton` de `src/components/row-action.tsx`): quadrado de `32px` com borda `#dfe4dd`, raio `5px`, fundo branco, pictograma centrado; hover/foco em `--accent` e variante destrutiva `row-action--danger` em `#a33`.
- Quando o pictograma sozinho não deixa claro o objeto da ação, use a variante com texto curto (`row-action--labeled`, prop `text`): `＋ Empresa` em vez de só `＋`. O texto é curto e complementa o pictograma; o tooltip continua com a ação completa.
- A ação DEVE ter tooltip com o texto da ação, exibido no hover e no foco por teclado (via `data-tooltip`), e nome acessível contextual em `aria-label` (`Editar contato Maria`, `Desativar cliente Alfa`). NUNCA deixe o pictograma sem nome acessível, nem use só o `title` nativo.
- Pictogramas do padrão: `✎` editar, `⊘` desativar, `↻` reativar, `✕` excluir, `↗` abrir registro, `＋` incluir e `▴` fechar o painel aberto. O pictograma é decorativo (`aria-hidden="true"`).
- Controles que abrem e fecham um painel na própria linha mantêm `aria-expanded` e `aria-controls` no botão de pictograma (caso do cadastro de empresa na importação de contatos).
- Ação destrutiva DEVE pedir confirmação (`window.confirm`) e as demais `text-link` continuam válidas para navegação no fim de linha quando a ação não é um comando curto.
- Em `≤ 600px` o alvo de toque é de `38px`; o tooltip é oculto porque não há hover.

Grade semântica (muitas colunas): use `role="table"`, `role="row"`, `role="cell"` e `data-label` em cada célula. O cabeçalho `.opportunity-table-header` usa `9px/700`, caixa alta, fundo `#fafbf9` e `min-height: 42px`; as linhas têm `min-height: 70px`, `11px` e divisor `#edf0ec`. Controles editáveis por linha (`.opportunity-status select`, `.task-status select`) DEVEM ter borda, raio, tipografia e foco próprios — nunca `<select>` nativo sem estilo.

Estados obrigatórios:

- Carregando: `<p role="status">Carregando ...</p>`.
- Erro: `.form-error` com `role="alert"` quando a mensagem aparece dinamicamente.
- Vazio: `.empty-state` com ícone em `span`, `h2` (`700 18px Manrope`), uma frase (`12px`, `#777`) e a ação principal. NÃO deixe a tela em branco.
- Contagem sempre visível quando houver busca ou filtro.

## 8. Formulários

Estrutura: `<form className="client-form">` (coluna, `gap: 16px`, `max-width: 960px`, centralizado) contendo `form-section`s. Na ficha do cliente, use também `client-form--wide`: os quadros acompanham a largura de `main.records-page` (e da seção de histórico) em vez de 960px; os demais formulários mantêm 960px.

Cada seção:

```tsx
<section className="form-section">
  <div className="form-section-heading">
    <div>
      <h2>Banco de dados</h2>
      <p>Origem atual dos dados do aplicativo.</p>
    </div>
  </div>
  <div className="form-grid">{/* campos */}</div>
</section>
```

- `.form-section` — borda `#e6e9e5`, raio `8px`, `padding: clamp(16px, 2.4vw, 26px)`, sombra `0 2px 8px #18241608`, fundo branco.
- `.form-section > h2` — `700 16px Manrope`, `border-bottom: 1px solid #edf0eb`, `padding-bottom: 14px`, cor `#263328`.
- `.form-section-heading` — título e descrição à esquerda, ação secundária à direita (`filter-button`), com quebra em telas estreitas.
- `.form-grid` — duas colunas `minmax(0, 1fr)` com `gap: 14px 18px`; uma coluna até `680px`.
- Campos com `textarea` ocupam a linha inteira via `:has(textarea)` e voltam ao normal no mobile.

Campo padrão:

```tsx
<label className="form-field">
  <span>Caminho atual</span>
  <input value={path ?? ""} readOnly />
</label>
```

- Rótulo sempre visível em `<span>` ou texto do próprio `<label>`; NÃO use placeholder como rótulo.
- Campo obrigatório DEVE indicar `*` no rótulo e usar `required`.
- `.form-field` — `display: grid`, `gap: 6px`, `10px/500`, `#555e55`.
- `input` e `select` — `42px` de altura, borda `#dfe4dd`, raio `5px`, `padding: 0 12px`, `13px DM Sans`, fundo branco.
- `textarea` — `min-height: 104px`, `resize: vertical`, `13px/1.5`, raio `5px`.
- Foco — `border-color: var(--accent)` e `box-shadow: 0 0 0 3px #3986531c`, sem `outline`.
- Checkbox — `.checkbox-field` (`min-height: 42px`, `accent-color: var(--accent)`); o checkbox de contato principal usa 16px.
- Upload de logo — `.logo-upload` (fundo `#fafcf9`, borda tracejada `#dce3da`, raio `6px`) com `.logo-preview` de `64px` e `.upload-button` envolvendo o `input[type="file"]`; garanta foco visível no controle.
- Blocos repetidos (contatos) — `.contact-form-card` (borda `#e7ebe5`, raio `6px`, fundo `#fcfdfb`) com `.contact-form-title` e ação `subtle-button danger-link` para remover.
- Observações — `.notes-input`.

#### Problema em campo (padrão obrigatório)

Sempre que um valor de campo for inválido, não puder ser obtido ou falhar em uma verificação (CEP, e-mail, data, busca externa), o campo DEVE seguir este padrão em qualquer tela:

```tsx
<div className="form-field has-error">
  <label htmlFor="cep">CEP</label>
  <input id="cep" aria-invalid="true" aria-describedby="cep-erro" />
  <span id="cep-erro" className="form-field-error" role="alert">
    CEP inválido. Informe os 8 dígitos.
  </span>
</div>
```

- `has-error` no `.form-field` deixa a borda do controle em `#a33`, inclusive no foco.
- `.form-field-error` fica imediatamente abaixo do controle, em `11px`, `#a33`.
- A mensagem DEVE dizer o que aconteceu e como corrigir, em português; NÃO use apenas ícone ou cor.
- A falha NÃO DEVE limpar, substituir nem preencher os demais campos do formulário.
- Associe o controle com `aria-invalid="true"` e `aria-describedby`; mensagens que surgem após interação usam `role="alert"`.
- Valide ao sair do campo (`blur`) ou no envio, não a cada tecla, para não acusar erro enquanto a pessoa digita.
- O mesmo comportamento vale para falha de autocompletar externo: preencha somente no sucesso e preserve o restante do formulário na falha.

Ações:

- `.form-actions` no rodapé do formulário: `sticky` no fundo, `background: #fafbf9ef`, `backdrop-filter: blur(8px)`, alinhado à direita.
- Cancelar/voltar — `filter-button` (inclusive em `<Link>`); salvar — `primary-button` com `min-width: 176px` quando for a ação de envio do `.client-form`.
- Enquanto salva, o botão fica `disabled` e o texto muda para o gerúndio (`Salvando...`).
- Mantenha os dados preenchidos após erro. Mensagem de erro dentro de `.form-error`, antes das ações.

## 9. Telas de detalhe e preferências

Telas de detalhe e de preferências usam exatamente o mesmo esqueleto da seção 6. NÃO crie um layout próprio porque a tela tem pouco conteúdo.

- Cada agrupamento de informação é um `.form-section` com `h2` e descrição curta.
- Dados somente leitura podem usar `.form-grid` com `input readOnly` ou pares rótulo/valor com a mesma tipografia de metadado; PREFIRA campos quando o valor for copiável.
- Uma única ação principal por seção. Ações globais ficam no cabeçalho da página; ações da seção ficam no `form-section-heading` ou no fim da seção.

**Caso concreto — Configurações** (`src/app/configuracoes/page.tsx`): hoje usa `main.content`, `header.page-header` (classe inexistente), `<h2>` solto e `<button>` nativo sem classe. Para entrar no padrão, a tela DEVE:

1. trocar `main.content` por `main.records-page`;
2. adicionar `Breadcrumbs` com `Meu espaço → Configurações`;
3. substituir `page-header` por `records-header` com `eyebrow` "PREFERÊNCIAS", `h1` "Configurações" e `subheading`;
4. agrupar o banco de dados em `section.form-section` com `form-section-heading` (`h2` + descrição);
5. exibir o caminho em campo somente leitura ou metadado tipografado, com o carregamento em elemento `role="status"`;
6. usar `primary-button` na troca de banco, `disabled` durante o carregamento e mantendo o aviso de que o aplicativo será reiniciado;
7. manter as mensagens de erro em `.form-error` com `role="alert"`;
8. manter os testes de `src/app/configuracoes/page.test.tsx` verdes e ajustar apenas o que a nova estrutura exigir.

## 10. Estados e feedback

- **Carregando:** texto curto com `role="status"`; nunca um spinner isolado sem texto.
- **Vazio:** `.empty-state` com ação de saída (cadastrar, limpar filtros).
- **Erro:** `.form-error` para falhas do formulário como um todo; para problemas em um campo específico, use `.form-field.has-error` + `.form-field-error` (seção 8). Para mensagens que aparecem após interação, adicione `role="alert"`. NÃO use `alert()` para erros de formulário.
- **Confirmação:** `window.confirm` é aceito para ações destrutivas (padrão atual em `clients-view.tsx`). `window.prompt` (motivo de perda em oportunidades) é legado: quando a tela tiver diálogo próprio, substitua-o; não o replique em telas novas.
- **Sucesso:** redirecionar para a listagem com `router.push` + `router.refresh` é o padrão; confirmações inline são aceitáveis em telas que permanecem abertas.
- **Datas:** instantes (`scheduled_at`, `created_at`, `updated_at`) são exibidos no fuso `America/Sao_Paulo`; datas civis (`birthday`, `opened_at`) são `YYYY-MM-DD` e NÃO DEVEM sofrer conversão de fuso.

## 11. Responsividade

Breakpoints reais do projeto: `1100px`, `900px`, `680px`, `600px` e `min-width: 901px`. NÃO invente novos breakpoints.

| Largura    | Comportamento esperado                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `≤ 1100px` | Grade de oportunidades rola horizontalmente (exceção justificada), seus filtros passam a 2 colunas e a linha de clientes quebra em duas linhas                                   |
| `≤ 900px`  | Sidebar `215px` (recolhida permanece `72px`); linha de contato em 4 colunas com as ações em linha própria; filtros de contatos/tarefas em 2 colunas; `.metric-grid` em 2 colunas |
| `≤ 680px`  | Sidebar automática de `62px`, com o botão de recolher oculto; `form-grid` em 1 coluna; `h1` `25px`; `form-actions` com menos padding; `.metric-grid` em 1 coluna                 |
| `≤ 600px`  | Filtros em 1 coluna; listas viram blocos empilhados; cabeçalho de tabela oculto; alvos de toque com pelo menos `38px` de altura                                                  |
| `≥ 901px`  | `.metric-grid` do painel em 4 colunas                                                                                                                                            |

Regras:

- PREFIRA reordenar e esconder informação secundária a permitir overflow horizontal. `company-contact` e colunas de metadado somem ou se reorganizam no mobile.
- Formulários SEMPRE em uma coluna até `680px`; o botão de envio pode ocupar a largura total.
- A grade de oportunidades é a única exceção de overflow, por ter 8 colunas: role horizontalmente até `1100px`, oculte o cabeçalho e exiba cada célula como card com `data-label` em `≤ 600px`.
- NÃO use `position: fixed` para ações; o padrão é `sticky` no `.form-actions`.
- Listas de contatos e de tarefas NÃO DEVEM depender de `overflow: hidden` para esconder colunas: em `≤ 900px` a linha de contato usa 4 colunas e as ações ocupam uma linha própria; em `≤ 600px` a linha vira bloco empilhado.
- Filtros DEVEM reduzir para 2 colunas flexíveis em `≤ 900px` e para 1 coluna em `≤ 600px`; nenhum controle pode manter `minmax()` com mínimo fixo que estoure a viewport.
- A sidebar usa `height: 100dvh` com rolagem vertical própria, para continuar navegável em viewports baixas.
- A sidebar expandida usa `248px` e pode ser recolhida para `72px` (só ícones) pelo `.sidebar-toggle`; a preferência é híbrida (`localStorage` no navegador, `preferences.json` no Electron). Em `≤ 680px` ela fica sempre em `62px` e o botão é oculto.
- Alvos de toque (links de ação, breadcrumbs, checkbox de filtro, `select` de status) DEVEM ter pelo menos `38px` de altura em `≤ 600px`.

## 12. Acessibilidade

- Use HTML semântico: `main`, `header`, `section`, `nav`, `form`, `label`, `button`, `table`.
- `Breadcrumbs` já entrega `aria-label="Navegação estrutural"` e `aria-current="page"`; não reimplemente.
- Todo campo DEVE ter rótulo programático (label envolvendo o controle ou `htmlFor`). Placeholder é complemento, nunca rótulo.
- Erros DEVEM ser textuais e associados (`aria-describedby` quando fizer sentido).
- Foco visível é obrigatório: use o anel `--accent` existente; NUNCA remova `outline` sem substituto.
- Ícones interativos DEVEM ter nome acessível; ícones decorativos usam `aria-hidden="true"`.
- Estados não podem depender só de cor (status tem texto, não apenas cor).
- Navegação por teclado, ordem de foco lógica e alvos de toque confortáveis em telas estreitas.
- Textos de ação específicos (`Desativar cliente`, `Trocar banco de dados`), não genéricos repetidos sem contexto.

## 13. Reuso de classes e componentes

| Classe / componente             | Quando usar                            | Onde está definido               | Exemplo de uso                    |
| ------------------------------- | -------------------------------------- | -------------------------------- | --------------------------------- |
| `Breadcrumbs`                   | Topo de toda tela                      | `src/components/breadcrumbs.tsx` | `<Breadcrumbs items={...} />`     |
| `records-page`                  | `<main>` de toda tela                  | `src/app/globals.css`            | `<main className="records-page">` |
| `records-header`                | Cabeçalho de página                    | `src/app/globals.css`            | `clients-view.tsx`                |
| `eyebrow` / `subheading`        | Contexto e frase de apoio do cabeçalho | `src/app/globals.css`            | `page.tsx`                        |
| `primary-button`                | Ação principal (botão ou link)         | `src/app/globals.css`            | `＋ Novo cliente`                 |
| `filter-button`                 | Ação secundária / cancelar / filtro    | `src/app/globals.css`            | `Cancelar`, `Adicionar contato`   |
| `text-link`                     | Link de navegação ou ação terciária    | `src/app/globals.css`            | `Ver detalhes →`                  |
| `subtle-button`                 | Ação discreta dentro de card           | `src/app/globals.css`            | `Remover logo`                    |
| `danger-link`                   | Ação destrutiva textual                | `src/app/globals.css`            | `Remover` contato                 |
| `records-toolbar`               | Busca simples + contagem               | `src/app/globals.css`            | `clients-view.tsx`                |
| `contact-filters`               | Busca + filtros rotulados              | `src/app/globals.css`            | `contacts-view.tsx`               |
| `contact-count`                 | Contagem de resultados                 | `src/app/globals.css`            | `12 contato(s)`                   |
| `contact-list` / `contact-row`  | Lista de registros                     | `src/app/globals.css`            | `contacts-view.tsx`               |
| `contact-list-avatar`           | Iniciais/ícone do registro             | `src/app/globals.css`            | `tasks-view.tsx`                  |
| `row-action`                    | Ação de linha com pictograma + tooltip | `src/app/globals.css`            | `✎` editar, `⊘` desativar         |
| `row-action--danger`            | Ação de linha destrutiva               | `src/app/globals.css`            | `✕` excluir, `⊘` desativar        |
| `row-action--labeled`           | Pictograma + texto curto (ação ambígua)| `src/app/globals.css`            | `＋ Empresa`                      |
| `opportunity-table`             | Grade semântica de muitas colunas      | `src/app/globals.css`            | `opportunities-view.tsx`          |
| `task-list-header` / `task-row` | Lista de tarefas com status editável   | `src/app/globals.css`            | `tasks-view.tsx`                  |
| `client-form`                   | `<form>` de cadastro/edição            | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-section`                  | Card de agrupamento                    | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-section-heading`          | Título + descrição + ação da seção     | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-grid`                     | Grade de campos                        | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-field`                    | Rótulo + controle                      | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-field` + `has-error`      | Campo com problema de informação       | `src/app/globals.css`            | CEP inválido                      |
| `form-field-error`              | Mensagem abaixo do campo com erro      | `src/app/globals.css`            | `CEP inválido...`                 |
| `checkbox-field`                | Checkbox com rótulo                    | `src/app/globals.css`            | `client-form.tsx`                 |
| `logo-upload` / `upload-button` | Upload de imagem                       | `src/app/globals.css`            | `client-form.tsx`                 |
| `company-profile-panel`         | Contêiner da prévia de dados do site   | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-row`           | Linha campo/valor/origem/checkbox      | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-label`         | Rótulo do campo na prévia              | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-value`         | Valor encontrado na prévia             | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-origin`        | Chip com a origem do valor             | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-actions`       | Ações da prévia (aplicar/cancelar)     | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-trigger`       | Gatilho da busca no cabeçalho da seção | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-trigger-hint`  | Texto de apoio do gatilho              | `src/app/globals.css`            | Cadastro de cliente               |
| `form-field-hint`               | Dica abaixo do campo                   | `src/app/globals.css`            | Cadastro de cliente               |
| `company-profile-status`        | Confirmação de aplicação               | `src/app/globals.css`            | Cadastro de cliente               |
| `contact-form-card`             | Bloco repetido de contato              | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-actions`                  | Rodapé de ações (sticky)               | `src/app/globals.css`            | `client-form.tsx`                 |
| `form-error`                    | Mensagem de erro                       | `src/app/globals.css`            | `client-form.tsx`                 |
| `empty-state`                   | Ausência de resultados                 | `src/app/globals.css`            | `contacts-view.tsx`               |
| `metric-grid` / `metric-card`   | Indicadores do painel                  | `src/app/globals.css`            | `page.tsx`                        |
| `table-card` / `table-scroll`   | Tabela do painel                       | `src/app/globals.css`            | `page.tsx`                        |
| `stage` + variantes             | Etiqueta de status                     | `src/app/globals.css`            | `page.tsx`                        |

## 14. Anti-padrões

NÃO faça:

- `<main className="content">` em tela nova — layout legado, mais estreito e sem o cabeçalho padrão.
- `header.page-header` — classe inexistente; use `records-header`.
- `<button>` sem classe (o caso atual de Configurações) — use `primary-button`, `filter-button` ou `subtle-button`.
- Tabela HTML solta fora de `.table-card`/`.table-scroll` — quebra borda, cabeçalho e rolagem.
- `style={{ color: "#..." }}` ou CSS local para “ajustar” espaçamento — corrija com as classes existentes.
- Novos hex, sombras ou raios fora dos tokens.
- `placeholder` como único rótulo, `div` clicável no lugar de `button`/`Link`, ícone sem nome acessível.
- Criar um padrão próprio de erro em campo: use sempre `.form-field.has-error` + `.form-field-error`, com borda vermelha e mensagem textual abaixo.
- Alterar outros campos de um formulário porque um campo específico falhou.
- Reimplementar breadcrumb (`div` com texto) em vez de usar `Breadcrumbs`.
- `alert()` para erro de formulário e `prompt()` como padrão de diálogo.
- Duplicar blocos inteiros de CSS para uma tela; se precisar de variação, escopar por `main.records-page` ou por uma classe de bloco.
- Refatorar `.metric-grid`, `.topbar` ou o painel “de passagem” durante outra tarefa.

## 15. Checklist de aceite

- [ ] A tela usa `main.records-page` e `Breadcrumbs`.
- [ ] Existe um único `h1`, dentro de `records-header`, com `eyebrow` e `subheading`.
- [ ] A ação principal é `primary-button`; ações secundárias são `filter-button`/`text-link`.
- [ ] Nenhum CSS novo fora de `globals.css`; qualquer bloco novo está escopado e comentado.
- [ ] Listagem usa toolbar/filtros existentes, com contagem e estados de carregando/vazio/erro.
- [ ] Formulário usa `form-section`, `form-grid`, `form-field`, `form-actions` e mensagens em `form-error`.
- [ ] Campos têm rótulo visível, obrigatórios marcados e foco no padrão `--accent`.
- [ ] Problemas em campo usam `.form-field.has-error` + `.form-field-error`, com mensagem textual e sem alterar os demais campos.
- [ ] Layout funciona em `1100px`, `900px`, `680px` e `600px` sem overflow horizontal indevido.
- [ ] Navegação por teclado, nomes acessíveis e `role="status"`/`role="alert"` conferidos.
- [ ] Painel de prévia de dados usa `role="region"` + `aria-label`, `aria-live` na lista, foco no título ao abrir e checkbox com rótulo associado; erros continuam no padrão de campo.
- [ ] Datas no fuso `America/Sao_Paulo`; datas civis sem conversão.
- [ ] Testes de comportamento criados/atualizados; se o CSS de formulário mudou, `src/app/form-styles.test.ts` cobre o contrato.
- [ ] `npm test`, `npm run lint` e `npm run build` executados e resultados reais informados.

## 16. Aplicação a telas legadas

Ordem sugerida:

1. **Configurações** — trocar `main.content`/`page-header` pelo esqueleto padrão e agrupar o conteúdo em `form-section`.
2. Telas com listagem — alinhar filtros e linhas ao padrão de contatos; remover CSS local que duplique o existente.
3. Painel — manter como está; só ajustar se houver requisito funcional. Ele é a referência de métricas e tabela, não um alvo de “uniformização”.

Regras para migração:

- Preserve comportamento, textos, testes e contratos de API; a mudança é de apresentação e estrutura semântica.
- Verifique visualmente contra `ContactsView` (listagem) e `ClientForm` (formulário) antes de concluir.
- Se a tela legada depender de classes órfãs (`.form-breadcrumb`, `.content`, `.page-header`), remova o uso; só remova a definição CSS se não houver mais consumidor e a remoção for solicitada.
- Mudanças que afetem regras de negócio exigem testes; mudanças apenas visuais exigem conferência de layout e, quando alterarem CSS de formulário, atualização dos testes de estilo.
