import { describe, expect, it } from "vitest";
import { extractIconUrls, sniffImageType } from "./site-logo";

describe("extractIconUrls", () => {
  const base = "https://example.com/pagina";

  it("ordena ícones, apple-touch-icon, og:image e por fim /favicon.ico", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://cdn.example.com/share.png">
        <link rel="apple-touch-icon" href="/apple.png">
        <link rel="icon" href="/icone.png">
      </head></html>`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/icone.png",
      "https://example.com/apple.png",
      "https://cdn.example.com/share.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("resolve URLs relativas contra a página consultada", () => {
    const html = `
      <link rel="icon" href="icone.png">
      <link rel="icon" href="/absoluto/icone.png">
      <link rel="icon" href="//cdn.example.com/icone.png">
      <link rel="icon" href="../acima/icone.png">`;

    expect(extractIconUrls(html, "https://example.com/a/b/")).toEqual([
      "https://example.com/a/b/icone.png",
      "https://example.com/absoluto/icone.png",
      "https://cdn.example.com/icone.png",
      "https://example.com/a/acima/icone.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("remove duplicatas preservando a primeira ocorrência", () => {
    const html = `
      <link rel="icon" href="/icone.png">
      <link rel="shortcut icon" href="/icone.png">
      <link rel="apple-touch-icon" href="/icone.png">
      <link rel="icon" href="/favicon.ico">`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/icone.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("tolera atributos fora de ordem, aspas simples e sem aspas", () => {
    const html = `
      <link href='/aspas-simples.png' rel='icon'>
      <link href=/sem-aspas.png rel=icon>
      <link rel="shortcut icon" href="/atalho.png">`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/aspas-simples.png",
      "https://example.com/sem-aspas.png",
      "https://example.com/atalho.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("tolera HTML malformado e tags com quebra de linha", () => {
    const html = `
      <head>
      <link rel="icon"
            href="/quebrado.png">
      <meta
        property="og:image"
        content="/og.png"
      >
      <link rel="stylesheet" href="/estilo.css">`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/quebrado.png",
      "https://example.com/og.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("aceita og:image declarado com name e decodifica entidades do href", () => {
    const html = `
      <link rel="icon" href="/icone.png?largura=64&amp;altura=64">
      <meta name="OG:IMAGE" content="/og.png">`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/icone.png?largura=64&altura=64",
      "https://example.com/og.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("ignora candidatos com esquema não http(s) ou href vazio", () => {
    const html = `
      <link rel="icon" href="javascript:alert(1)">
      <link rel="icon" href="">
      <link rel="icon" href="/valido.png">`;

    expect(extractIconUrls(html, base)).toEqual([
      "https://example.com/valido.png",
      "https://example.com/favicon.ico",
    ]);
  });

  it("devolve apenas o fallback quando não há tags de logo", () => {
    expect(extractIconUrls("<html><body>Sem logo</body></html>", base)).toEqual(
      ["https://example.com/favicon.ico"],
    );
    expect(extractIconUrls("", base)).toEqual([
      "https://example.com/favicon.ico",
    ]);
  });

  it("devolve lista vazia quando a base é inválida", () => {
    expect(
      extractIconUrls('<link rel="icon" href="/icone.png">', "nao é url"),
    ).toEqual([]);
    expect(extractIconUrls('<link rel="icon" href="/icone.png">', "")).toEqual(
      [],
    );
  });
});

describe("sniffImageType", () => {
  it("identifica PNG pelos magic bytes", () => {
    expect(
      sniffImageType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("png");
  });

  it("identifica JPEG pelos magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "jpg",
    );
  });

  it("identifica WebP pelos magic bytes RIFF/WEBP", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageType(webp)).toBe("webp");
  });

  it("recusa SVG mesmo com marcação válida", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    expect(sniffImageType(svg)).toBeNull();
  });

  it("recusa GIF e conteúdo arbitrário", () => {
    expect(
      sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("nao e imagem"))).toBeNull();
  });

  it("recusa bytes curtos demais para cada formato", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(
      sniffImageType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        ]),
      ),
    ).toBeNull();
  });
});
