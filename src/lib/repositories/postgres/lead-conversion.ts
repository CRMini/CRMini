import { randomUUID } from "node:crypto";
import type { LeadConversionResult } from "../contracts";
import { getPostgresPool } from "./connection";

const nowUtc = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

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
    budget_currency: pick("budget_currency", lead.budget ? "BRL" : null),
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
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const leadResult = await client.query(
      "SELECT * FROM leads WHERE id = $1 AND is_active = 1",
      [id],
    );
    const lead = leadResult.rows[0] as Record<string, any> | undefined;
    if (!lead) throw new Error("LEAD_NOT_FOUND");

    const nameOf = async (
      table: string,
      reference: unknown,
    ): Promise<string | null> => {
      if (!reference) return null;
      const result = await client.query(
        `SELECT name FROM ${table} WHERE id = $1`,
        [String(reference)],
      );
      return (result.rows[0]?.name as string | undefined) ?? null;
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
      ? await nameOf("cities", lead.city_id)
      : await nameOf("cities", lead.contact_city_id);
    const contactState = sameAddress ? lead.state : lead.contact_state;
    const contactPostalCode = sameAddress
      ? lead.postal_code
      : lead.contact_postal_code;
    const contactCountry = sameAddress
      ? await nameOf("countries", lead.country_id)
      : await nameOf("countries", lead.contact_country_id);

    const clientId = randomUUID();
    await client.query(
      `INSERT INTO clients (id, company_name, trade_name, tax_id, industry,
         website, postal_code, street, street_number, complement, city, state,
         country, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        clientId,
        lead.company_name,
        lead.trade_name,
        lead.tax_id,
        await nameOf("industries", lead.industry_id),
        lead.website,
        lead.postal_code,
        lead.street,
        lead.street_number,
        lead.complement,
        await nameOf("cities", lead.city_id),
        lead.state,
        await nameOf("countries", lead.country_id),
        lead.description,
      ],
    );

    const contactId = randomUUID();
    const fullName = [lead.contact_first_name, lead.contact_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    await client.query(
      `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone,
         mobile, street, street_number, complement, neighborhood, city, state,
         postal_code, country, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1)`,
      [
        contactId,
        clientId,
        fullName,
        await nameOf("job_titles", lead.contact_job_title_id),
        lead.contact_email,
        lead.contact_phone,
        null,
        contactStreet,
        contactNumber,
        contactComplement,
        contactNeighborhood,
        contactCity,
        contactState,
        contactPostalCode,
        contactCountry,
      ],
    );

    const values = opportunityValues(lead, opportunity, clientId, contactId);
    const columns = Object.keys(values);
    const opportunityId = randomUUID();
    await client.query(
      `INSERT INTO opportunities (id, ${columns.join(", ")})
       VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(", ")})`,
      [opportunityId, ...columns.map((column) => values[column as keyof typeof values])],
    );

    const promoted = await client.query(
      `UPDATE leads
       SET status = 'Qualificado', opportunity_id = $1, converted_at = ${nowUtc},
         updated_at = ${nowUtc}
       WHERE id = $2 AND status IN ('Em contato', 'Qualificando')`,
      [opportunityId, id],
    );
    if (promoted.rowCount === 0) throw new Error("LEAD_NOT_CONVERTIBLE");

    await client.query("COMMIT");
    return {
      client_id: clientId,
      contact_id: contactId,
      opportunity_id: opportunityId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    if (message === "LEAD_NOT_FOUND" || message === "LEAD_NOT_CONVERTIBLE")
      return null;
    throw error;
  } finally {
    client.release();
  }
}
