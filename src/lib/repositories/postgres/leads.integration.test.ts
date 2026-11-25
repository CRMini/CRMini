import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { LeadsRepository } from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/leads.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

// industries e segments começam vazias (sem seed), então os testes criam uma
// entrada de cada para satisfazer as FKs NOT NULL de `leads`.
const industryId = "industry-tecnologia";
const segmentId = "segment-enterprise";

const leadColumns = [
  "id",
  "company_name",
  "trade_name",
  "tax_id",
  "industry_id",
  "segment_id",
  "revenue_band",
  "employee_band",
  "street",
  "street_number",
  "neighborhood",
  "city_id",
  "state",
  "postal_code",
  "country_id",
  "lead_source_id",
  "contact_first_name",
  "contact_last_name",
  "contact_phone",
  "contact_email",
  "contact_job_title_id",
  "status",
  "disqualification_reason",
  "opportunity_id",
  "converted_at",
  "budget",
  "is_active",
] as const;

describe.runIf(Boolean(testUrl))("leads no PostgreSQL real", () => {
  let client: Client;
  let repo: LeadsRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./leads")).postgresLeadsRepository;
  });

  beforeEach(async () => {
    // `leads` (RESTRICT em opportunities) precisa sair antes de opportunities;
    // industries/segments ficam por último porque `leads` os referencia.
    await client.query(
      "DELETE FROM leads; DELETE FROM events; DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients; DELETE FROM industries; DELETE FROM segments;",
    );
    await client.query("INSERT INTO industries (id, name) VALUES ($1, $2)", [
      industryId,
      "Tecnologia",
    ]);
    await client.query("INSERT INTO segments (id, name) VALUES ($1, $2)", [
      segmentId,
      "Enterprise",
    ]);
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

  function baseLead(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: randomUUID(),
      company_name: "Empresa Base Ltda.",
      trade_name: "Base",
      tax_id: "12345678000190",
      industry_id: industryId,
      segment_id: segmentId,
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
      contact_first_name: null,
      contact_last_name: null,
      contact_phone: null,
      contact_email: null,
      contact_job_title_id: null,
      status: "Novo",
      disqualification_reason: null,
      opportunity_id: null,
      converted_at: null,
      budget: null,
      is_active: 1,
      ...overrides,
    };
  }

  async function insertLead(
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const row = baseLead(overrides);
    await client.query(
      `INSERT INTO leads (${leadColumns.join(", ")})
       VALUES (${leadColumns.map((_, index) => `$${index + 1}`).join(", ")})`,
      leadColumns.map((column) => row[column]),
    );
    return row;
  }

  describe("listLeads", () => {
    it("retorna lista vazia quando não há leads", async () => {
      expect(await repo.listLeads(null, null)).toEqual([]);
    });

    it("ordena por updated_at em ordem decrescente", async () => {
      const older = await insertLead({ company_name: "Mais Antigo Ltda." });
      const newer = await insertLead({ company_name: "Mais Recente Ltda." });
      await client.query("UPDATE leads SET updated_at = $1 WHERE id = $2", [
        "2026-01-01T00:00:00.000Z",
        older.id,
      ]);
      await client.query("UPDATE leads SET updated_at = $1 WHERE id = $2", [
        "2026-02-01T00:00:00.000Z",
        newer.id,
      ]);

      const rows = await repo.listLeads(null, null);

      expect(rows.map((row) => row.company_name)).toEqual([
        "Mais Recente Ltda.",
        "Mais Antigo Ltda.",
      ]);
    });

    it("busca por razão social e nome do contato ignorando caixa e acento", async () => {
      await insertLead({ company_name: "São Paulo Consultoria Ltda." });
      await insertLead({ contact_first_name: "José", contact_last_name: "Silva" });

      expect(await repo.listLeads("sao paulo", null)).toHaveLength(1);
      expect(await repo.listLeads("JOSE", null)).toHaveLength(1);
    });

    it("filtra por status", async () => {
      await insertLead({ status: "Novo" });
      await insertLead({ status: "Em contato" });

      expect(await repo.listLeads(null, "Em contato")).toHaveLength(1);
    });

    it("não lista leads desativados (is_active = 0)", async () => {
      await insertLead({ company_name: "Inativo Ltda.", is_active: 0 });
      await insertLead({ company_name: "Ativo Ltda." });

      const rows = await repo.listLeads(null, null);

      expect(rows).toHaveLength(1);
      expect(rows[0].company_name).toBe("Ativo Ltda.");
    });

    it("resolve os nomes das referências via LEFT JOIN", async () => {
      await insertLead({ lead_source_id: "lead-source-linkedin" });

      const rows = await repo.listLeads(null, null);

      expect(rows[0]).toMatchObject({
        lead_source: "LinkedIn",
        industry: "Tecnologia",
        segment: "Enterprise",
        city: "São Paulo",
        country: "Brasil",
      });
    });
  });

  describe("restrições do schema", () => {
    it("rejeita status inválido", async () => {
      await expect(insertLead({ status: "Inválido" })).rejects.toThrow(
        /leads_status_check/,
      );
    });

    it("exige motivo quando o lead está desqualificado", async () => {
      await expect(
        insertLead({
          status: "Desqualificado",
          disqualification_reason: null,
        }),
      ).rejects.toThrow(/lead_disqualification_reason_check/);
    });

    it("exige opportunity_id e converted_at quando o status é Qualificado", async () => {
      await expect(insertLead({ status: "Qualificado" })).rejects.toThrow(
        /lead_conversion_biconditional/,
      );
    });

    it("rejeita budget não canônico ou negativo", async () => {
      await expect(insertLead({ budget: "-100" })).rejects.toThrow(
        /lead_budget_nonnegative/,
      );
      await expect(insertLead({ budget: "1,5" })).rejects.toThrow(
        /lead_budget_nonnegative/,
      );
    });

    it("rejeita cargo inexistente em job_titles", async () => {
      await expect(
        insertLead({ contact_job_title_id: "job-title-inexistente" }),
      ).rejects.toThrow(/leads_contact_job_title_id_fkey/);
    });
  });

  describe("referências", () => {
    it("devolve as seis listas com os seeds", async () => {
      const references = await repo.listLeadReferences();

      expect(Object.keys(references).sort()).toEqual([
        "cities",
        "countries",
        "industries",
        "job_titles",
        "lead_sources",
        "segments",
      ]);
      expect(references.lead_sources).toContainEqual({
        id: "lead-source-site",
        name: "Site",
      });
      expect(references.cities).toContainEqual({
        id: "city-sao-paulo",
        name: "São Paulo",
      });
    });

    it("cria uma opção e recusa duplicata", async () => {
      const created = await repo.createLeadReference(
        "industries",
        "Saúde",
      );

      expect(created).toMatchObject({ name: "Saúde" });
      expect(await repo.createLeadReference("industries", "Saúde")).toBeNull();
    });
  });

  describe("createLead", () => {
    it("cria o lead em Novo e devolve o id", async () => {
      const created = await repo.createLead({
        company_name: "Empresa Alfa Ltda.",
        trade_name: "Alfa",
        tax_id: "11222333000181",
        industry_id: industryId,
        segment_id: segmentId,
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
      });

      expect(created?.id).toBeTruthy();

      const rows = await repo.listLeads(null, null);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        company_name: "Empresa Alfa Ltda.",
        status: "Novo",
        lead_source: "Site",
      });
    });

    it("propaga violação de FK para referência inexistente", async () => {
      await expect(
        repo.createLead({
          company_name: "Empresa Alfa Ltda.",
          trade_name: "Alfa",
          tax_id: "11222333000181",
          industry_id: "industry-inexistente",
          segment_id: segmentId,
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
        }),
      ).rejects.toThrow(/foreign key/i);
    });
  });
});
