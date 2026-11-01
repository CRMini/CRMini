// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveLogo, lookup } = vi.hoisted(() => ({
  saveLogo: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("@/lib/logo-assets", () => ({ saveLogo }));
vi.mock("node:dns", () => ({ promises: { lookup } }));

import { POST } from "./route";

const PUBLIC_IPV4 = "93.184.216.34";

// Assinatura PNG seguida de bytes de recheio: o suficiente para validar o magic
// bytes usado pela rota (o conteúdo real do arquivo não é interpretado).
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

let fetchMock: ReturnType<typeof vi.spyOn>;

function stubFetch(handler: FetchHandler) {
  fetchMock.mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return handler(url, init);
  });
}

function htmlResponse(html: string, headers: Record<string, string> = {}) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html", ...headers },
  });
}

function imageResponse(
  bytes: Uint8Array,
  headers: Record<string, string> = {},
  status = 200,
) {
  return new Response(bytes, {
    status,
    headers: { "content-type": "image/png", ...headers },
  });
}

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

const MB = 1024 * 1024;

/**
 * Resposta com corpo em stream: nenhum `content-length` é declarado, então o
 * limite de 2 MB precisa ser aplicado durante a leitura.
 */
function streamedImageResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "image/png" } },
  );
}

function postRequest(body: string | object) {
  return new NextRequest("http://localhost/api/logo/from-site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  saveLogo.mockReset();
  saveLogo.mockResolvedValue("/api/logo/novo-logo.png");

  lookup.mockReset();
  lookup.mockResolvedValue([{ address: PUBLIC_IPV4, family: 4 }]);

  fetchMock = vi.spyOn(globalThis, "fetch");
  stubFetch(() => {
    throw new Error("fetch não deveria ter sido chamado");
  });

  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/logo/from-site — validação de entrada", () => {
  it("rejeita corpo JSON inválido", async () => {
    const response = await POST(postRequest("{ nao e json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o site da empresa.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it.each([
    ["sem website", {}],
    ["website vazio", { website: "   " }],
    ["website não textual", { website: 42 }],
  ])("rejeita requisição %s", async (_label, body) => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o site da empresa.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "ftp://example.com",
    "https://usuario:senha@example.com",
    "exa mple.com",
  ])("rejeita site inválido %s", async (website) => {
    const response = await POST(postRequest({ website }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita porta não padrão antes de qualquer requisição", async () => {
    const response = await POST(
      postRequest({ website: "http://example.com:8080" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita site cujo DNS aponta para IP privado", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Esse endereço não pode ser consultado.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita quando o DNS não devolve endereços", async () => {
    lookup.mockResolvedValue([]);

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Esse endereço não pode ser consultado.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/logo/from-site — descoberta do logo", () => {
  it("baixa o link rel=icon e valida o formato pelos magic bytes", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          '<html><head><link rel="icon" href="/assets/marca.png"></head></html>',
        );
      }
      if (url === "https://example.com/assets/marca.png") {
        // Content-Type mentiroso: o formato precisa vir dos bytes.
        return imageResponse(PNG_BYTES, { "content-type": "image/gif" });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://example.com/assets/marca.png",
    });
    expect(saveLogo).toHaveBeenCalledTimes(1);
    const [bytes, extension] = saveLogo.mock.calls[0];
    expect(extension).toBe("png");
    expect(Array.from(bytes as Uint8Array)).toEqual(Array.from(PNG_BYTES));
  });

  it("envia User-Agent, Accept, redirect manual e cache no-store em página e imagem", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          '<html><head><link rel="icon" href="/assets/marca.png"></head></html>',
        );
      }
      if (url === "https://example.com/assets/marca.png") {
        return imageResponse(PNG_BYTES);
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      init: init as RequestInit,
    }));

    // Página primeiro, depois a imagem do <link rel="icon">.
    expect(calls.map((call) => call.url)).toEqual([
      "https://example.com/",
      "https://example.com/assets/marca.png",
    ]);

    const [pageCall, imageCall] = calls;

    expect(pageCall.init.headers).toEqual({
      "User-Agent": "CRMini-LogoFinder/1.0",
      Accept: "text/html,application/xhtml+xml",
    });
    expect(pageCall.init.redirect).toBe("manual");
    expect(pageCall.init.cache).toBe("no-store");

    expect(imageCall.init.headers).toEqual({
      "User-Agent": "CRMini-LogoFinder/1.0",
      Accept: "image/*",
    });
    expect(imageCall.init.redirect).toBe("manual");
    expect(imageCall.init.cache).toBe("no-store");
  });

  it("usa /favicon.ico quando a página não declara ícones", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          "<html><head><title>Sem ícones</title></head></html>",
        );
      }
      if (url === "https://example.com/favicon.ico") {
        return imageResponse(PNG_BYTES);
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(
      postRequest({ website: "https://example.com" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://example.com/favicon.ico",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/favicon.ico",
      expect.objectContaining({ redirect: "manual", cache: "no-store" }),
    );
    expect(saveLogo).toHaveBeenCalledWith(PNG_BYTES, "png");
  });

  it("usa og:image quando não há ícone declarado", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          '<html><head><meta property="og:image" content="https://cdn.example.com/compartilhar.jpg"></head></html>',
        );
      }
      if (url === "https://cdn.example.com/compartilhar.jpg") {
        return imageResponse(JPEG_BYTES, { "content-type": "image/jpeg" });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://cdn.example.com/compartilhar.jpg",
    });
    expect(saveLogo).toHaveBeenCalledWith(JPEG_BYTES, "jpg");
  });
});

describe("POST /api/logo/from-site — falhas de rede e limites", () => {
  it("devolve 502 quando o site está inacessível", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    expect(console.error).toHaveBeenCalled();
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 502 quando a requisição expira", async () => {
    stubFetch(() =>
      Promise.reject(
        new DOMException("The operation was aborted.", "TimeoutError"),
      ),
    );

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 502 quando a resolução de DNS falha", async () => {
    lookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    expect(console.error).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 502 quando a página responde com status de erro", async () => {
    stubFetch(
      () =>
        new Response("indisponível", {
          status: 503,
          statusText: "Unavailable",
        }),
    );

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 502 quando o HTML declara mais de 512 KB", async () => {
    stubFetch(() =>
      htmlResponse("<html></html>", {
        "content-length": String(512 * 1024 + 1),
      }),
    );

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 404 quando nenhum candidato entrega imagem", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      return new Response("não encontrado", { status: 404 });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Nenhum logo encontrado no site.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 415 quando o único candidato é SVG", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          '<link rel="icon" href="/marca.svg" type="image/svg+xml">',
        );
      }
      if (url === "https://example.com/marca.svg") {
        return imageResponse(SVG_BYTES, { "content-type": "image/svg+xml" });
      }
      return new Response("não encontrado", { status: 404 });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Formato não suportado. Use PNG, JPG ou WebP.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 413 quando a imagem declara mais de 2 MB", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      return imageResponse(PNG_BYTES, {
        "content-length": String(2 * 1024 * 1024 + 1),
      });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "O logo encontrado excede 2 MB.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });
});

describe("POST /api/logo/from-site — proteção contra SSRF", () => {
  it("devolve 400 quando a página redireciona para endereço privado", async () => {
    lookup.mockImplementation(async (hostname: string) =>
      hostname === "interno.example"
        ? [{ address: "192.168.0.10", family: 4 }]
        : [{ address: PUBLIC_IPV4, family: 4 }],
    );
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return redirectResponse("https://interno.example/painel");
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Esse endereço não pode ser consultado.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/",
      expect.anything(),
    );
  });

  it("ignora candidato bloqueado e usa o próximo válido", async () => {
    lookup.mockImplementation(async (hostname: string) =>
      hostname === "interno.example"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: PUBLIC_IPV4, family: 4 }],
    );
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse(
          '<link rel="icon" href="https://interno.example/logo.png"><link rel="icon" href="/publico.png">',
        );
      }
      if (url === "https://example.com/publico.png") {
        return imageResponse(PNG_BYTES);
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://example.com/publico.png",
    });
    expect(saveLogo).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://interno.example/logo.png",
      expect.anything(),
    );
  });
});

describe("POST /api/logo/from-site — persistência", () => {
  it("devolve 500 quando o logo não pode ser salvo", async () => {
    saveLogo.mockRejectedValue(new Error("pasta indisponível"));
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      return imageResponse(PNG_BYTES);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível salvar a imagem. Verifique se a pasta do banco está disponível e gravável.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /api/logo/from-site — precedência entre candidatos", () => {
  it("usa o favicon válido quando o ícone declarado excede 2 MB (200, não 413)", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/grande.png">');
      }
      if (url === "https://example.com/grande.png") {
        return imageResponse(PNG_BYTES, {
          "content-length": String(2 * MB + 1),
        });
      }
      if (url === "https://example.com/favicon.ico") {
        return imageResponse(JPEG_BYTES, { "content-type": "image/jpeg" });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://example.com/favicon.ico",
    });
    // O candidato grande é descartado, mas não impede os próximos.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/grande.png",
      expect.anything(),
    );
    expect(saveLogo).toHaveBeenCalledTimes(1);
    expect(saveLogo).toHaveBeenCalledWith(JPEG_BYTES, "jpg");
  });

  it("devolve 413 quando todos os candidatos excedem 2 MB", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/grande.png">');
      }
      return imageResponse(PNG_BYTES, {
        "content-length": String(2 * MB + 1),
      });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "O logo encontrado excede 2 MB.",
    });
    // Ícone declarado + fallback /favicon.ico, ambos grandes.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 415 quando todos os candidatos são SVG", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.svg">');
      }
      return imageResponse(SVG_BYTES, { "content-type": "image/svg+xml" });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Formato não suportado. Use PNG, JPG ou WebP.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it.each([
    ["corpo vazio", () => new Response(null, { status: 200 })],
    [
      "HTML disfarçado de imagem",
      () => htmlResponse("<html>não é imagem</html>"),
    ],
  ])(
    "devolve 404 (não 415) quando o candidato responde 200 com %s",
    async (_label, responseFactory) => {
      stubFetch((url) => {
        if (url === "https://example.com/") {
          return htmlResponse('<link rel="icon" href="/marca.png">');
        }
        return responseFactory();
      });

      const response = await POST(postRequest({ website: "example.com" }));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "Nenhum logo encontrado no site.",
      });
      expect(saveLogo).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/logo/from-site — redirects da página", () => {
  it("segue 3 redirects e ainda encontra o logo", async () => {
    const pages = new Map([
      ["https://example.com/", "https://example.com/r1"],
      ["https://example.com/r1", "https://example.com/r2"],
      ["https://example.com/r2", "https://example.com/r3"],
    ]);
    stubFetch((url) => {
      if (url === "https://example.com/r3") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      if (url === "https://example.com/marca.png") {
        return imageResponse(PNG_BYTES);
      }
      const location = pages.get(url);
      if (!location) throw new Error(`fetch inesperado: ${url}`);
      return redirectResponse(location);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logo_path: "/api/logo/novo-logo.png",
      source_url: "https://example.com/marca.png",
    });
  });

  it("devolve 400 quando a página redireciona sem Location", async () => {
    stubFetch(() => new Response(null, { status: 302 }));

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("devolve 400 quando a página passa de 3 redirects", async () => {
    const chain = new Map([
      ["https://example.com/", "https://example.com/r1"],
      ["https://example.com/r1", "https://example.com/r2"],
      ["https://example.com/r2", "https://example.com/r3"],
      ["https://example.com/r3", "https://example.com/r4"],
      ["https://example.com/r4", "https://example.com/r5"],
    ]);
    stubFetch((url) => {
      const location = chain.get(url);
      if (!location) throw new Error(`fetch inesperado: ${url}`);
      return redirectResponse(location);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    // Quatro respostas de redirect: o quinto salto não é seguido.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://example.com/r4",
      expect.anything(),
    );
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 400 quando o Location do redirect é inválido", async () => {
    stubFetch(() => redirectResponse("http://["));

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("devolve 400 quando a página redireciona para porta não permitida", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return redirectResponse("http://example.com:8080/logo.png");
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Site inválido. Use um endereço http(s) público.",
    });
    // A porta é validada antes de qualquer nova requisição.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://example.com:8080/logo.png",
      expect.anything(),
    );
  });

  it("ignora o candidato que redireciona para porta não permitida (404)", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      if (url === "https://example.com/marca.png") {
        return redirectResponse("http://example.com:8080/logo.png");
      }
      return new Response("não encontrado", { status: 404 });
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Nenhum logo encontrado no site.",
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://example.com:8080/logo.png",
      expect.anything(),
    );
    expect(saveLogo).not.toHaveBeenCalled();
  });
});

describe("POST /api/logo/from-site — prazo global de 20 s", () => {
  it("devolve 502 quando o prazo estoura entre candidatos", async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    stubFetch((url) => {
      if (url === "https://example.com/") {
        clock += 18_000;
        return htmlResponse(
          '<link rel="icon" href="/a.png"><link rel="icon" href="/b.png">',
        );
      }
      if (url === "https://example.com/a.png") {
        // Estoura os 20 s enquanto o primeiro candidato é processado.
        clock += 3_000;
        return new Response("não encontrado", { status: 404 });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Não foi possível acessar o site. Verifique o endereço ou sua conexão.",
    });
    // Página recebe o teto de 5 s; o candidato seguinte, só os 2 s restantes.
    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([5000, 2000]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://example.com/b.png",
      expect.anything(),
    );
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("devolve 502 sem buscar candidatos quando o prazo já estourou", async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    stubFetch((url) => {
      if (url === "https://example.com/") {
        clock += 20_000;
        return htmlResponse('<link rel="icon" href="/a.png">');
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([5000]);
    expect(saveLogo).not.toHaveBeenCalled();
  });
});

describe("POST /api/logo/from-site — limite de corpo sem content-length", () => {
  it("devolve 413 quando o stream entrega mais de 2 MB", async () => {
    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      return streamedImageResponse([
        new Uint8Array(MB),
        new Uint8Array(MB),
        new Uint8Array(MB),
      ]);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "O logo encontrado excede 2 MB.",
    });
    expect(saveLogo).not.toHaveBeenCalled();
  });

  it("aceita imagem em stream de exatamente 2 MB", async () => {
    const exactlyLimit = new Uint8Array(2 * MB);
    exactlyLimit.set(PNG_BYTES);

    stubFetch((url) => {
      if (url === "https://example.com/") {
        return htmlResponse('<link rel="icon" href="/marca.png">');
      }
      return streamedImageResponse([exactlyLimit]);
    });

    const response = await POST(postRequest({ website: "example.com" }));

    expect(response.status).toBe(200);
    expect(saveLogo).toHaveBeenCalledTimes(1);
    expect(saveLogo.mock.calls[0][1]).toBe("png");
  });
});
