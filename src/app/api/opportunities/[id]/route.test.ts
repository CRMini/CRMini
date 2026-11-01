import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { changeOpportunityStatus, getOpportunity, updateOpportunity } =
  vi.hoisted(() => ({
    changeOpportunityStatus: vi.fn(),
    getOpportunity: vi.fn(),
    updateOpportunity: vi.fn(),
  }));

vi.mock("@/lib/repositories/opportunities", () => ({
  changeOpportunityStatus,
  getOpportunity,
  updateOpportunity,
}));

import { GET, PATCH, PUT } from "./route";

const params = { params: Promise.resolve({ id: "opp-1" }) };

function jsonRequest(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/opportunities/opp-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(method: string, body: string) {
  return new NextRequest("http://localhost/api/opportunities/opp-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const validUpdate = () => ({
  name: "Projeto de Integração",
  client_id: "client-1",
  contact_id: "contact-1",
  status: "Proposta",
  currency: "BRL",
});

describe("GET /api/opportunities/[id]", () => {
  beforeEach(() => {
    getOpportunity.mockReset();
  });

  it("retorna a oportunidade encontrada", async () => {
    getOpportunity.mockResolvedValue({ id: "opp-1", name: "Projeto" });

    const response = await GET(
      new NextRequest("http://localhost/api/opportunities/opp-1"),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "opp-1",
      name: "Projeto",
    });
    expect(getOpportunity).toHaveBeenCalledWith("opp-1");
  });

  it("retorna 404 quando a oportunidade não existe", async () => {
    getOpportunity.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/opportunities/opp-1"),
      params,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Oportunidade não encontrada.",
    });
  });

  it("retorna 503 quando o repositório falha", async () => {
    getOpportunity.mockRejectedValue(new Error("database is locked"));

    const response = await GET(
      new NextRequest("http://localhost/api/opportunities/opp-1"),
      params,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Erro ao consultar oportunidade.",
    });
  });
});

describe("PATCH /api/opportunities/[id]", () => {
  beforeEach(() => {
    changeOpportunityStatus.mockReset();
  });

  it("retorna 400 para corpo JSON malformado", async () => {
    const response = await PATCH(rawRequest("PATCH", "não é json"), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(changeOpportunityStatus).not.toHaveBeenCalled();
  });

  it("retorna 400 para status inválido", async () => {
    const response = await PATCH(jsonRequest("PATCH", { status: "Inválido" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(changeOpportunityStatus).not.toHaveBeenCalled();
  });

  it("exige motivo para o status Perdida", async () => {
    const response = await PATCH(jsonRequest("PATCH", { status: "Perdida" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(changeOpportunityStatus).not.toHaveBeenCalled();
  });

  it("rejeita motivo quando o status não é Perdida", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", { status: "Ganha", loss_reason: "Preço" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(changeOpportunityStatus).not.toHaveBeenCalled();
  });

  it("altera o status e retorna 200 com ok", async () => {
    changeOpportunityStatus.mockResolvedValue({ id: "opp-1" });

    const response = await PATCH(
      jsonRequest("PATCH", { status: "Perdida", loss_reason: "Preço" }),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(changeOpportunityStatus).toHaveBeenCalledWith(
      "opp-1",
      "Perdida",
      "Preço",
    );
  });

  it("normaliza loss_reason ausente para null", async () => {
    changeOpportunityStatus.mockResolvedValue({ id: "opp-1" });

    const response = await PATCH(jsonRequest("PATCH", { status: "Ganha" }), params);

    expect(response.status).toBe(200);
    expect(changeOpportunityStatus).toHaveBeenCalledWith("opp-1", "Ganha", null);
  });

  it("retorna 404 quando a oportunidade não existe", async () => {
    changeOpportunityStatus.mockResolvedValue(null);

    const response = await PATCH(jsonRequest("PATCH", { status: "Ganha" }), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Oportunidade não encontrada.",
    });
  });

  it("retorna 400 quando o repositório lança exceção", async () => {
    changeOpportunityStatus.mockRejectedValue(new Error("database is locked"));

    const response = await PATCH(jsonRequest("PATCH", { status: "Ganha" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível alterar o status.",
    });
  });
});

describe("PUT /api/opportunities/[id]", () => {
  beforeEach(() => {
    updateOpportunity.mockReset();
  });

  it("retorna 400 para corpo JSON malformado", async () => {
    const response = await PUT(rawRequest("PUT", "não é json"), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it.each([
    [
      "sem nome",
      { client_id: "client-1", contact_id: "contact-1", status: "Proposta", currency: "BRL" },
    ],
    [
      "sem cliente",
      { name: "Projeto", contact_id: "contact-1", status: "Proposta", currency: "BRL" },
    ],
    [
      "sem contato",
      { name: "Projeto", client_id: "client-1", status: "Proposta", currency: "BRL" },
    ],
  ])("retorna 400 informando dados obrigatórios quando %s", async (_label, body) => {
    const response = await PUT(jsonRequest("PUT", body), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe nome, cliente e contato.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("retorna 400 para status inválido", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), status: "Inválido" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("exige motivo para o status Perdida", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), status: "Perdida" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("rejeita motivo quando o status não é Perdida", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), loss_reason: "Preço" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Status ou motivo de perda inválido.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it.each(["value", "budget", "project_hours"])(
    "retorna 400 quando %s é negativo",
    async (key) => {
      const response = await PUT(
        jsonRequest("PUT", { ...validUpdate(), [key]: "-1" }),
        params,
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: `O campo ${key} deve ser um número não negativo.`,
      });
      expect(updateOpportunity).not.toHaveBeenCalled();
    },
  );

  it("retorna 400 quando value não é numérico", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), value: "abc" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "O campo value deve ser um número não negativo.",
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("retorna 400 para moeda inválida", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), currency: "GBP" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Moeda inválida." });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("retorna 400 para moeda do budget inválida", async () => {
    const response = await PUT(
      jsonRequest("PUT", { ...validUpdate(), budget_currency: "GBP" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Moeda inválida." });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("aceita budget_currency ausente", async () => {
    updateOpportunity.mockResolvedValue({ id: "opp-1" });

    const payload = validUpdate();
    const response = await PUT(jsonRequest("PUT", payload), params);

    expect(response.status).toBe(200);
    expect(updateOpportunity).toHaveBeenCalledWith("opp-1", payload);
  });

  it("atualiza a oportunidade e retorna 200", async () => {
    updateOpportunity.mockResolvedValue({ id: "opp-1", name: "Projeto" });

    const response = await PUT(jsonRequest("PUT", validUpdate()), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "opp-1",
      name: "Projeto",
    });
    expect(updateOpportunity).toHaveBeenCalledWith("opp-1", validUpdate());
  });

  it("retorna 404 quando a oportunidade ou associação não existe", async () => {
    updateOpportunity.mockResolvedValue(null);

    const response = await PUT(jsonRequest("PUT", validUpdate()), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Oportunidade ou associação válida não encontrada.",
    });
  });

  it("retorna 400 quando o repositório lança exceção", async () => {
    updateOpportunity.mockRejectedValue(new Error("database is locked"));

    const response = await PUT(jsonRequest("PUT", validUpdate()), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível atualizar a oportunidade.",
    });
  });
});
