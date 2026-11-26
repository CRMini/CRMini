import { describe, expect, it, vi } from "vitest";
import { getRecentOpportunities } from "./recent-opportunities";

describe("getRecentOpportunities", () => {
  it("consulta dados relacionados, ordena por criação recente e limita a quatro", async () => {
    const rows = [
      {
        id: "opportunity-id",
        name: "Implantação",
        company_name: "Empresa Exemplo",
        contact_name: "Contato Teste",
        status: "Proposta",
        value: "1200.00",
        currency: "BRL",
        updated_at: "2025-01-01",
      },
    ];
    let receivedQuery = "";
    const query = vi.fn(async (statement: string) => {
      receivedQuery = statement;

      return { rows };
    });

    await expect(getRecentOpportunities(query)).resolves.toEqual(rows);
    expect(receivedQuery).toContain("FROM opportunities o JOIN clients c");
    expect(receivedQuery).toContain(
      "JOIN contacts p ON p.id=o.contact_id AND p.client_id=o.client_id",
    );
    expect(receivedQuery).toContain(
      "ORDER BY o.created_at DESC, o.id DESC LIMIT 4",
    );
  });

  it("retorna lista vazia quando não há oportunidades", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await expect(getRecentOpportunities(query)).resolves.toEqual([]);
  });

  it("propaga falhas da consulta", async () => {
    await expect(
      getRecentOpportunities(async () => {
        throw new Error("banco indisponível");
      }),
    ).rejects.toThrow("banco indisponível");
  });
});
