import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listLeads } = vi.hoisted(() => ({ listLeads: vi.fn() }));

vi.mock("@/lib/repositories/leads", () => ({ listLeads }));

import { GET } from "./route";

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

  it("repassa o status", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads?status=Qualificando"),
    );

    expect(response.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith(null, "Qualificando");
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
