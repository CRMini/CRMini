import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { updateClient, getClient, deactivateClient } = vi.hoisted(() => ({
  updateClient: vi.fn(),
  getClient: vi.fn(),
  deactivateClient: vi.fn(),
}));

vi.mock("@/lib/repositories/clients", () => ({
  updateClient,
  getClient,
  deactivateClient,
}));

import { DELETE, GET, PUT } from "./route";

function putRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/clients/client-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest("http://localhost/api/clients/client-1");
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/clients/client-1", {
    method: "DELETE",
  });
}

const params = { params: Promise.resolve({ id: "client-1" }) };

describe("GET /api/clients/[id]", () => {
  beforeEach(() => {
    getClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("retorna o cliente encontrado", async () => {
    getClient.mockResolvedValue({
      found: true,
      client: { id: "client-1", company_name: "Empresa" },
    });

    const response = await GET(getRequest(), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "client-1",
      company_name: "Empresa",
    });
    expect(getClient).toHaveBeenCalledWith("client-1");
  });

  it("retorna 404 quando o cliente não existe", async () => {
    getClient.mockResolvedValue({ found: false, client: undefined });

    const response = await GET(getRequest(), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Cliente não encontrado.",
    });
  });

  it("retorna 503 quando o repositório falha", async () => {
    getClient.mockRejectedValue(new Error("database is locked"));

    const response = await GET(getRequest(), params);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Erro ao consultar cliente.",
    });
  });
});

describe("PUT /api/clients/[id]", () => {
  beforeEach(() => {
    updateClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["ausente", {}],
    ["em branco", { company_name: "   " }],
    ["só espaços", { company_name: " \t " }],
  ])("retorna 400 quando o nome da empresa está %s", async (_label, body) => {
    const response = await PUT(putRequest(body), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o nome da empresa.",
    });
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("retorna 400 quando o corpo não é JSON", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "não é json",
      }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("retorna 400 quando o corpo é um array", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "[]",
      }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o cliente não existe", async () => {
    updateClient.mockResolvedValue(null);

    const response = await PUT(
      putRequest({ company_name: "Empresa", contacts: [] }),
      params,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Cliente não encontrado.",
    });
  });

  it("aceita a remoção de contatos sem bloquear por vínculos", async () => {
    updateClient.mockResolvedValue({
      id: "client-1",
      company_name: "Empresa",
      contacts: [],
    });

    const response = await PUT(
      putRequest({ company_name: "Empresa", contacts: [] }),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "client-1",
      company_name: "Empresa",
      contacts: [],
    });
    expect(updateClient).toHaveBeenCalledWith("client-1", {
      company_name: "Empresa",
      contacts: [],
    });
  });

  it("mantém o contrato de sucesso", async () => {
    updateClient.mockResolvedValue({ id: "client-1", company_name: "Empresa" });

    const response = await PUT(
      putRequest({ company_name: "Empresa", contacts: [] }),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "client-1",
      company_name: "Empresa",
    });
  });

  it("retorna 500 sem vazar detalhes quando o repositório falha", async () => {
    updateClient.mockRejectedValue(new Error("database is locked"));

    const response = await PUT(
      putRequest({ company_name: "Empresa", contacts: [] }),
      params,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível atualizar o cliente.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("DELETE /api/clients/[id]", () => {
  beforeEach(() => {
    deactivateClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("desativa o cliente e retorna 204 sem corpo", async () => {
    deactivateClient.mockResolvedValue({ found: true, row: { id: "client-1" } });

    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(204);
    expect(deactivateClient).toHaveBeenCalledWith("client-1");
    expect(await response.text()).toBe("");
  });

  it("retorna 404 quando o cliente não existe", async () => {
    deactivateClient.mockResolvedValue({ found: false, row: undefined });

    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Cliente não encontrado.",
    });
  });

  it("retorna 500 quando o repositório falha", async () => {
    deactivateClient.mockRejectedValue(new Error("database is locked"));

    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível desativar o cliente.",
    });
  });
});
