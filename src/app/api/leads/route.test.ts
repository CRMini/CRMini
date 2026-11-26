import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listLeads, createLead } = vi.hoisted(() => ({
  listLeads: vi.fn(),
  createLead: vi.fn(),
}));

vi.mock("@/lib/repositories/leads", () => ({ listLeads, createLead }));

import { GET, POST } from "./route";

describe("GET /api/leads", () => {
  beforeEach(() => {
    listLeads.mockReset();
    listLeads.mockResolvedValue([]);
  });

  it("retorna a lista com status 200", async () => {
    const rows = [{ id: "lead-1", company_name: "Empresa Alfa" }];
    listLeads.mockResolvedValue(rows);

    const response = await GET(new NextRequest("http://localhost/api/leads"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(rows);
    expect(listLeads).toHaveBeenCalledWith(null, null);
  });

  it("normaliza search só com espaços para null", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads?search=%20%20%20"),
    );

    expect(response.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith(null, null);
  });

  it("aplica trim ao search não vazio", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads?search=%20alfa%20"),
    );

    expect(response.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith("alfa", null);
  });

  it("repassa um status", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads?status=Qualificando"),
    );

    expect(response.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith(null, ["Qualificando"]);
  });

  it("repassa vários status e descarta os vazios", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/leads?status=Novo&status=&status=Em%20contato",
      ),
    );

    expect(response.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith(null, ["Novo", "Em contato"]);
  });

  it("repassa null quando não há status", async () => {
    await GET(new NextRequest("http://localhost/api/leads"));

    expect(listLeads).toHaveBeenCalledWith(null, null);
  });

  it("rejeita status inválido sem chamar o repositório", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads?status=Inválido"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Status inválido." });
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("retorna 400 quando o repositório lança exceção", async () => {
    listLeads.mockRejectedValue(new Error("database is locked"));

    const response = await GET(new NextRequest("http://localhost/api/leads"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar os leads.",
    });
  });
});

const validLead = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/leads", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/leads", () => {
  beforeEach(() => {
    createLead.mockReset();
    createLead.mockResolvedValue({ id: "lead-novo" });
  });

  it("cria o lead e devolve 201", async () => {
    const response = await POST(postRequest(validLead()));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "lead-novo" });
    expect(createLead).toHaveBeenCalledTimes(1);
  });

  it("não chama o repositório quando a validação falha", async () => {
    const response = await POST(
      postRequest(validLead({ company_name: "   " })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe a razão social.",
    });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("devolve 400 para violação de constraint", async () => {
    createLead.mockRejectedValue(
      Object.assign(new Error("FOREIGN KEY constraint failed"), {
        code: "SQLITE_CONSTRAINT_FOREIGNKEY",
      }),
    );

    const response = await POST(postRequest(validLead()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos para o lead.",
    });
  });

  it("trata violação de check do PostgreSQL como 400", async () => {
    createLead.mockRejectedValue(
      Object.assign(new Error("check violation"), { code: "23514" }),
    );

    const response = await POST(postRequest(validLead()));

    expect(response.status).toBe(400);
  });

  it("devolve 500 para falha inesperada", async () => {
    createLead.mockRejectedValue(new Error("database is locked"));

    const response = await POST(postRequest(validLead()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível cadastrar o lead.",
    });
  });

  it("devolve 400 para corpo malformado", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/leads", {
        method: "POST",
        body: "{nao-e-json",
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(createLead).not.toHaveBeenCalled();
  });
});
