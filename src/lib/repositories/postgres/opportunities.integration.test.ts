import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ClientsRepository, OpportunitiesRepository } from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/opportunities.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("opportunities no PostgreSQL real", () => {
  let client: Client;
  let repo: OpportunitiesRepository;
  let clientsRepo: ClientsRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./opportunities")).postgresOpportunitiesRepository;
    clientsRepo = (await import("./clients")).postgresClientsRepository;
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
    contactName = "Contato Base",
  ): Promise<{ clientId: string; contactId: string }> {
    const created = await clientsRepo.createClient({
      company_name: companyName,
      contacts: [{ full_name: contactName, is_primary: true }],
    });
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM contacts WHERE client_id = $1",
      [created.id],
    );
    return { clientId: created.id, contactId: rows[0].id };
  }

  const baseOpportunity = (clientId: string, contactId: string) => ({
    name: "Projeto de Integração",
    client_id: clientId,
    contact_id: contactId,
    value: "48000.50",
    budget: 55000,
    project_hours: "320",
    opened_at: "2026-10-01",
    expected_close_at: "",
  });

  describe("createOpportunity", () => {
    it("cria com valores padrão e preserva decimais como texto exato", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const created = await repo.createOpportunity(
        baseOpportunity(clientId, contactId),
      );

      expect(created!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created!.status).toBe("Em andamento");
      expect(created!.currency).toBe("BRL");
      expect(created!.opened_at).toBe("2026-10-01");
      // number 55000 é normalizado para texto; string "48000.50" é preservada.
      expect(created!.value).toBe("48000.50");
      expect(created!.budget).toBe("55000");
      expect(created!.project_hours).toBe("320");
      expect(created!.expected_close_at).toBeNull();
      expect(created!.loss_reason).toBeNull();
    });

    it("usa a data civil atual como abertura padrão", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const { opened_at, ...withoutOpenedAt } = baseOpportunity(
        clientId,
        contactId,
      );
      const created = await repo.createOpportunity(withoutOpenedAt);
      expect(created!.opened_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("retorna null quando o cliente está desativado", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      await clientsRepo.deactivateClient(clientId);
      expect(
        await repo.createOpportunity(baseOpportunity(clientId, contactId)),
      ).toBeNull();
    });

    it("retorna null quando o contato pertence a outro cliente", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const other = await createCompany("Outra Empresa S.A.", "Outro Contato");
      expect(
        await repo.createOpportunity({
          ...baseOpportunity(clientId, contactId),
          contact_id: other.contactId,
        }),
      ).toBeNull();
    });

    it("rejeita status Perdida sem motivo pela constraint do schema", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      await expect(
        repo.createOpportunity({
          ...baseOpportunity(clientId, contactId),
          status: "Perdida",
        }),
      ).rejects.toThrow(/loss_reason/);
    });

    it("rejeita valores negativos e moeda inválida pelo schema", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      await expect(
        repo.createOpportunity({
          ...baseOpportunity(clientId, contactId),
          value: "-1",
        }),
      ).rejects.toThrow(/nonnegative/);
      await expect(
        repo.createOpportunity({
          ...baseOpportunity(clientId, contactId),
          currency: "GBP",
        }),
      ).rejects.toThrow(/currency/);
    });
  });

  describe("changeOpportunityStatus", () => {
    it("altera status e motivo de perda, e retorna null para inexistente", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const created = await repo.createOpportunity(
        baseOpportunity(clientId, contactId),
      );

      const updated = await repo.changeOpportunityStatus(
        created!.id,
        "Perdida",
        "Preço",
      );
      expect(updated).toMatchObject({ id: created!.id });

      const { rows } = await client.query<{
        status: string;
        loss_reason: string | null;
      }>("SELECT status, loss_reason FROM opportunities WHERE id = $1", [
        created!.id,
      ]);
      expect(rows[0]).toEqual({ status: "Perdida", loss_reason: "Preço" });

      expect(
        await repo.changeOpportunityStatus(
          "00000000-0000-4000-8000-000000000000",
          "Ganha",
          null,
        ),
      ).toBeNull();
    });
  });

  describe("updateOpportunity", () => {
    it("atualiza campos informados e preserva os demais", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const created = await repo.createOpportunity(
        baseOpportunity(clientId, contactId),
      );

      const updated = await repo.updateOpportunity(created!.id, {
        name: "Projeto Renomeado",
        client_id: clientId,
        contact_id: contactId,
        status: "Proposta",
        expected_close_at: "",
      });

      expect(updated!.name).toBe("Projeto Renomeado");
      expect(updated!.status).toBe("Proposta");
      expect(updated!.expected_close_at).toBeNull();
      expect(updated!.value).toBe("48000.50");
    });

    it("retorna null quando a associação cliente/contato é inválida", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const other = await createCompany("Outra Empresa S.A.", "Outro Contato");
      const created = await repo.createOpportunity(
        baseOpportunity(clientId, contactId),
      );

      const updated = await repo.updateOpportunity(created!.id, {
        name: "Tentativa",
        client_id: other.clientId,
        contact_id: contactId,
      });
      expect(updated).toBeNull();
    });
  });

  describe("getOpportunity", () => {
    it("retorna a oportunidade com cliente e contato resolvidos", async () => {
      const { clientId, contactId } = await createCompany("Empresa Base Ltda.");
      const created = await repo.createOpportunity(
        baseOpportunity(clientId, contactId),
      );

      const found = await repo.getOpportunity(created!.id);

      expect(found).toMatchObject({
        id: created!.id,
        company_name: "Empresa Base Ltda.",
        contact_name: "Contato Base",
        value: "48000.50",
      });
      expect(found!.contact_email).toBeNull();
      expect(found!.contact_phone).toBeNull();
    });

    it("retorna null quando a oportunidade não existe", async () => {
      expect(
        await repo.getOpportunity("00000000-0000-4000-8000-000000000000"),
      ).toBeNull();
    });
  });

  describe("listOpportunities", () => {
    it("busca texto ignorando acentos e caixa", async () => {
      const sp = await createCompany("São Paulo Ltda.", "José Silva");
      await repo.createOpportunity({
        ...baseOpportunity(sp.clientId, sp.contactId),
        name: "Projeto São Paulo",
      });

      expect(await repo.listOpportunities("JOSÉ", null, null)).toHaveLength(1);
      expect(
        await repo.listOpportunities("sao paulo", null, null),
      ).toHaveLength(1);
    });

    it("filtra por texto, cliente e status", async () => {
      const a = await createCompany("Empresa Base Ltda.");
      const b = await createCompany("Outra Empresa S.A.", "Outro Contato");
      await repo.createOpportunity(baseOpportunity(a.clientId, a.contactId));
      await repo.createOpportunity({
        ...baseOpportunity(b.clientId, b.contactId),
        name: "E-commerce Novo",
        status: "Proposta",
      });

      expect(await repo.listOpportunities(null, null, null)).toHaveLength(2);

      const byQuery = await repo.listOpportunities("e-commerce", null, null);
      expect(byQuery).toHaveLength(1);
      expect(byQuery[0].company_name).toBe("Outra Empresa S.A.");
      expect(byQuery[0].contact_name).toBe("Outro Contato");

      expect(await repo.listOpportunities(null, a.clientId, null)).toHaveLength(
        1,
      );
      expect(await repo.listOpportunities(null, null, "Proposta")).toHaveLength(
        1,
      );
    });
  });
});
