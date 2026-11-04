import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  ClientsRepository,
  ContactsRepository,
  DashboardRepository,
  OpportunitiesRepository,
} from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/dashboard.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("dashboard no PostgreSQL real", () => {
  let client: Client;
  let repo: DashboardRepository;
  let clientsRepo: ClientsRepository;
  let contactsRepo: ContactsRepository;
  let opportunitiesRepo: OpportunitiesRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./dashboard")).postgresDashboardRepository;
    clientsRepo = (await import("./clients")).postgresClientsRepository;
    contactsRepo = (await import("./contacts")).postgresContactsRepository;
    opportunitiesRepo = (await import("./opportunities"))
      .postgresOpportunitiesRepository;
  });

  beforeEach(async () => {
    await client.query(
      "DELETE FROM events; DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
    );
  });

  afterAll(async () => {
    await client?.end();
    const globalForPostgres = globalThis as unknown as {
      crmPostgresPool?: { end(): Promise<void> };
    };
    await globalForPostgres.crmPostgresPool?.end();
    delete globalForPostgres.crmPostgresPool;
    delete process.env.CRM_POSTGRES_URL;
  });

  async function createCompany(
    companyName: string,
    contactNames: string[] = ["Contato Painel"],
  ): Promise<{ clientId: string; contactId: string }> {
    const created = await clientsRepo.createClient({
      company_name: companyName,
      contacts: contactNames.map((full_name, index) => ({
        full_name,
        is_primary: index === 0,
      })),
    });
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM contacts WHERE client_id = $1 AND is_primary = 1",
      [created.id],
    );
    return { clientId: created.id, contactId: rows[0].id };
  }

  async function createOpportunityFor(
    clientId: string,
    contactId: string,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    return (await opportunitiesRepo.createOpportunity({
      name: "Oportunidade",
      client_id: clientId,
      contact_id: contactId,
      ...body,
    })) as Record<string, any>;
  }

  describe("getMetrics", () => {
    it("conta e agrega valores de oportunidades abertas por moeda", async () => {
      const { clientId, contactId } = await createCompany("Painel Ltda.");

      await createOpportunityFor(clientId, contactId, {
        name: "Aberta BRL",
        value: "1000.10",
      });
      await createOpportunityFor(clientId, contactId, {
        name: "Aberta USD",
        value: "200.20",
        currency: "USD",
      });
      await createOpportunityFor(clientId, contactId, {
        name: "Ganha fora do somatório",
        value: "9999.99",
        status: "Ganha",
      });
      await createOpportunityFor(clientId, contactId, { name: "Sem valor" });

      const metrics = await repo.getMetrics();

      expect(metrics).toEqual({
        contactsCount: 1,
        opportunitiesCount: 4,
        openOpportunitiesCount: 3,
        conversionRate: 100,
        openValueByCurrency: { BRL: "1000.10", USD: "200.20" },
      });
    });

    it("conta apenas contatos ativos no painel", async () => {
      const { clientId } = await createCompany("Painel Soft Delete Ltda.", [
        "Contato Ativo",
        "Contato Inativo",
      ]);
      const { rows } = await client.query<{ id: string }>(
        "SELECT id FROM contacts WHERE client_id = $1 AND full_name = $2",
        [clientId, "Contato Inativo"],
      );
      await contactsRepo.deactivateContact(rows[0].id);

      const metrics = await repo.getMetrics();

      expect(metrics.contactsCount).toBe(1);
    });

    it("retorna zeros e mapa vazio em banco vazio", async () => {
      const metrics = await repo.getMetrics();

      expect(metrics).toEqual({
        contactsCount: 0,
        opportunitiesCount: 0,
        openOpportunitiesCount: 0,
        conversionRate: 0,
        openValueByCurrency: {},
      });
    });

    it("calcula taxa de conversão arredondada", async () => {
      const { clientId, contactId } = await createCompany("Conversão Ltda.");

      await createOpportunityFor(clientId, contactId, { status: "Ganha" });
      await createOpportunityFor(clientId, contactId, { status: "Ganha" });
      await createOpportunityFor(clientId, contactId, {
        status: "Perdida",
        loss_reason: "Preço",
      });

      const metrics = await repo.getMetrics();

      expect(metrics.opportunitiesCount).toBe(3);
      expect(metrics.conversionRate).toBe(67);
    });
  });

  describe("getRecentOpportunities", () => {
    it("lista oportunidades recentes com empresa e contato do mesmo cliente", async () => {
      const a = await createCompany("Recentes Ltda.", ["Contato Recente"]);
      const b = await createCompany("Outra S.A.", ["Outro Contato"]);

      await createOpportunityFor(a.clientId, a.contactId, {
        name: "Primeira",
        value: "1200.00",
      });
      await createOpportunityFor(b.clientId, b.contactId, {
        name: "Segunda",
        value: "800.00",
        currency: "USD",
      });

      const rows = await repo.getRecentOpportunities();

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        name: "Segunda",
        company_name: "Outra S.A.",
        contact_name: "Outro Contato",
        status: "Em andamento",
        value: "800.00",
        currency: "USD",
      });
      expect(typeof rows[0].updated_at).toBe("string");
    });

    it("limita a quatro oportunidades ordenadas por created_at desc", async () => {
      const { clientId, contactId } = await createCompany("Limite Ltda.");

      for (let index = 1; index <= 5; index += 1) {
        await createOpportunityFor(clientId, contactId, {
          name: `Oportunidade ${index}`,
        });
      }

      const rows = await repo.getRecentOpportunities();

      expect(rows).toHaveLength(4);
      expect(rows[0].name).toBe("Oportunidade 5");
      expect(rows[3].name).toBe("Oportunidade 2");
    });
  });
});
