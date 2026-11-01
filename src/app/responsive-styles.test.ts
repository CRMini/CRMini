import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

type CssBlock = { prelude: string; body: string };

/** Quebra um trecho de CSS em blocos de primeiro nível, respeitando aninhamento. */
function topLevelBlocks(source: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        blocks.push({
          prelude: source.slice(preludeStart, bodyStart - 1).trim(),
          body: source.slice(bodyStart, index),
        });
        preludeStart = index + 1;
      }
    }
  }

  return blocks;
}

const topBlocks = topLevelBlocks(css);

/**
 * CSS sem `@import` e sem comentários. Sem isso o prelude da primeira regra
 * carrega o `@import` e regras precedidas de comentário não batem com o
 * seletor exato (`:root`, `.sidebar.collapsed`).
 */
const cleanCss = css
  .replace(/@import[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const cleanTopBlocks = topLevelBlocks(cleanCss);

/** Normaliza espaços para comparar valores que o Prettier quebra em várias linhas. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Seletores de uma regra, separando listas com vírgula (ex.: `.a, .b {`). */
function selectorParts(prelude: string): string[] {
  return prelude.split(",").map((part) => normalize(part));
}

/** Valor normalizado da propriedade dentro das declarações, ou `undefined` se ausente. */
function value(declarations: string, property: string): string | undefined {
  const match = declarations.match(
    new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;}]*)`),
  );
  return match ? normalize(match[1]) : undefined;
}

/** Compara `grid-column` ignorando o espaçamento em volta da barra (`1 / -1` = `1/-1`). */
function gridColumn(declarations: string): string | undefined {
  return value(declarations, "grid-column")?.replace(/\s*\/\s*/g, "/");
}

/** Corpo das media queries cujo prelude contém exatamente a consulta informada. */
function mediaBodies(mediaQuery: string): string[] {
  return topBlocks
    .filter(
      (block) =>
        block.prelude.startsWith("@media") &&
        normalize(block.prelude).includes(mediaQuery),
    )
    .map((block) => block.body);
}

/** Regras de primeiro nível cujo prelude contém o seletor exato. */
function rulesWithSelector(source: string, selector: string): CssBlock[] {
  return topLevelBlocks(source).filter((block) =>
    selectorParts(block.prelude).includes(selector),
  );
}

/**
 * Regra do seletor dentro de `@media`. Se houver repetição, devolve a última,
 * que é a que vence na cascata.
 */
function ruleInMedia(mediaQuery: string, selector: string): CssBlock {
  const matches = mediaBodies(mediaQuery).flatMap((body) =>
    rulesWithSelector(body, selector),
  );
  expect(
    matches.length,
    `regra ausente para ${selector} em @media ${mediaQuery}`,
  ).toBeGreaterThanOrEqual(1);
  return matches[matches.length - 1];
}

/** Conta as faixas de `grid-template-columns` respeitando os parênteses de `minmax()`. */
function gridTrackCount(template: string): number {
  let depth = 0;
  let count = 0;
  let inToken = false;

  for (const char of template) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }

    if (depth === 0 && /\s/.test(char)) {
      if (inToken) {
        count += 1;
        inToken = false;
      }
      continue;
    }

    inToken = true;
  }

  return inToken ? count + 1 : count;
}

describe("Responsividade dos estilos globais", () => {
  it("mantém a linha de contatos em 4 faixas e as ações em linha própria em ≤ 900px", () => {
    // Em 681px as ações mediam 93px e eram cortadas pela coluna final de 26px.
    const row = ruleInMedia("(max-width: 900px)", ".contact-row");
    const columns = value(row.body, "grid-template-columns") ?? "";

    expect(columns).toBe("42px minmax(0, 1fr) minmax(0, 1fr) 26px");
    expect(columns).not.toContain("minmax(150px");
    expect(gridTrackCount(columns)).toBe(4);

    const actions = ruleInMedia(
      "(max-width: 900px)",
      ".contact-row > .contact-row-actions",
    );
    expect(gridColumn(actions.body)).toBe("1/-1");
    expect(value(actions.body, "grid-row")).toBe("3");
    expect(value(actions.body, "justify-self")).toBe("start");
  });

  it("mantém a borda inferior do último card de oportunidade em ≤ 600px", () => {
    const row = ruleInMedia("(max-width: 600px)", ".opportunity-table-row");
    expect(value(row.body, "border")).toBe("1px solid #e6e9e5");

    const lastRow = ruleInMedia(
      "(max-width: 600px)",
      ".opportunity-table-row:last-child",
    );
    expect(value(lastRow.body, "border-bottom")).toBe("1px solid #e6e9e5");
  });

  it("reduz os filtros de contatos para 2 colunas e empilha busca e contador em ≤ 900px", () => {
    // Sem isso a busca e o contador mantinham mínimos fixos e estouravam a viewport.
    const filters = ruleInMedia("(max-width: 900px)", ".contact-filters");
    expect(value(filters.body, "grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))",
    );

    const search = ruleInMedia(
      "(max-width: 900px)",
      ".contact-filters > input",
    );
    expect(gridColumn(search.body)).toBe("1/-1");

    for (const selector of [
      ".contact-filter-meta",
      ".contact-filters > .contact-count",
    ]) {
      const counter = ruleInMedia("(max-width: 900px)", selector);
      expect(
        gridColumn(counter.body),
        `contador fora da linha inteira: ${selector}`,
      ).toBe("1/-1");
    }
  });

  it("mantém o painel de métricas em 2 colunas em ≤ 900px", () => {
    const grid = ruleInMedia("(max-width: 900px)", ".metric-grid");
    expect(value(grid.body, "grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
  });

  it("reduz o painel de métricas para 1 coluna em ≤ 680px", () => {
    const grid = ruleInMedia("(max-width: 680px)", ".metric-grid");
    expect(value(grid.body, "grid-template-columns")).toBe("1fr");
  });

  it("reduz os filtros de oportunidades para 2 colunas em ≤ 1100px", () => {
    // Em 901px os filtros causavam overflow horizontal de 103px na página.
    const filters = ruleInMedia("(max-width: 1100px)", ".opportunity-filters");
    const columns = value(filters.body, "grid-template-columns") ?? "";

    expect(columns).toBe("minmax(0, 1fr) minmax(170px, 220px)");
    expect(gridTrackCount(columns)).toBe(2);

    const search = ruleInMedia(
      "(max-width: 1100px)",
      ".opportunity-filters > input",
    );
    expect(gridColumn(search.body)).toBe("1/-1");

    const counter = ruleInMedia(
      "(max-width: 1100px)",
      ".opportunity-filters .contact-count",
    );
    expect(gridColumn(counter.body)).toBe("1/-1");
  });

  it("mantém a sidebar em 100dvh com rolagem própria fora de media query", () => {
    // Viewports baixas (barra do navegador móvel) exigem dvh; 100vh escondia o rodapé.
    const sidebarRules = topBlocks.filter((block) =>
      selectorParts(block.prelude).includes(".sidebar"),
    );
    expect(sidebarRules.length).toBeGreaterThanOrEqual(1);

    const rulesWithHeight = sidebarRules.filter(
      (block) => value(block.body, "height") !== undefined,
    );
    expect(
      rulesWithHeight.length,
      "esperava uma regra de topo definindo a altura da sidebar",
    ).toBe(1);

    const sidebar = rulesWithHeight[0];
    expect(value(sidebar.body, "height")).toBe("100dvh");
    expect(value(sidebar.body, "overflow-y")).toBe("auto");
    expect(value(sidebar.body, "overflow-x")).toBe("hidden");

    expect(
      sidebarRules.map((block) => value(block.body, "height")),
      "sobrou height: 100vh em uma regra de topo da sidebar",
    ).not.toContain("100vh");
  });

  it("garante alvos de toque de 38px em ≤ 600px", () => {
    const selectors = [
      ".breadcrumbs a",
      ".records-header .text-link",
      ".contact-row-actions .text-link",
      ".client-row .text-link",
      ".contact-filters .contact-filter-toggle",
      ".task-status select",
      ".opportunity-status select",
    ];

    const rules = mediaBodies("(max-width: 600px)").flatMap((body) =>
      topLevelBlocks(body),
    );
    const touchRule = rules.find((rule) => {
      const parts = selectorParts(rule.prelude);
      return selectors.every((selector) => parts.includes(selector));
    });
    expect(
      touchRule,
      "regra única de alvos de toque ausente em @media (max-width: 600px)",
    ).toBeDefined();

    const touchDeclarations = touchRule ? touchRule.body : "";
    expect(value(touchDeclarations, "min-height")).toBe("38px");
    expect(value(touchDeclarations, "display")).toBe("inline-flex");

    // Cada alvo precisa manter o mínimo mesmo se a regra conjunta for dividida.
    for (const selector of selectors) {
      const minHeights = rules
        .filter((rule) => selectorParts(rule.prelude).includes(selector))
        .map((rule) => value(rule.body, "min-height"));
      expect(minHeights, `alvo de toque sem 38px: ${selector}`).toContain(
        "38px",
      );
    }
  });

  it("empilha a linha de tarefas em duas colunas em ≤ 900px", () => {
    // Com 5 colunas a linha de tarefas cortava o status entre 601px e 960px.
    const taskRow = ruleInMedia("(max-width: 900px)", ".task-row");
    const columns = value(taskRow.body, "grid-template-columns") ?? "";
    expect(columns).toBe("38px minmax(0, 1fr)");
    expect(gridTrackCount(columns)).toBe(2);

    const header = ruleInMedia("(max-width: 900px)", ".task-list-header");
    expect(value(header.body, "display")).toBe("none");

    const contactRow = ruleInMedia("(max-width: 900px)", ".contact-row");
    expect(value(contactRow.body, "grid-template-columns")).not.toBe(columns);

    // A regra de tarefas precisa vencer a cascata sobre `.contact-row`.
    expect(
      css.indexOf(".task-row {", css.indexOf(".contact-row {", 12000)),
    ).toBeGreaterThan(css.indexOf(".contact-row {", 12000));
  });

  it("mantém os mínimos da grade base de tarefas dentro de 901px", () => {
    const base = topBlocks.find((block) =>
      selectorParts(block.prelude).includes(".task-row"),
    );
    expect(base, "regra base de .task-row ausente").toBeDefined();
    if (!base) return;

    const columns = value(base.body, "grid-template-columns") ?? "";
    expect(gridTrackCount(columns)).toBe(5);
    expect(columns).toContain("minmax(96px, 1.1fr)");
    expect(columns).toContain("minmax(100px, 1fr)");
    expect(columns).toContain("minmax(92px, 0.7fr)");
    expect(columns).not.toContain("minmax(150px");
    expect(columns).not.toContain("minmax(155px");
  });

  it("mantém os mínimos da linha de contato dentro de 901px", () => {
    // Em 901px sobram ~581px de conteúdo; mínimos de 120/130px cortavam as ações.
    const base = topBlocks.find((block) =>
      selectorParts(block.prelude).includes(".contact-row"),
    );
    expect(base, "regra base de .contact-row ausente").toBeDefined();
    if (!base) return;

    const columns = value(base.body, "grid-template-columns") ?? "";
    expect(gridTrackCount(columns)).toBe(6);
    expect(columns).toContain("minmax(96px, 1.1fr)");
    expect(columns).toContain("minmax(100px, 1fr)");
    expect(columns).toContain("minmax(110px, 1fr)");
    expect(columns).not.toContain("minmax(120px");
    expect(columns).not.toContain("minmax(130px");
  });

  it("amplia ícones de toque em ≤ 600px e o logo da sidebar em ≤ 680px", () => {
    // Ícone LinkedIn (25px) e logo da sidebar (31px) ficavam abaixo do mínimo confortável.
    const linkedin = mediaBodies("(max-width: 600px)")
      .flatMap((body) => topLevelBlocks(body))
      .filter(
        (rule) =>
          selectorParts(rule.prelude).includes(".linkedin-link") &&
          value(rule.body, "width") === "32px",
      );
    expect(linkedin.length).toBeGreaterThanOrEqual(1);
    expect(value(linkedin[0].body, "height")).toBe("32px");

    const brand = ruleInMedia("(max-width: 680px)", ".sidebar .brand");
    expect(value(brand.body, "min-height")).toBe("44px");
  });

  it("quebra a linha de clientes em duas linhas em ≤ 1100px", () => {
    // Entre 901px e 1100px a coluna de metadados ficava menor que os minmax(100px) internos.
    const row = ruleInMedia(
      "(max-width: 1100px)",
      "main.records-page .client-row",
    );
    expect(value(row.body, "flex-wrap")).toBe("wrap");

    const metaRules = mediaBodies("(max-width: 1100px)").flatMap((body) =>
      rulesWithSelector(body, "main.records-page .company-meta"),
    );
    expect(
      metaRules.some(
        (rule) => value(rule.body, "grid-template-columns") === "1fr",
      ),
      "metadados do cliente deveriam ficar em 1 coluna em ≤ 1100px",
    ).toBe(true);
  });

  it("define os tokens de largura da barra lateral em :root", () => {
    const root = cleanTopBlocks.find(
      (block) => normalize(block.prelude) === ":root",
    );
    expect(root, ":root ausente").toBeDefined();
    if (!root) return;

    expect(value(root.body, "--sidebar-width")).toBe("248px");
    expect(value(root.body, "--sidebar-width-compact")).toBe("72px");
  });

  it("liga a largura da sidebar ao token e anima a transição", () => {
    const sidebarRules = cleanTopBlocks.filter((block) =>
      selectorParts(block.prelude).includes(".sidebar"),
    );

    const widths = sidebarRules
      .map((block) => value(block.body, "width"))
      .filter((width): width is string => width !== undefined);
    expect(widths, "sidebar sem var(--sidebar-width)").toContain(
      "var(--sidebar-width)",
    );

    // A transição de largura é o que dá o efeito de recolher/expandir.
    const transitions = sidebarRules
      .map((block) => value(block.body, "transition"))
      .filter((transition): transition is string => transition !== undefined);
    expect(transitions.some((transition) => transition.includes("width"))).toBe(
      true,
    );
  });

  it("recolhe a sidebar com a largura compacta e esconde os rótulos", () => {
    const collapsedWidths = rulesWithSelector(cleanCss, ".sidebar.collapsed")
      .map((block) => value(block.body, "width"))
      .filter((width): width is string => width !== undefined);
    expect(
      collapsedWidths,
      "regra de largura para .sidebar.collapsed ausente",
    ).toContain("var(--sidebar-width-compact)");

    const navItem = rulesWithSelector(
      cleanCss,
      ".sidebar.collapsed .nav-item",
    );
    expect(
      navItem.some((block) => value(block.body, "font-size") === "0"),
      ".sidebar.collapsed .nav-item deveria zerar o font-size",
    ).toBe(true);
  });

  it("compacta a sidebar recolhida e esconde o botão em ≤ 680px", () => {
    const collapsed = ruleInMedia("(max-width: 680px)", ".sidebar.collapsed");
    expect(value(collapsed.body, "width")).toBe("62px");

    // Sem espaço para o rótulo, o botão sai de cena e o recolhimento é fixo.
    const toggle = ruleInMedia("(max-width: 680px)", ".sidebar-toggle");
    expect(value(toggle.body, "display")).toBe("none");
  });

  it("desliga a transição da sidebar com prefers-reduced-motion", () => {
    const sidebar = ruleInMedia("(prefers-reduced-motion: reduce)", ".sidebar");
    expect(value(sidebar.body, "transition")).toBe("none");
  });

  it("sobrepõe o link na linha da oportunidade e mantém as ações acima", () => {
    const link = topBlocks.find((block) =>
      block.prelude.includes(".opportunity-row-link"),
    );
    expect(link, "regra de .opportunity-row-link ausente").toBeDefined();
    if (!link) return;
    expect(value(link.body, "position")).toBe("absolute");
    expect(value(link.body, "inset")).toBe("0");
    expect(value(link.body, "z-index")).toBe("1");

    const actions = topBlocks.find((block) =>
      block.prelude.includes(".opportunity-row-actions"),
    );
    expect(actions, "regra de .opportunity-row-actions ausente").toBeDefined();
    if (!actions) return;
    expect(value(actions.body, "position")).toBe("relative");
    expect(value(actions.body, "z-index")).toBe("2");

    const header = topBlocks.find((block) =>
      block.prelude.includes(".opportunity-table-header > span:last-child"),
    );
    expect(header, "cabeçalho de ações sem alinhamento").toBeDefined();
    if (header) expect(value(header.body, "text-align")).toBe("right");
  });

  it("sobrepõe o link na linha do cliente e mantém as ações acima", () => {
    const link = topBlocks.find((block) =>
      block.prelude.includes(".client-row-link"),
    );
    expect(link, "regra de .client-row-link ausente").toBeDefined();
    if (!link) return;
    expect(value(link.body, "position")).toBe("absolute");
    expect(value(link.body, "inset")).toBe("0");
    expect(value(link.body, "z-index")).toBe("1");

    const actions = topBlocks.find((block) =>
      block.prelude.includes(".client-row-actions"),
    );
    expect(actions, "regra de .client-row-actions ausente").toBeDefined();
    if (!actions) return;
    expect(value(actions.body, "position")).toBe("relative");
    expect(value(actions.body, "z-index")).toBe("2");
  });
});
