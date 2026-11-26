import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import { convertLead, createLead, getLead, updateLead } from "./leads";

const industryId = "industry-conversao";
const segmentId = "segment-conversao";

function cleanTables() {
  getDb().exec(
    "DELETE FROM leads; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

const leadBody = (overrides: Record<string, unknown> = {}) => ({
  company_name: "Empresa Converte Ltda.",
  trade_name: "Converte",
  tax_id: "11222333000181",
  industry_id: industryId,
  segment_id: segmentId,
  revenue_band: "Até R$ 10 milhões",
  employee_band: "1-50",
  street: "Rua da Empresa",
  street_number: "10",
  complement: "Sala 1",
  neighborhood: "Centro",
  city_id: "city-sao-paulo",
  state: "SP",
  postal_code: "01000-000",
  country_id: "country-brasil",
  lead_source_id: "lead-source-site",
  contact_first_name: "Marina",
  contact_last_name: "Costa",
  contact_email: "marina@example.com",
  contact_phone: "(11) 90000-0001",
  contact_job_title_id: "job-title-gerente-de-ti",
  contact_same_address: 1,
  desired_solution: "Migração de ERP",
  identified_pain: "Sistemas legados",
  budget: "250000.00",
  ...overrides,
});

async function leadIn(
  status: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await createLead(leadBody(overrides));
  await updateLead(created!.id, { ...leadBody(overrides), status });
  return created!.id;
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

describe("conversão do lead", () => {
  it("cria empresa, contato e oportunidade e promove o lead", async () => {
    const id = await leadIn("Em contato");

    const result = await convertLead(id, { name: "Oportunidade ERP" });

    expect(result).not.toBeNull();
    expect(result?.client_id).toBeTruthy();
    expect(result?.contact_id).toBeTruthy();
    expect(result?.opportunity_id).toBeTruthy();

    const lead = await getLead(id);
    expect(lead?.status).toBe("Qualificado");
    expect(lead?.opportunity_id).toBe(result?.opportunity_id);
    expect(lead?.converted_at).toBeTruthy();

    const client = getDb()
      .prepare("SELECT company_name, trade_name, tax_id, industry, city, state FROM clients WHERE id = ?")
      .get(result!.client_id);
    expect(client).toEqual({
      company_name: "Empresa Converte Ltda.",
      trade_name: "Converte",
      tax_id: "11222333000181",
      industry: "Tecnologia",
      city: "São Paulo",
      state: "SP",
    });

    const contact = getDb()
      .prepare(
        "SELECT full_name, job_title, email, is_primary, street, city, state FROM contacts WHERE id = ?",
      )
      .get(result!.contact_id);
    expect(contact).toEqual({
      full_name: "Marina Costa",
      job_title: "Gerente de TI",
      email: "marina@example.com",
      is_primary: 1,
      street: "Rua da Empresa",
      city: "São Paulo",
      state: "SP",
    });

    const opportunity = getDb()
      .prepare(
        "SELECT name, status, customer_need, offered_solution, budget, client_id, contact_id FROM opportunities WHERE id = ?",
      )
      .get(result!.opportunity_id);
    expect(opportunity).toEqual({
      name: "Oportunidade ERP",
      status: "Em andamento",
      customer_need: "Sistemas legados",
      offered_solution: "Migração de ERP",
      budget: "250000.00",
      client_id: result!.client_id,
      contact_id: result!.contact_id,
    });
  });

  it("usa o endereço do contato quando ele é diferente do da empresa", async () => {
    const id = await leadIn("Qualificando", {
      contact_same_address: 0,
      contact_street: "Rua do Contato",
      contact_street_number: "20",
      contact_neighborhood: "Vila",
      contact_city_id: "city-santo-andre",
      contact_state: "SP",
      contact_postal_code: "09000-000",
      contact_country_id: "country-brasil",
    });

    const result = await convertLead(id, {
      name: "Oportunidade Contato",
    });

    const contact = getDb()
      .prepare(
        "SELECT street, street_number, neighborhood, city, postal_code FROM contacts WHERE id = ?",
      )
      .get(result!.contact_id);
    expect(contact).toEqual({
      street: "Rua do Contato",
      street_number: "20",
      neighborhood: "Vila",
      city: "Santo André",
      postal_code: "09000-000",
    });
  });

  it("devolve null e não cria nada quando o status não permite converter", async () => {
    const id = await leadIn("Novo");
    const before = {
      clients: getDb().prepare("SELECT count(*) c FROM clients").get().c,
      opportunities: getDb()
        .prepare("SELECT count(*) c FROM opportunities")
        .get().c,
    };

    const result = await convertLead(id, { name: "Oportunidade" });

    expect(result).toBeNull();
    expect(
      getDb().prepare("SELECT count(*) c FROM clients").get().c,
    ).toBe(before.clients);
    expect(
      getDb().prepare("SELECT count(*) c FROM opportunities").get().c,
    ).toBe(before.opportunities);
    expect((await getLead(id))?.status).toBe("Novo");
  });

  it("devolve null quando o lead não existe", async () => {
    expect(await convertLead("lead-inexistente", { name: "X" })).toBeNull();
  });
});
