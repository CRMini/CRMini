import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function request(query = "") {
  return new NextRequest(`http://localhost/api/cep${query}`);
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("GET /api/cep", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("exige o parâmetro CEP", async () => {
    const response = await GET(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Informe o CEP." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa CEP fora do formato de 8 dígitos", async () => {
    const response = await GET(request("?cep=01310-10"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "CEP inválido. Informe os 8 dígitos.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta o ViaCEP com os dígitos e devolve o endereço normalizado", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        cep: "01310-100",
        logradouro: "Avenida Paulista",
        localidade: "São Paulo",
        uf: "SP",
      }),
    );

    const response = await GET(request("?cep=01310-100"));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/01310100/json/",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      postal_code: "01310-100",
      street: "Avenida Paulista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("devolve 404 quando o ViaCEP não encontra o CEP", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ erro: true }));

    const response = await GET(request("?cep=99999999"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "CEP não encontrado. Confira o número informado.",
    });
  });

  it("devolve 502 quando o ViaCEP responde com erro HTTP", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    const response = await GET(request("?cep=01310100"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível consultar o CEP. Tente novamente.",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("devolve 502 sem vazar detalhes quando a consulta falha", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const response = await GET(request("?cep=01310100"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível consultar o CEP. Tente novamente.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
