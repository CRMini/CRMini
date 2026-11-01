// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns", () => ({ promises: { lookup } }));

import {
  assertPublicTarget,
  BlockedAddressError,
  DeadlineExceededError,
  discardBody,
  exceedsDeclaredSize,
  fetchGuarded,
  InvalidTargetError,
  readLimitedBody,
  startDeadline,
} from "./safe-http";

const PUBLIC_IPV4 = "93.184.216.34";

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

function redirectResponse(location?: string) {
  return new Response(null, {
    status: 302,
    headers: location ? { location } : undefined,
  });
}

function streamedResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: PUBLIC_IPV4, family: 4 }]);

  fetchMock = vi.spyOn(globalThis, "fetch");
  stubFetch(() => {
    throw new Error("fetch não deveria ter sido chamado");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startDeadline", () => {
  it("soma o total ao relógio atual", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    expect(startDeadline(20_000)).toBe(21_000);
  });
});

describe("assertPublicTarget", () => {
  it("aceita host cujo DNS resolve somente para endereços públicos", async () => {
    await expect(
      assertPublicTarget(new URL("https://example.com/pagina")),
    ).resolves.toBeUndefined();
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("rejeita host cujo DNS resolve para IP privado", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(
      assertPublicTarget(new URL("https://example.com/")),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("rejeita host quando a lista de endereços vem vazia", async () => {
    lookup.mockResolvedValue([]);

    await expect(
      assertPublicTarget(new URL("https://example.com/")),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("propaga a falha de DNS sem convertê-la em destino bloqueado", async () => {
    lookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.com"));

    await expect(
      assertPublicTarget(new URL("https://example.com/")),
    ).rejects.toThrow("ENOTFOUND");
  });

  it("rejeita porta ou esquema não permitido antes de consultar o DNS", async () => {
    await expect(
      assertPublicTarget(new URL("http://example.com:8080/")),
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("fetchGuarded", () => {
  it("usa as opções de segurança e devolve a URL final sem mutar a original", async () => {
    stubFetch((url) =>
      url === "https://example.com/"
        ? redirectResponse("https://example.com/final")
        : new Response("ok", { status: 200 }),
    );
    const target = new URL("https://example.com/");

    const { response, url } = await fetchGuarded(target, {
      accept: "text/html",
      deadline: startDeadline(20_000),
    });

    expect(response.status).toBe(200);
    expect(url.href).toBe("https://example.com/final");
    expect(target.href).toBe("https://example.com/");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.com/",
      expect.objectContaining({
        redirect: "manual",
        cache: "no-store",
        headers: { "User-Agent": "CRMini/1.0", Accept: "text/html" },
      }),
    );
  });

  it("limita cada requisição a 5 s por padrão", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(() => new Response("ok", { status: 200 }));

    await fetchGuarded(new URL("https://example.com/"), {
      accept: "text/html",
      deadline: startDeadline(20_000),
    });

    expect(timeoutSpy).toHaveBeenCalledWith(5_000);
  });

  it("respeita requestTimeoutMs e userAgent informados", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(() => new Response("ok", { status: 200 }));

    await fetchGuarded(new URL("https://example.com/"), {
      accept: "image/*",
      deadline: startDeadline(2_000),
      requestTimeoutMs: 800,
      userAgent: "Agente/2.0",
    });

    expect(timeoutSpy).toHaveBeenCalledWith(800);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/",
      expect.objectContaining({
        headers: { "User-Agent": "Agente/2.0", Accept: "image/*" },
      }),
    );
  });

  it("revalida o destino de cada redirect", async () => {
    lookup.mockImplementation(async (hostname: string) =>
      hostname === "interno.example"
        ? [{ address: "192.168.0.10", family: 4 }]
        : [{ address: PUBLIC_IPV4, family: 4 }],
    );
    stubFetch(() => redirectResponse("https://interno.example/painel"));

    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: startDeadline(20_000),
      }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita redirect sem Location", async () => {
    stubFetch(() => redirectResponse());

    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: startDeadline(20_000),
      }),
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita redirect com Location inválido", async () => {
    stubFetch(() => redirectResponse("http://["));

    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: startDeadline(20_000),
      }),
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita redirect para porta não permitida antes de nova requisição", async () => {
    stubFetch(() => redirectResponse("http://example.com:8080/logo.png"));

    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: startDeadline(20_000),
      }),
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://example.com:8080/logo.png",
      expect.anything(),
    );
  });

  it("segue no máximo 3 redirects", async () => {
    const chain = new Map([
      ["https://example.com/", "https://example.com/r1"],
      ["https://example.com/r1", "https://example.com/r2"],
      ["https://example.com/r2", "https://example.com/r3"],
      ["https://example.com/r3", "https://example.com/r4"],
    ]);
    stubFetch((url) => {
      const location = chain.get(url);
      if (!location) throw new Error(`fetch inesperado: ${url}`);
      return redirectResponse(location);
    });

    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: startDeadline(20_000),
      }),
    ).rejects.toBeInstanceOf(InvalidTargetError);
    // Quatro respostas de redirect: o quinto salto não é seguido.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://example.com/r4",
      expect.anything(),
    );
  });

  it("lança DeadlineExceededError quando o prazo já estourou", async () => {
    await expect(
      fetchGuarded(new URL("https://example.com/"), {
        accept: "text/html",
        deadline: Date.now() - 1,
      }),
    ).rejects.toBeInstanceOf(DeadlineExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("readLimitedBody", () => {
  it("devolve corpo vazio quando a resposta não tem corpo", async () => {
    await expect(readLimitedBody(new Response(null), 10)).resolves.toEqual({
      bytes: new Uint8Array(),
      truncated: false,
    });
  });

  it("ignora chunks vazios", async () => {
    const response = streamedResponse([
      new Uint8Array(0),
      new Uint8Array([1, 2]),
    ]);

    const { bytes, truncated } = await readLimitedBody(response, 10);

    expect(Array.from(bytes)).toEqual([1, 2]);
    expect(truncated).toBe(false);
  });

  it("não trunca quando o corpo termina exatamente no limite", async () => {
    const response = streamedResponse([new Uint8Array([1, 2, 3])]);

    const { bytes, truncated } = await readLimitedBody(response, 3);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it("trunca quando o corpo continua após atingir o limite exato", async () => {
    const response = streamedResponse([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4]),
    ]);

    const { bytes, truncated } = await readLimitedBody(response, 3);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(truncated).toBe(true);
  });

  it("trunca o chunk que ultrapassa o limite", async () => {
    const response = streamedResponse([new Uint8Array([1, 2, 3, 4, 5])]);

    const { bytes, truncated } = await readLimitedBody(response, 3);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(truncated).toBe(true);
  });
});

describe("exceedsDeclaredSize", () => {
  it("compara o content-length declarado com o limite", () => {
    expect(
      exceedsDeclaredSize(
        new Response("x", { headers: { "content-length": "11" } }),
        10,
      ),
    ).toBe(true);
    expect(
      exceedsDeclaredSize(
        new Response("x", { headers: { "content-length": "10" } }),
        10,
      ),
    ).toBe(false);
  });

  it("ignora content-length inválido ou ausente", () => {
    expect(
      exceedsDeclaredSize(
        new Response("x", { headers: { "content-length": "abc" } }),
        1,
      ),
    ).toBe(false);
    expect(
      exceedsDeclaredSize(
        new Response("x", { headers: { "content-length": "" } }),
        1,
      ),
    ).toBe(false);
    expect(exceedsDeclaredSize(new Response(null), 1)).toBe(false);
  });
});

describe("discardBody", () => {
  it("não faz nada quando não há corpo", async () => {
    await expect(
      discardBody({ body: null } as unknown as Response),
    ).resolves.toBeUndefined();
  });

  it("tolera falha ao cancelar o corpo", async () => {
    const cancel = vi.fn().mockRejectedValue(new Error("falhou"));

    await expect(
      discardBody({ body: { cancel } } as unknown as Response),
    ).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
