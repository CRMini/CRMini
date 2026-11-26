import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import {
  createLead,
  createLeadReference,
  getLead,
  listLeadReferences,
  listLeads,
  updateLead,
} from "./leads";

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

  it("filtra por um ou vários status", async () => {
    insertLead({ status: "Novo" });
    insertLead({ status: "Em contato" });
    insertLead({ status: "Qualificando" });

    expect(await listLeads(null, ["Em contato"])).toHaveLength(1);
    expect(
      await listLeads(null, ["Novo", "Qualificando"]),
    ).toHaveLength(2);
    expect(await listLeads(null, [])).toHaveLength(3);
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

describe("listLeadReferences", () => {
  it("devolve as seis listas de referência", async () => {
    const references = await listLeadReferences();

    expect(Object.keys(references).sort()).toEqual([
      "cities",
      "countries",
      "industries",
      "job_titles",
      "lead_sources",
      "segments",
    ]);
  });

  it("traz os seeds de cidade, país, cargo e origem", async () => {
    const references = await listLeadReferences();

    expect(references.cities).toContainEqual({
      id: "city-sao-paulo",
      name: "São Paulo",
    });
    expect(references.countries).toContainEqual({
      id: "country-brasil",
      name: "Brasil",
    });
    expect(references.job_titles).toContainEqual({
      id: "job-title-gerente-de-ti",
      name: "Gerente de TI",
    });
    expect(references.lead_sources).toContainEqual({
      id: "lead-source-outro",
      name: "Outro",
    });
  });

  it("ordena as listas em português", async () => {
    getDb()
      .prepare("INSERT INTO countries (id, name) VALUES (?, ?)")
      .run("country-austria-teste", "Áustria");

    const references = await listLeadReferences();
    const names = references.countries.map((country) => country.name);

    expect(names).toEqual(["Áustria", "Brasil", "México"]);

    getDb()
      .prepare("DELETE FROM countries WHERE id = ?")
      .run("country-austria-teste");
  });
});

describe("createLeadReference", () => {
  it("cria a opção e devolve id e nome", async () => {
    const created = await createLeadReference("industries", "Saúde");

    expect(created).toMatchObject({ name: "Saúde" });
    expect(created?.id).toBeTruthy();
    expect(
      getDb()
        .prepare("SELECT name FROM industries WHERE id = ?")
        .get(created?.id),
    ).toEqual({ name: "Saúde" });

    getDb()
      .prepare("DELETE FROM industries WHERE id = ?")
      .run(created?.id);
  });

  it("grava o nome sem espaços nas pontas", async () => {
    const created = await createLeadReference("segments", "  Varejo  ");

    expect(created?.name).toBe("Varejo");

    getDb()
      .prepare("DELETE FROM segments WHERE id = ?")
      .run(created?.id);
  });

  it("devolve null quando a opção já existe", async () => {
    expect(
      await createLeadReference("cities", "São Paulo"),
    ).toBeNull();
  });
});

const validLead = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

describe("createLead", () => {
  it("cria o lead em Novo e devolve o id", async () => {
    const created = await createLead(validLead());

    expect(created?.id).toBeTruthy();
    expect(
      getDb()
        .prepare(
          "SELECT company_name, status, tax_id FROM leads WHERE id = ?",
        )
        .get(created?.id),
    ).toEqual({
      company_name: "Empresa Alfa Ltda.",
      status: "Novo",
      tax_id: "11222333000181",
    });
  });

  it("persiste os campos opcionais informados", async () => {
    const created = await createLead(
      validLead({
        contact_first_name: "Marina",
        contact_email: "marina@example.com",
        contact_job_title_id: "job-title-gerente-de-ti",
        budget: "1234.56",
        priority: "Alta",
        contact_same_address: 0,
        contact_street: "Rua do Contato",
        contact_street_number: "20",
        contact_neighborhood: "Centro",
        contact_city_id: "city-santo-andre",
        contact_postal_code: "09000-000",
        contact_country_id: "country-brasil",
      }),
    );

    expect(
      getDb()
        .prepare(
          `SELECT contact_first_name, contact_email, contact_job_title_id,
             budget, priority, contact_same_address, contact_city_id
           FROM leads WHERE id = ?`,
        )
        .get(created?.id),
    ).toEqual({
      contact_first_name: "Marina",
      contact_email: "marina@example.com",
      contact_job_title_id: "job-title-gerente-de-ti",
      budget: "1234.56",
      priority: "Alta",
      contact_same_address: 0,
      contact_city_id: "city-santo-andre",
    });
  });

  it("propaga violação de FK quando a referência não existe", async () => {
    await expect(
      createLead(validLead({ industry_id: "industry-inexistente" })),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe("getLead", () => {
  it("devolve o lead pelo id", async () => {
    const created = insertLead({ company_name: "Empresa Buscada Ltda." });

    const found = await getLead(String(created.id));

    expect(found?.company_name).toBe("Empresa Buscada Ltda.");
    expect(found?.status).toBe("Novo");
  });

  it("devolve null quando o lead não existe", async () => {
    expect(await getLead("lead-inexistente")).toBeNull();
  });
});

describe("updateLead", () => {
  it("edita campos e mantém o status atual", async () => {
    const created = await createLead(validLead());

    const updated = await updateLead(created!.id, {
      ...validLead({ company_name: "Empresa Editada Ltda." }),
      status: "Novo",
    });

    expect(updated?.company_name).toBe("Empresa Editada Ltda.");
    expect(updated?.status).toBe("Novo");
  });

  it("grava a mudança de status e o motivo da desqualificação", async () => {
    const created = await createLead(validLead());

    const updated = await updateLead(created!.id, {
      ...validLead(),
      status: "Desqualificado",
      disqualification_reason: "Prazo",
    });

    expect(updated?.status).toBe("Desqualificado");
    expect(updated?.disqualification_reason).toBe("Prazo");
  });

  it("devolve null quando o lead não existe", async () => {
    expect(
      await updateLead("lead-inexistente", { ...validLead(), status: "Novo" }),
    ).toBeNull();
  });
});
