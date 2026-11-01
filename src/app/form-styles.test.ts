import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function ruleBlock(selector: string, from = 0) {
  const selectorIndex = css.indexOf(selector, from);
  expect(
    selectorIndex,
    `seletor CSS ausente: ${selector}`,
  ).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", selectorIndex);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

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

/** Declarações de todas as regras com o seletor informado dentro de `scope`. */
function ruleDeclarations(scope: string, selector: string): string[] {
  const declarations: string[] = [];
  let from = 0;

  while (true) {
    const selectorIndex = scope.indexOf(selector, from);
    if (selectorIndex === -1) {
      break;
    }

    const open = scope.indexOf("{", selectorIndex);
    expect(open, `bloco CSS inválido para: ${selector}`).toBeGreaterThanOrEqual(
      0,
    );
    const close = scope.indexOf("}", open);
    expect(close, `bloco CSS não fechado para: ${selector}`).toBeGreaterThan(
      open,
    );

    declarations.push(scope.slice(open + 1, close));
    from = close + 1;
  }

  return declarations;
}

/** Declarações do seletor dentro dos blocos da media query informada. */
function ruleBlocksInMedia(mediaQuery: string, selector: string): string[] {
  return topLevelBlocks(css)
    .filter(
      (block) =>
        block.prelude.startsWith("@media") &&
        block.prelude.includes(mediaQuery),
    )
    .flatMap((block) => ruleDeclarations(block.body, selector));
}

describe("Estilos do formulário de cadastro", () => {
  it("estiliza textarea e o estado de foco dos campos", () => {
    const textarea = ruleBlock("main.records-page .form-field textarea");
    expect(textarea).toContain("min-height: 104px");
    expect(textarea).toContain("resize: vertical");

    const focusSelectorIndex = css.indexOf(
      "main.records-page .form-field input:focus",
    );
    const focusOpen = css.indexOf("{", focusSelectorIndex);
    expect(css.slice(focusSelectorIndex, focusOpen)).toContain(
      "main.records-page .form-field textarea:focus",
    );
  });

  it("ocupa a linha inteira para campos com textarea e volta ao normal em telas estreitas", () => {
    expect(
      ruleBlock("main.records-page .form-grid > .form-field:has(textarea)"),
    ).toContain("grid-column: 1 / -1");

    const mobileSelector =
      "main.records-page .form-grid > .form-field:has(textarea)";
    const mobileDeclarations = ruleBlocksInMedia(
      "(max-width: 680px)",
      mobileSelector,
    );
    expect(
      mobileDeclarations,
      `regra mobile ausente para: ${mobileSelector}`,
    ).toHaveLength(1);
    expect(mobileDeclarations[0]).toContain("grid-column: auto");
    expect(mobileDeclarations[0]).not.toContain("grid-column: 1 / -1");
  });

  it("destaca o título da seção e alinha o botão de envio", () => {
    const heading = ruleBlock("main.records-page .form-section > h2");
    expect(heading).toContain("border-bottom");
    expect(heading).toContain("font: 700 16px Manrope, sans-serif");

    expect(
      ruleBlock("main.records-page .client-form > .primary-button"),
    ).toContain("min-width: 176px");
  });

  it("alarga a ficha do cliente para alinhar com o histórico", () => {
    const wide = ruleBlock("main.records-page .client-form--wide,");
    expect(wide).toContain("max-width: none");

    const wideActions = ruleBlock(
      "main.records-page .client-form--wide .form-actions",
    );
    expect(wideActions).toContain("max-width: none");
  });

  it("sinaliza problema em campo com borda vermelha e mensagem abaixo", () => {
    const invalidControl = ruleBlock(
      "main.records-page .form-field.has-error input",
    );
    expect(invalidControl).toContain("border-color: #a33");

    const invalidFocus = ruleBlock(
      "main.records-page .form-field.has-error input:focus",
    );
    expect(invalidFocus).toContain("border-color: #a33");
    expect(invalidFocus).toContain("box-shadow");

    const message = ruleBlock(".form-field-error {");
    expect(message).toContain("color: #a33");
    expect(message).toContain('font: 11px/1.4 "DM Sans", sans-serif');
  });

  it("mantém o checkbox de contato principal alinhado ao rótulo", () => {
    const wrapper = ruleBlock("main.records-page .contact-primary-checkbox {");
    expect(wrapper).toContain("display: inline-flex");
    expect(wrapper).toContain("align-items: center");

    const checkbox = ruleBlock(
      'main.records-page .contact-primary-checkbox input[type="checkbox"]',
    );
    expect(checkbox).toContain("width: 16px");
    expect(checkbox).toContain("height: 16px");
    expect(checkbox).toContain("accent-color: var(--accent)");
  });
});
