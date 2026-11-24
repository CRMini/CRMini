import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import { listLeads } from "./leads";

// industries e segments começam vazias (sem seed), então os testes criam uma
// entrada de cada para satisfazer as FKs NOT NULL de `leads`.
const industryId = "industry-tecnologia";
const segmentId = "segment-enterprise";

function cleanTables() {
  getDb().exec(
    "DELETE FROM leads; DELETE FROM events; DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

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

function insertLead(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const row = baseLead(overrides);
  getDb()
    .prepare(
      `INSERT INTO leads (id, company_name, trade_name, tax_id, industry_id, segment_id,
         revenue_band, employee_band, street, street_number, neighborhood, city_id, state,
         postal_code, country_id, lead_source_id, contact_first_name, contact_last_name,
         contact_phone, contact_email, contact_job_title_id, status, disqualification_reason,
         opportunity_id, converted_at, budget, is_active)
       VALUES (@id, @company_name, @trade_name, @tax_id, @industry_id, @segment_id,
         @revenue_band, @employee_band, @street, @street_number, @neighborhood, @city_id, @state,
         @postal_code, @country_id, @lead_source_id, @contact_first_name, @contact_last_name,
         @contact_phone, @contact_email, @contact_job_title_id, @status,
         @disqualification_reason, @opportunity_id, @converted_at, @budget, @is_active)`,
    )
    .run(row);
  return row;
}

function insertOpportunity(): string {
  const clientId = randomUUID();
  const contactId = randomUUID();
  getDb()
    .prepare("INSERT INTO clients (id, company_name) VALUES (?, ?)")
    .run(clientId, "Cliente do Lead Teste");
  getDb()
    .prepare(
      "INSERT INTO contacts (id, client_id, full_name) VALUES (?, ?, ?)",
    )
    .run(contactId, clientId, "Contato do Lead Teste");
  const opportunityId = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO opportunities (id, name, client_id, contact_id) VALUES (?, ?, ?, ?)",
    )
    .run(opportunityId, "Oportunidade do Lead Teste", clientId, contactId);
  return opportunityId;
}

beforeAll(() => {
  getDb()
    .prepare("INSERT OR IGNORE INTO industries (id, name) VALUES (?, ?)")
    .run(industryId, "Tecnologia");
  getDb()
    .prepare("INSERT OR IGNORE INTO segments (id, name) VALUES (?, ?)")
    .run(segmentId, "Enterprise");
});

beforeEach(() => {
  cleanTables();
});

describe("listLeads", () => {
  it("retorna lista vazia quando não há leads", async () => {
    expect(await listLeads(null, null)).toEqual([]);
  });

  it("ordena por updated_at em ordem decrescente", async () => {
    const older = insertLead({ company_name: "Mais Antigo Ltda." });
    const newer = insertLead({ company_name: "Mais Recente Ltda." });
    getDb()
      .prepare("UPDATE leads SET updated_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", older.id);
    getDb()
      .prepare("UPDATE leads SET updated_at = ? WHERE id = ?")
      .run("2026-02-01T00:00:00.000Z", newer.id);

    const rows = await listLeads(null, null);

    expect(rows.map((row) => row.company_name)).toEqual([
      "Mais Recente Ltda.",
      "Mais Antigo Ltda.",
    ]);
  });

  it("busca por razão social", async () => {
    insertLead({ company_name: "Alfa Beta Ltda." });

    const rows = await listLeads("alfa beta", null);

    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe("Alfa Beta Ltda.");
  });

  it("busca por nome fantasia", async () => {
    insertLead({ trade_name: "Fantasia Zeta" });

    expect(await listLeads("fantasia", null)).toHaveLength(1);
  });

  it("busca por nome e sobrenome do contato ignorando acentos e caixa", async () => {
    insertLead({ contact_first_name: "João", contact_last_name: "Silva" });

    expect(await listLeads("joao", null)).toHaveLength(1);
    expect(await listLeads("SILVA", null)).toHaveLength(1);
  });

  it("busca por CNPJ", async () => {
    insertLead({ tax_id: "99988877766655" });

    expect(await listLeads("888777", null)).toHaveLength(1);
  });

  it("filtra por status", async () => {
    insertLead({ status: "Novo" });
    insertLead({ status: "Em contato" });

    expect(await listLeads(null, "Em contato")).toHaveLength(1);
  });

  it("não lista leads desativados (is_active = 0)", async () => {
    insertLead({ company_name: "Inativo Ltda.", is_active: 0 });
    insertLead({ company_name: "Ativo Ltda." });

    const rows = await listLeads(null, null);

    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe("Ativo Ltda.");
  });

  it("resolve os nomes das referências via LEFT JOIN", async () => {
    insertLead({ lead_source_id: "lead-source-linkedin" });

    const rows = await listLeads(null, null);

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
  it("rejeita status inválido", () => {
    expect(() => insertLead({ status: "Inválido" })).toThrow(/status/);
  });

  it("exige motivo quando o lead está desqualificado", () => {
    expect(() =>
      insertLead({ status: "Desqualificado", disqualification_reason: null }),
    ).toThrow(/disqualification_reason/);
  });

  it("proíbe motivo de desqualificação quando o status não é Desqualificado", () => {
    expect(() =>
      insertLead({ status: "Novo", disqualification_reason: "Prazo" }),
    ).toThrow(/disqualification_reason/);
  });

  it("exige opportunity_id e converted_at quando o status é Qualificado", () => {
    expect(() => insertLead({ status: "Qualificado" })).toThrow(
      /conversion_biconditional/,
    );
  });

  it("proíbe opportunity_id/converted_at quando o status não é Qualificado", () => {
    const opportunityId = insertOpportunity();

    expect(() =>
      insertLead({
        opportunity_id: opportunityId,
        converted_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(/conversion_biconditional/);
  });

  it("impede dois leads com a mesma oportunidade", () => {
    const opportunityId = insertOpportunity();
    insertLead({
      status: "Qualificado",
      opportunity_id: opportunityId,
      converted_at: "2026-01-01T00:00:00.000Z",
    });

    expect(() =>
      insertLead({
        status: "Qualificado",
        opportunity_id: opportunityId,
        converted_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(/UNIQUE/);
  });

  it("rejeita budget negativo", () => {
    expect(() => insertLead({ budget: "-100" })).toThrow(/nonnegative/);
  });

  it("rejeita cargo inexistente em job_titles", () => {
    expect(() =>
      insertLead({ contact_job_title_id: "job-title-inexistente" }),
    ).toThrow(/FOREIGN KEY/);
  });
});
