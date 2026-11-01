// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns", () => ({ promises: { lookup } }));

import { POST } from "./route";

const PUBLIC_IPV4 = "93.184.216.34";
const PAGE_LIMIT = 512 * 1024;

const missingSiteMessage = "Informe o site da empresa.";
const invalidSiteMessage = "Site inválido. Use um endereço http(s) público.";
const blockedAddressMessage = "Esse endereço não pode ser consultado.";
const unreachableMessage =
  "Não foi possível acessar o site. Verifique o endereço ou sua conexão.";
const notFoundMessage = "Nenhum dado cadastral encontrado no site.";

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
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

/** Resposta em stream, sem `content-length`, para exercitar o limite lido. */
function streamedHtmlResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/html" } },
  );
}

function postRequest(body: string | object) {
  return new NextRequest("http://localhost/api/company/from-site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const organizationJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  legalName: "Acme Comércio Ltda",
  taxID: "11.222.333/0001-81",
  telephone: "(11) 3456-7890",
  email: "contato@acme.com.br",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Av. Paulista, 1000 A",
    addressLocality: "São Paulo",
    addressRegion: "SP",
    postalCode: "01310-100",
    addressCountry: "BR",
  },
});

const organizationHtml = `<html><head><script type="application/ld+json">${organizationJsonLd}</script></head><body></body></html>`;

beforeEach(() => {
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

describe("POST /api/company/from-site — validação de entrada", () => {
  it.each([
    ["JSON inválido", "{ nao e json"],
    ["corpo não-objeto (array)", "[1, 2]"],
    ["corpo nulo", "null"],
    ["sem website", {}],
    ["website vazio", { website: "   " }],
    ["website não textual", { website: 42 }],
  ])("rejeita requisição com %s", async (_label, body) => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: missingSiteMessage });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["esquema ftp", "ftp://acme.com.br"],
    ["credenciais na URL", "https://usuario:senha@acme.com.br"],
    ["porta não padrão", "http://acme.com.br:8080"],
  ])("rejeita site inválido (%s) antes de qualquer I/O", async (_label, website) => {
    const response = await POST(postRequest({ website }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: invalidSiteMessage });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("POST /api/company/from-site — proteção contra SSRF", () => {
  it("rejeita site cujo DNS aponta para IP privado", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: blockedAddressMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita quando o DNS não devolve endereços", async () => {
    lookup.mockResolvedValue([]);

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: blockedAddressMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita redirect para IP privado sem buscar o destino", async () => {
    lookup.mockImplementation(async (hostname: string) =>
      hostname === "interno.example"
        ? [{ address: "192.168.0.10", family: 4 }]
        : [{ address: PUBLIC_IPV4, family: 4 }],
    );
    stubFetch((url) => {
      if (url === "https://acme.com.br/") {
        return redirectResponse("https://interno.example/painel");
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: blockedAddressMessage,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://interno.example/painel",
      expect.anything(),
    );
  });
});

describe("POST /api/company/from-site — falhas de rede e limites", () => {
  it("devolve 502 quando o site está inacessível", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
  });

  it("devolve 502 quando a requisição expira", async () => {
    stubFetch(() =>
      Promise.reject(
        new DOMException("The operation was aborted.", "TimeoutError"),
      ),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
  });

  it("devolve 502 quando a resolução de DNS falha", async () => {
    lookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devolve 502 quando a página responde com status de erro", async () => {
    stubFetch(
      () =>
        new Response("indisponível", {
          status: 503,
          statusText: "Unavailable",
        }),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
  });

  it("devolve 502 quando a página declara mais de 512 KB", async () => {
    stubFetch(() =>
      htmlResponse("<html></html>", {
        "content-length": String(PAGE_LIMIT + 1),
      }),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
  });

  it("extrai do trecho lido quando o stream passa de 512 KB sem content-length", async () => {
    const encoder = new TextEncoder();
    const prefix = `<html><head><script type="application/ld+json">{"@type":"Organization","name":"Acme Ltda"}</script></head><body><p>`;

    stubFetch(() =>
      streamedHtmlResponse([
        encoder.encode(`${prefix}${"x".repeat(64)}`),
        new Uint8Array(PAGE_LIMIT + 1024).fill(0x61),
      ]),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      source_url: string;
      fields: Record<string, unknown>;
    };
    expect(body.source_url).toBe("https://acme.com.br/");
    expect(body.fields.company_name).toEqual({
      value: "Acme Ltda",
      source: "json-ld",
      confidence: "high",
    });
  });
});

describe("POST /api/company/from-site — extração real do HTML", () => {
  it("devolve 200 com fields, source_url e missing na ordem canônica", async () => {
    stubFetch(() => htmlResponse(organizationHtml));

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source_url: "https://acme.com.br/",
      fields: {
        company_name: {
          value: "Acme Comércio Ltda",
          source: "json-ld",
          confidence: "high",
        },
        tax_id: {
          value: "11.222.333/0001-81",
          source: "json-ld",
          confidence: "high",
        },
        phone: {
          value: "(11) 3456-7890",
          source: "json-ld",
          confidence: "high",
        },
        email: {
          value: "contato@acme.com.br",
          source: "json-ld",
          confidence: "high",
        },
        postal_code: {
          value: "01310-100",
          source: "json-ld",
          confidence: "high",
        },
        street: {
          value: "Av. Paulista",
          source: "json-ld",
          confidence: "medium",
        },
        street_number: {
          value: "1000 A",
          source: "json-ld",
          confidence: "medium",
        },
        city: {
          value: "São Paulo",
          source: "json-ld",
          confidence: "high",
        },
        state: { value: "SP", source: "json-ld", confidence: "high" },
        country: { value: "Brasil", source: "json-ld", confidence: "high" },
      },
      missing: ["trade_name"],
    });
  });

  it("lista missing na ordem canônica dos campos", async () => {
    stubFetch(() =>
      htmlResponse(
        '<html><head><meta property="og:site_name" content="Acme Ltda"></head></html>',
      ),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source_url: "https://acme.com.br/",
      fields: {
        company_name: {
          value: "Acme Ltda",
          source: "opengraph",
          confidence: "medium",
        },
      },
      missing: [
        "trade_name",
        "tax_id",
        "phone",
        "email",
        "postal_code",
        "street",
        "street_number",
        "city",
        "state",
        "country",
      ],
    });
  });

  it("usa a URL final após redirect como base e source_url", async () => {
    stubFetch((url) => {
      if (url === "https://acme.com.br/") {
        return redirectResponse("https://www.acme.com.br/site");
      }
      if (url === "https://www.acme.com.br/site") {
        return htmlResponse(
          '<html><head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head></html>',
        );
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source_url: "https://www.acme.com.br/site",
      fields: {
        company_name: { value: "Acme", source: "json-ld", confidence: "high" },
      },
      missing: [
        "trade_name",
        "tax_id",
        "phone",
        "email",
        "postal_code",
        "street",
        "street_number",
        "city",
        "state",
        "country",
      ],
    });
  });

  it("devolve 404 quando nenhum campo é extraído", async () => {
    stubFetch(() =>
      htmlResponse("<html><body><h1>Bem-vindo</h1></body></html>"),
    );

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: notFoundMessage });
  });

  it("envia User-Agent, Accept, redirect manual e cache no-store", async () => {
    stubFetch(() => htmlResponse(organizationHtml));

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://acme.com.br/",
      expect.objectContaining({
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent": "CRMini-CompanyProfile/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      }),
    );
  });
});

describe("POST /api/company/from-site — prazo global", () => {
  it("limita cada fetch a 5 s e devolve 502 quando o prazo estoura", async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    stubFetch(() => {
      // Consome os 20 s do prazo global durante o primeiro fetch.
      clock += 20_000;
      return redirectResponse("https://acme.com.br/r1");
    });

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: unreachableMessage,
    });
    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([5000]);
    // O redirect não é seguido: o prazo é revalidado antes do próximo salto.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://acme.com.br/r1",
      expect.anything(),
    );
  });
});

describe("POST /api/company/from-site — privacidade dos logs", () => {
  it("loga apenas a mensagem e o erro, sem HTML nem dados extraídos", async () => {
    const pageWithData =
      '<html><body><p>CNPJ 11.222.333/0001-81</p><p>contato@acme.com.br</p><p>(11) 3456-7890</p></body></html>';
    stubFetch(() => new Response(pageWithData, { status: 503 }));

    const response = await POST(postRequest({ website: "acme.com.br" }));

    expect(response.status).toBe(502);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Failed to fetch company profile",
      expect.any(Error),
    );

    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((argument) =>
        argument instanceof Error
          ? `${argument.name}: ${argument.message}`
          : String(argument),
      )
      .join(" | ");

    for (const sensitive of [
      "<p>",
      "CNPJ",
      "11.222.333/0001-81",
      "11222333000181",
      "contato@acme.com.br",
      "(11) 3456-7890",
    ]) {
      expect(logged).not.toContain(sensitive);
    }
  });
});
