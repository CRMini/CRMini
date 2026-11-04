import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import { createClient } from "./repositories/clients";
import { deactivateContact } from "./repositories/contacts";
import { createOpportunity } from "./repositories/opportunities";
import { getDashboardData } from "./repositories/dashboard";
import {
  getDashboardMetrics,
  type DashboardMetricRow,
} from "./dashboard-metrics";
import {
  getRecentOpportunities,
  type RecentOpportunity,
} from "./recent-opportunities";

function cleanTables() {
  getDb().exec(
    "DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

function runMetrics() {
  return getDashboardMetrics((sql) => ({
    rows: [getDb().prepare(sql).get() as DashboardMetricRow],
  }));
}

function runRecent() {
  return getRecentOpportunities((sql) => ({
    rows: getDb().prepare(sql).all() as RecentOpportunity[],
  }));
}

beforeEach(cleanTables);

describe("consultas do painel no SQLite", () => {
  it("conta e agrega valores de oportunidades abertas por moeda", async () => {
    const client = await createClient({
      company_name: "Painel Ltda.",
      contacts: [{ full_name: "Contato Painel", is_primary: true }],
    });
    const contactId = (
      getDb()
        .prepare("SELECT id FROM contacts WHERE client_id = ?")
        .get(client.id) as { id: string }
    ).id;

    await createOpportunity({
      name: "Aberta BRL",
      client_id: client.id,
      contact_id: contactId,
      value: "1000.10",
    });
    await createOpportunity({
      name: "Aberta USD",
      client_id: client.id,
      contact_id: contactId,
      value: "200.20",
      currency: "USD",
    });
    await createOpportunity({
      name: "Ganha fora do somatório",
      client_id: client.id,
      contact_id: contactId,
      value: "9999.99",
      status: "Ganha",
    });
    await createOpportunity({
      name: "Sem valor",
      client_id: client.id,
      contact_id: contactId,
    });

    const metrics = await runMetrics();

    expect(metrics).toEqual({
      contactsCount: 1,
      opportunitiesCount: 4,
      openOpportunitiesCount: 3,
      conversionRate: 100,
      openValueByCurrency: { BRL: "1000.10", USD: "200.20" },
    });
  });

  it("conta apenas contatos ativos no painel", async () => {
    const client = await createClient({
      company_name: "Painel Soft Delete Ltda.",
      contacts: [
        { full_name: "Contato Ativo", is_primary: true },
        { full_name: "Contato Inativo" },
      ],
    });
    const inactive = getDb()
      .prepare("SELECT id FROM contacts WHERE client_id = ? AND full_name = ?")
      .get(client.id, "Contato Inativo") as { id: string };
    await deactivateContact(inactive.id);

    const metrics = await runMetrics();

    expect(metrics.contactsCount).toBe(1);
  });

  it("retorna zeros e mapa vazio em banco vazio", async () => {
    const metrics = await runMetrics();

    expect(metrics).toEqual({
      contactsCount: 0,
      opportunitiesCount: 0,
      openOpportunitiesCount: 0,
      conversionRate: 0,
      openValueByCurrency: {},
    });
  });

  it("fornece métricas e oportunidades pela fronteira do repositório", async () => {
    const client = await createClient({
      company_name: "Contrato Ltda.",
      contacts: [{ full_name: "Contato Contrato", is_primary: true }],
    });
    const contactId = (
      getDb()
        .prepare("SELECT id FROM contacts WHERE client_id = ?")
        .get(client.id) as { id: string }
    ).id;
    await createOpportunity({
      name: "Contrato recente",
      client_id: client.id,
      contact_id: contactId,
      value: "321.45",
    });

    await expect(getDashboardData()).resolves.toEqual({
      opportunities: [
        expect.objectContaining({
          name: "Contrato recente",
          company_name: "Contrato Ltda.",
          contact_name: "Contato Contrato",
          value: "321.45",
        }),
      ],
      metrics: {
        contactsCount: 1,
        opportunitiesCount: 1,
        openOpportunitiesCount: 1,
        conversionRate: 0,
        openValueByCurrency: { BRL: "321.45" },
      },
    });
  });

  it("propaga falha do repositório", async () => {
    const failure = new Error("Falha ao ler oportunidades");
    const prepare = vi.spyOn(getDb(), "prepare").mockImplementation(() => {
      throw failure;
    });

    await expect(getDashboardData()).rejects.toBe(failure);

    prepare.mockRestore();
  });

  it("lista oportunidades recentes com empresa e contato", async () => {
    const client = await createClient({
      company_name: "Recentes Ltda.",
      contacts: [{ full_name: "Contato Recente" }],
    });
    const contactId = (
      getDb()
        .prepare("SELECT id FROM contacts WHERE client_id = ?")
        .get(client.id) as { id: string }
    ).id;
    await createOpportunity({
      name: "Oportunidade Recente",
      client_id: client.id,
      contact_id: contactId,
      value: "1200.00",
    });

    const rows = await runRecent();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Oportunidade Recente",
      company_name: "Recentes Ltda.",
      contact_name: "Contato Recente",
      status: "Em andamento",
      value: "1200.00",
      currency: "BRL",
    });
    expect(typeof rows[0].updated_at).toBe("string");
  });
});
