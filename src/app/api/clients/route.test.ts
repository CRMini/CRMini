import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listClients, createClient, listClientOptions } = vi.hoisted(() => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  listClientOptions: vi.fn(),
}));

vi.mock("@/lib/repositories/clients", () => ({ listClients, createClient, listClientOptions }));

import { GET, POST } from "./route";

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/clients${query}`);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(body: string) {
  return new NextRequest("http://localhost/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("GET /api/clients", () => {
  beforeEach(() => {
    listClients.mockReset();
    listClientOptions.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lista clientes sem busca quando nenhum parâmetro é informado", async () => {
    listClients.mockResolvedValue([
      { id: "client-1", company_name: "Empresa" },
    ]);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "client-1", company_name: "Empresa" },
    ]);
    expect(listClients).toHaveBeenCalledWith(null);
  });

  it("aplica trim e repassa a busca", async () => {
    listClients.mockResolvedValue([]);

    const response = await GET(getRequest("?q=%20alfa%20"));

    expect(response.status).toBe(200);
    expect(listClients).toHaveBeenCalledWith("alfa");
  });

  it("trata busca vazia ou só de espaços como null", async () => {
    listClients.mockResolvedValue([]);

    const response = await GET(getRequest("?q=%20%20%20"));

    expect(response.status).toBe(200);
    expect(listClients).toHaveBeenCalledWith(null);
  });

  it("retorna 503 sem vazar detalhes quando o repositório falha", async () => {
    listClients.mockRejectedValue(new Error("database is locked"));

    const response = await GET(getRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar os clientes.",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("retorna opções compactas com compact=1", async () => {
    listClientOptions.mockResolvedValue([
      { id: "client-1", company_name: "Empresa", trade_name: null, is_active: true },
    ]);

    const response = await GET(getRequest("?compact=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "client-1", company_name: "Empresa", trade_name: null, is_active: true },
    ]);
    expect(listClientOptions).toHaveBeenCalledWith(false);
    expect(listClients).not.toHaveBeenCalled();
  });

  it("retorna opções compactas com compact=true", async () => {
    listClientOptions.mockResolvedValue([]);

    const response = await GET(getRequest("?compact=true"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(listClientOptions).toHaveBeenCalledWith(false);
    expect(listClients).not.toHaveBeenCalled();
  });

  it("inclui clientes inativos quando compact=1&include_inactive=1", async () => {
    listClientOptions.mockResolvedValue([
      { id: "client-1", company_name: "Ativa", trade_name: null, is_active: true },
      { id: "client-2", company_name: "Inativa", trade_name: null, is_active: false },
    ]);

    const response = await GET(getRequest("?compact=1&include_inactive=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveLength(2);
    expect(listClientOptions).toHaveBeenCalledWith(true);
  });

  it("ignora compact com valor não reconhecido e segue a listagem normal", async () => {
    listClients.mockResolvedValue([{ id: "client-1", company_name: "Empresa" }]);

    const response = await GET(getRequest("?compact=0"));

    expect(response.status).toBe(200);
    expect(listClients).toHaveBeenCalledWith(null);
    expect(listClientOptions).not.toHaveBeenCalled();
  });
});

describe("POST /api/clients", () => {
  beforeEach(() => {
    createClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["ausente", {}],
    ["em branco", { company_name: "   " }],
    ["só espaços", { company_name: " \t " }],
  ])("retorna 400 quando o nome da empresa está %s", async (_label, body) => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o nome da empresa.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("cria o cliente e retorna 201", async () => {
    createClient.mockResolvedValue({
      id: "client-1",
      company_name: "Empresa",
    });

    const payload = { company_name: "  Empresa  " };
    const response = await POST(postRequest(payload));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "client-1",
      company_name: "Empresa",
    });
    expect(createClient).toHaveBeenCalledWith(payload);
  });

  it("rejeita corpo que não é JSON com 400", async () => {
    const response = await POST(rawPostRequest("não é json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["array", "[]"],
    ["nulo", "null"],
  ])("rejeita corpo %s com 400", async (_, body) => {
    const response = await POST(rawPostRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("retorna 500 sem vazar detalhes quando o repositório falha", async () => {
    createClient.mockRejectedValue(new Error("database is locked"));

    const response = await POST(postRequest({ company_name: "Empresa" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível cadastrar o cliente.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
