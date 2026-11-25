import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listLeadReferences, createLeadReference } = vi.hoisted(() => ({
  listLeadReferences: vi.fn(),
  createLeadReference: vi.fn(),
}));

vi.mock("@/lib/repositories/leads", () => ({
  listLeadReferences,
  createLeadReference,
}));

import { GET, POST } from "./route";

const references = {
  industries: [{ id: "industry-1", name: "Tecnologia" }],
  segments: [{ id: "segment-1", name: "Enterprise" }],
  cities: [{ id: "city-1", name: "Itu" }],
  countries: [{ id: "country-1", name: "Brasil" }],
  job_titles: [{ id: "job-1", name: "Gerente de TI" }],
  lead_sources: [{ id: "lead-source-site", name: "Site" }],
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/leads/references", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/leads/references", () => {
  beforeEach(() => {
    listLeadReferences.mockReset();
    listLeadReferences.mockResolvedValue(references);
  });

  it("devolve as seis listas de referência", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(references);
  });

  it("devolve 400 quando o repositório lança", async () => {
    listLeadReferences.mockRejectedValue(new Error("database is locked"));

    const response = await GET();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar as opções.",
    });
  });
});

describe("POST /api/leads/references", () => {
  beforeEach(() => {
    createLeadReference.mockReset();
    createLeadReference.mockResolvedValue({
      id: "new-id",
      name: "Nova opção",
    });
  });

  it("cria a opção e devolve 201", async () => {
    const response = await POST(
      postRequest({ type: "cities", name: "Nova opção" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "new-id",
      name: "Nova opção",
    });
    expect(createLeadReference).toHaveBeenCalledWith("cities", "Nova opção");
  });

  it("aplica trim antes de salvar", async () => {
    await POST(postRequest({ type: "cities", name: "  Nova opção  " }));

    expect(createLeadReference).toHaveBeenCalledWith("cities", "Nova opção");
  });

  it("rejeita tipo desconhecido sem chamar o repositório", async () => {
    const response = await POST(
      postRequest({ type: "clients", name: "Alguma coisa" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Tipo de opção inválido.",
    });
    expect(createLeadReference).not.toHaveBeenCalled();
  });

  it("rejeita nome vazio", async () => {
    const response = await POST(postRequest({ type: "cities", name: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o nome da opção.",
    });
    expect(createLeadReference).not.toHaveBeenCalled();
  });

  it("rejeita nome acima de 80 caracteres", async () => {
    const response = await POST(
      postRequest({ type: "cities", name: "a".repeat(81) }),
    );

    expect(response.status).toBe(400);
    expect(createLeadReference).not.toHaveBeenCalled();
  });

  it("devolve 409 quando a opção já existe", async () => {
    createLeadReference.mockResolvedValue(null);

    const response = await POST(postRequest({ type: "cities", name: "Itu" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Essa opção já existe.",
    });
  });

  it("devolve 400 para corpo que não é objeto", async () => {
    const response = await POST(postRequest(["cities"]));

    expect(response.status).toBe(400);
    expect(createLeadReference).not.toHaveBeenCalled();
  });

  it("devolve 500 quando o repositório lança", async () => {
    createLeadReference.mockRejectedValue(new Error("database is locked"));

    const response = await POST(postRequest({ type: "cities", name: "X" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível salvar a opção.",
    });
  });
});
