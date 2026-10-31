import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const splashPath = path.join(process.cwd(), "electron/splash.html");
const splashHtml = fs.readFileSync(splashPath, "utf8");

// URL `file:` como a que `main.cjs` monta com `pathToFileURL`; o `%20` garante
// que o teste também cobre a decodificação feita por `URLSearchParams`.
const logoHref = "file:///opt/CRM%20ini/resources/app/public/brand/logo.svg";

function loadSplash(search = "") {
  return new JSDOM(splashHtml, {
    url: `${pathToFileURL(splashPath).href}${search}`,
    runScripts: "dangerously",
  });
}

function logoImage(dom: JSDOM) {
  const image = dom.window.document.getElementById("brand-logo");
  if (!image) throw new Error("Elemento #brand-logo ausente no splash");
  return image;
}

function cspDirectives(dom: JSDOM) {
  const content = dom.window.document
    .querySelector('meta[http-equiv="Content-Security-Policy"]')
    ?.getAttribute("content");
  if (!content) throw new Error("CSP ausente no splash");

  return new Map(
    content
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values] as const;
      }),
  );
}

describe("Electron splash", () => {
  it("aplica no logo a URL file: recebida em ?logo e mantém o alt", () => {
    const dom = loadSplash(`?logo=${encodeURIComponent(logoHref)}`);
    try {
      const image = logoImage(dom);

      expect(image.getAttribute("src")).toBe(logoHref);
      expect(image.getAttribute("alt")).toBe("CRMini");
      expect(image.getAttribute("src")).toMatch(/^file:/);
    } finally {
      dom.window.close();
    }
  });

  it("não define src quando ?logo está ausente ou vazio", () => {
    for (const search of ["", "?logo", "?logo="]) {
      const dom = loadSplash(search);
      try {
        const image = logoImage(dom);

        expect(image.hasAttribute("src")).toBe(false);
        expect(image.getAttribute("alt")).toBe("CRMini");
      } finally {
        dom.window.close();
      }
    }
  });

  it("declara na CSP exatamente o hash do único script inline executado", () => {
    const dom = loadSplash();
    try {
      const scripts = dom.window.document.querySelectorAll("script");
      expect(scripts).toHaveLength(1);

      const script = scripts[0]!;
      const scriptText = script.textContent ?? "";
      expect(scriptText).not.toBe("");

      const hash = createHash("sha256").update(scriptText).digest("base64");
      const directives = cspDirectives(dom);

      expect(directives.get("default-src")).toEqual(["'none'"]);
      expect(directives.get("img-src")).toEqual(["file:"]);
      expect(directives.get("script-src")).toEqual([`'sha256-${hash}'`]);
    } finally {
      dom.window.close();
    }
  });
});
