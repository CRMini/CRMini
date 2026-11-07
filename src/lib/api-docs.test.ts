import { describe, expect, it } from "vitest";
import {
  SCALAR_CDN_INTEGRITY,
  SCALAR_CDN_VERSION,
  buildScalarHtml,
  isApiDocsEnabled,
} from "./api-docs";

describe("isApiDocsEnabled", () => {
  it.each(["development", "test"])("habilita a documentação em %s", (nodeEnv) => {
    expect(isApiDocsEnabled(nodeEnv)).toBe(true);
  });

  it.each(["production", "staging", "preview", ""])(
    "desabilita a documentação em %s",
    (nodeEnv) => {
      expect(isApiDocsEnabled(nodeEnv)).toBe(false);
    },
  );

  it("desabilita a documentação quando NODE_ENV não está definido", () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      expect(isApiDocsEnabled()).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("buildScalarHtml", () => {
  it("monta um documento HTML em português com a URL da especificação", () => {
    const html = buildScalarHtml("/api/openapi");

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<script id="api-reference" data-url="/api/openapi">');
  });

  it("fixa a versão do Scalar no CDN", () => {
    const html = buildScalarHtml("/api/openapi");

    expect(html).toContain(
      `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_CDN_VERSION}/dist/browser/standalone.min.js`,
    );
  });

  it("protege o script do CDN com integridade e CORS", () => {
    const html = buildScalarHtml("/api/openapi");

    expect(SCALAR_CDN_INTEGRITY.startsWith("sha384-")).toBe(true);
    expect(html).toContain(`integrity="${SCALAR_CDN_INTEGRITY}"`);
    expect(html).toContain('crossorigin="anonymous"');
  });

  it("recusa uma especificação que não seja caminho da própria aplicação", () => {
    expect(() => buildScalarHtml("https://exemplo.test/openapi.json")).toThrow(
      "caminho relativo",
    );
    expect(() => buildScalarHtml("//espelho.test/openapi.json")).toThrow(
      "caminho relativo",
    );
    expect(() => buildScalarHtml("javascript:alert(1)")).toThrow(
      "caminho relativo",
    );
  });

  it("escapa a URL antes de interpolar no atributo", () => {
    const html = buildScalarHtml('/api/openapi?a=1&b="x"<y>');

    expect(html).toContain(
      'data-url="/api/openapi?a=1&amp;b=&quot;x&quot;&lt;y&gt;"',
    );
    expect(html).not.toContain('data-url="/api/openapi?a=1&b="x"');
  });

  it("inclui o fallback oculto com link para a especificação", () => {
    const html = buildScalarHtml("/api/openapi");

    expect(html).toContain('<div id="fallback" hidden>');
    expect(html).toContain("precisa de acesso à internet");
    expect(html).toContain('<a href="/api/openapi">');
    expect(html).toContain('onerror="document.getElementById(\'fallback\').hidden = false"');
  });
});
