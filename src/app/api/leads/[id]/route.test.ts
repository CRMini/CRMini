import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getLead, updateLead } = vi.hoisted(() => ({
  getLead: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/lib/repositories/leads", () => ({ getLead, updateLead }));

import { GET, PUT } from "./route";

const params = { params: Promise.resolve({ id: "lead-1" }) };

function putRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/leads/lead-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const storedLead = {
  id: "lead-1",
  company_name: "Empresa Alfa Ltda.",
  status: "Novo",
};

const validBody = {
  company_name: "Empresa Alfa Ltda.",
  trade_name: "Alfa",
  tax_id: "11222333000181",
  industry_id: "industry-tecnologia",
  segment_id: "segment-enterprise",
  revenue_band: "Até R$ 10 milhões",
  employee_band: "1-50",
  street: "Rua Teste",
  street_number: "100",
  neighborhood: "Centro",
  city_id: "city-sao-paulo",
  state: "SP",
  postal_code: "01000-000",
  country_id: "country-brasil",
  lead_source_id: "lead-source-site",
  status: "Novo",
};

describe("GET /api/leads/[id]", () => {
  beforeEach(() => {
    getLead.mockReset();
  });

  it("retorna o lead encontrado", async () => {
    getLead.mockResolvedValue(storedLead);

    const response = await GET(
      new NextRequest("http://localhost/api/leads/lead-1"),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(storedLead);
    expect(getLead).toHaveBeenCalledWith("lead-1");
  });

  it("retorna 404 quando o lead não existe", async () => {
    getLead.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/leads/lead-1"),
      params,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Lead não encontrado.",
    });
  });

  it("retorna 500 quando o repositório lança", async () => {
    getLead.mockRejectedValue(new Error("database is locked"));

    const response = await GET(
      new NextRequest("http://localhost/api/leads/lead-1"),
      params,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar o lead.",
    });
  });
});

describe("PUT /api/leads/[id]", () => {
  beforeEach(() => {
    getLead.mockReset();
    getLead.mockResolvedValue(storedLead);
    updateLead.mockReset();
    updateLead.mockResolvedValue({ ...storedLead, company_name: "Editada" });
  });

  it("edita o lead e devolve 200", async () => {
    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      company_name: "Editada",
    });
    expect(updateLead).toHaveBeenCalledWith("lead-1", validBody);
  });

  it("retorna 404 quando o lead não existe", async () => {
    getLead.mockResolvedValue(null);

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(404);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("retorna 400 para transição de status não permitida", async () => {
    getLead.mockResolvedValue({ ...storedLead, status: "Qualificando" });

    const response = await PUT(
      putRequest({ ...validBody, status: "Novo" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Essa mudança de status não é permitida.",
    });
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("retorna 400 quando desqualifica sem motivo", async () => {
    const response = await PUT(
      putRequest({ ...validBody, status: "Desqualificado" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Selecione o motivo da desqualificação.",
    });
  });

  it("retorna 400 para violação de constraint", async () => {
    updateLead.mockRejectedValue(
      Object.assign(new Error("FOREIGN KEY constraint failed"), {
        code: "SQLITE_CONSTRAINT_FOREIGNKEY",
      }),
    );

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos para o lead.",
    });
  });

  it("retorna 500 para falha inesperada", async () => {
    updateLead.mockRejectedValue(new Error("database is locked"));

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(500);
  });

  it("retorna 400 para corpo malformado", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/leads/lead-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{nao-e-json",
      }),
      params,
    );

    expect(response.status).toBe(400);
    expect(updateLead).not.toHaveBeenCalled();
  });
});
