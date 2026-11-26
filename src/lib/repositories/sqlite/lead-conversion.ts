import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { LeadConversionResult } from "../contracts";

/**
 * Normaliza a oportunidade da conversão: campos do corpo prevalecem; quando
 * ausentes, herdam o que o lead já qualificou. Valores vazios viram nulo e
 * decimais viram TEXT canônico, como no repositório de oportunidades.
 */
function opportunityValues(
  lead: Record<string, any>,
  body: Record<string, unknown>,
  clientId: string,
  contactId: string,
) {
  const pick = (key: string, fallback: unknown = null): unknown => {
    const value = body[key];
    if (value !== undefined && value !== null && value !== "") return value;
    return fallback ?? null;
  };
  const decimal = (value: unknown) =>
    value === null || value === undefined || value === ""
      ? null
      : String(value);

  return {
    name: String(body.name).trim(),
    client_id: clientId,
    contact_id: contactId,
    technology: pick("technology"),
    value: decimal(pick("value")),
    currency: pick("currency", "BRL"),
    service_type: pick("service_type"),
    resources: pick("resources"),
    budget: decimal(pick("budget", lead.budget)),
    budget_currency: pick(
      "budget_currency",
      lead.budget ? "BRL" : null,
    ),
    notes: pick("notes", lead.contact_history),
    customer_need: pick("customer_need", lead.identified_pain),
    offered_solution: pick("offered_solution", lead.desired_solution),
    project_hours: decimal(pick("project_hours")),
    opened_at: pick("opened_at", new Date().toISOString().slice(0, 10)),
    expected_close_at: pick("expected_close_at"),
    status: pick("status", "Em andamento"),
    loss_reason: pick("loss_reason"),
  };
}

export async function convertLead(
  id: string,
  opportunity: Record<string, unknown>,
): Promise<LeadConversionResult | null> {
  const db = getDb();

  const run = db.transaction((): LeadConversionResult => {
    const lead = db
      .prepare("SELECT * FROM leads WHERE id = ? AND is_active = 1")
      .get(id) as Record<string, any> | undefined;
    if (!lead) throw new Error("LEAD_NOT_FOUND");

    const nameOf = (table: string, reference: unknown): string | null => {
      if (!reference) return null;
      const row = db
        .prepare(`SELECT name FROM ${table} WHERE id = ?`)
        .get(String(reference)) as { name: string } | undefined;
      return row?.name ?? null;
    };

    const sameAddress = Number(lead.contact_same_address) === 1;
    const contactStreet = sameAddress ? lead.street : lead.contact_street;
    const contactNumber = sameAddress
      ? lead.street_number
      : lead.contact_street_number;
    const contactComplement = sameAddress
      ? lead.complement
      : lead.contact_complement;
    const contactNeighborhood = sameAddress
      ? lead.neighborhood
      : lead.contact_neighborhood;
    const contactCity = sameAddress
      ? nameOf("cities", lead.city_id)
      : nameOf("cities", lead.contact_city_id);
    const contactState = sameAddress ? lead.state : lead.contact_state;
    const contactPostalCode = sameAddress
      ? lead.postal_code
      : lead.contact_postal_code;
    const contactCountry = sameAddress
      ? nameOf("countries", lead.country_id)
      : nameOf("countries", lead.contact_country_id);

    const clientId = randomUUID();
    db.prepare(
      `INSERT INTO clients (id, company_name, trade_name, tax_id, industry,
         segment, revenue_band, employee_band, website, postal_code, street,
         street_number, complement, neighborhood, lead_source, city, state,
         country, notes)
       VALUES (@id, @company_name, @trade_name, @tax_id, @industry, @segment,
         @revenue_band, @employee_band, @website, @postal_code, @street,
         @street_number, @complement, @neighborhood, @lead_source, @city,
         @state, @country, @notes)`,
    ).run({
      id: clientId,
      company_name: lead.company_name,
      trade_name: lead.trade_name,
      tax_id: lead.tax_id,
      industry: nameOf("industries", lead.industry_id),
      segment: nameOf("segments", lead.segment_id),
      revenue_band: lead.revenue_band,
      employee_band: lead.employee_band,
      website: lead.website,
      postal_code: lead.postal_code,
      street: lead.street,
      street_number: lead.street_number,
      complement: lead.complement,
      neighborhood: lead.neighborhood,
      lead_source: nameOf("lead_sources", lead.lead_source_id),
      city: nameOf("cities", lead.city_id),
      state: lead.state,
      country: nameOf("countries", lead.country_id),
      notes: lead.description,
    });

    const contactId = randomUUID();
    const fullName = [lead.contact_first_name, lead.contact_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    db.prepare(
      `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone,
         mobile, street, street_number, complement, neighborhood, city, state,
         postal_code, country, is_primary)
       VALUES (@id, @client_id, @full_name, @job_title, @email, @phone,
         @mobile, @street, @street_number, @complement, @neighborhood, @city,
         @state, @postal_code, @country, 1)`,
    ).run({
      id: contactId,
      client_id: clientId,
      full_name: fullName,
      job_title: nameOf("job_titles", lead.contact_job_title_id),
      email: lead.contact_email,
      phone: lead.contact_phone,
      mobile: null,
      street: contactStreet,
      street_number: contactNumber,
      complement: contactComplement,
      neighborhood: contactNeighborhood,
      city: contactCity,
      state: contactState,
      postal_code: contactPostalCode,
      country: contactCountry,
    });

    const values = opportunityValues(lead, opportunity, clientId, contactId);
    const opportunityId = randomUUID();
    db.prepare(
      `INSERT INTO opportunities (id, name, client_id, contact_id, technology,
         value, currency, service_type, resources, budget, budget_currency,
         notes, customer_need, offered_solution, project_hours, opened_at,
         expected_close_at, status, loss_reason)
       VALUES (@id, @name, @client_id, @contact_id, @technology, @value,
         @currency, @service_type, @resources, @budget, @budget_currency,
         @notes, @customer_need, @offered_solution, @project_hours, @opened_at,
         @expected_close_at, @status, @loss_reason)`,
    ).run({ id: opportunityId, ...values });

    const promoted = db
      .prepare(
        `UPDATE leads
         SET status = 'Qualificado', opportunity_id = ?,
           converted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?
           AND status IN ('Em contato', 'Qualificando')`,
      )
      .run(opportunityId, id);
    if (promoted.changes === 0) throw new Error("LEAD_NOT_CONVERTIBLE");

    return {
      client_id: clientId,
      contact_id: contactId,
      opportunity_id: opportunityId,
    };
  });

  try {
    return run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "LEAD_NOT_FOUND" || message === "LEAD_NOT_CONVERTIBLE")
      return null;
    throw error;
  }
}
