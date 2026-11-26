import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getLead, convertLead } = vi.hoisted(() => ({
  getLead: vi.fn(),
  convertLead: vi.fn(),
}));

vi.mock("@/lib/repositories/leads", () => ({ getLead, convertLead }));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "lead-1" }) };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/leads/lead-1/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const convertibleLead = {
  id: "lead-1",
  status: "Qualificando",
  contact_first_name: "Marina",
  contact_last_name: "Costa",
  contact_email: "marina@example.com",
};

describe("POST /api/leads/[id]/convert", () => {
  beforeEach(() => {
    getLead.mockReset();
    getLead.mockResolvedValue(convertibleLead);
    convertLead.mockReset();
    convertLead.mockResolvedValue({
      client_id: "client-1",
      contact_id: "contact-1",
      opportunity_id: "opp-1",
    });
  });

  it("converte o lead e devolve 201", async () => {
    const response = await POST(request({ name: "Oportunidade ERP" }), params);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      client_id: "client-1",
      contact_id: "contact-1",
      opportunity_id: "opp-1",
    });
    expect(convertLead).toHaveBeenCalledWith("lead-1", {
      name: "Oportunidade ERP",
    });
  });

  it("retorna 404 quando o lead não existe", async () => {
    getLead.mockResolvedValue(null);

    const response = await POST(request({ name: "Oportunidade" }), params);

    expect(response.status).toBe(404);
    expect(convertLead).not.toHaveBeenCalled();
  });

  it("retorna 400 fora de Em contato/Qualificando", async () => {
    getLead.mockResolvedValue({ ...convertibleLead, status: "Novo" });

    const response = await POST(request({ name: "Oportunidade" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Só é possível converter leads em Em contato ou Qualificando.",
    });
  });

  it("retorna 400 sem e-mail válido do contato", async () => {
    getLead.mockResolvedValue({
      ...convertibleLead,
      contact_email: "invalido@",
    });

    const response = await POST(request({ name: "Oportunidade" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe um e-mail válido do contato antes de converter.",
    });
  });

  it("retorna 400 sem nome da oportunidade", async () => {
    const response = await POST(request({ name: "  " }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o nome da oportunidade.",
    });
  });

  it("retorna 409 quando o lead não pode mais ser convertido", async () => {
    convertLead.mockResolvedValue(null);

    const response = await POST(request({ name: "Oportunidade" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "O lead não pode mais ser convertido.",
    });
  });

  it("retorna 400 para constraint e 500 para falha inesperada", async () => {
    convertLead.mockRejectedValueOnce(
      Object.assign(new Error("CHECK failed"), {
        code: "SQLITE_CONSTRAINT_CHECK",
      }),
    );
    expect((await POST(request({ name: "Oportunidade" }), params)).status).toBe(
      400,
    );

    convertLead.mockRejectedValueOnce(new Error("database is locked"));
    expect((await POST(request({ name: "Oportunidade" }), params)).status).toBe(
      500,
    );
  });

  it("retorna 400 para corpo malformado", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/leads/lead-1/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{nao-e-json",
      }),
      params,
    );

    expect(response.status).toBe(400);
    expect(convertLead).not.toHaveBeenCalled();
  });
});
