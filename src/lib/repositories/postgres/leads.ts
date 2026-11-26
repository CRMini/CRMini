import { randomUUID } from "node:crypto";
import {
  LEAD_REFERENCE_TABLES,
  LEAD_REFERENCE_TYPES,
  sortLeadReferences,
  type LeadReference,
  type LeadReferenceType,
} from "@/lib/lead-references";
import {
  LEAD_WRITE_COLUMNS,
  toLeadRecord,
  toLeadUpdateRecord,
  type LeadWriteColumn,
} from "@/lib/lead-validation";
import type { LeadsRepository } from "../contracts";
import { getPostgresPool } from "./connection";
import { convertLead } from "./lead-conversion";

/**
 * Listagem de leads (somente ativos), equivalente ao adaptador SQLite. A busca
 * usa `crm_normalize` (definida em database/postgresql/init.sql) e o filtro de
 * status é opcional.
 */
export async function listLeads(
  search: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT l.id, l.company_name, l.trade_name, l.tax_id,
       l.contact_first_name, l.contact_last_name, l.contact_phone, l.contact_email,
       l.status, ls.name AS lead_source,
       ind.name AS industry, seg.name AS segment,
       c.name AS city, co.name AS country,
       l.updated_at
     FROM leads l
     LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id
     LEFT JOIN industries ind ON ind.id = l.industry_id
     LEFT JOIN segments seg ON seg.id = l.segment_id
     LEFT JOIN cities c ON c.id = l.city_id
     LEFT JOIN countries co ON co.id = l.country_id
     WHERE l.is_active = 1
       AND ($1::text IS NULL
         OR crm_normalize(l.company_name) LIKE '%' || crm_normalize($1::text) || '%'
         OR crm_normalize(l.trade_name) LIKE '%' || crm_normalize($1::text) || '%'
         OR crm_normalize(l.contact_first_name) LIKE '%' || crm_normalize($1::text) || '%'
         OR crm_normalize(l.contact_last_name) LIKE '%' || crm_normalize($1::text) || '%'
         OR crm_normalize(l.tax_id) LIKE '%' || crm_normalize($1::text) || '%')
       AND ($2::text IS NULL OR l.status = $2::text)
     ORDER BY l.updated_at DESC`,
    [search, status],
  );
  return result.rows;
}

export async function listLeadReferences(): Promise<
  Record<LeadReferenceType, LeadReference[]>
> {
  const pool = getPostgresPool();
  const references = {} as Record<LeadReferenceType, LeadReference[]>;
  for (const type of LEAD_REFERENCE_TYPES) {
    const result = await pool.query<LeadReference>(
      `SELECT id, name FROM ${LEAD_REFERENCE_TABLES[type]}`,
    );
    references[type] = sortLeadReferences(result.rows);
  }
  return references;
}

export async function createLeadReference(
  type: LeadReferenceType,
  name: string,
): Promise<LeadReference | null> {
  try {
    const result = await getPostgresPool().query<LeadReference>(
      `INSERT INTO ${LEAD_REFERENCE_TABLES[type]} (id, name) VALUES ($1, $2)
       RETURNING id, name`,
      [randomUUID(), name.trim()],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
}

export async function createLead(
  body: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const record = toLeadRecord(randomUUID(), body);
  const columns: Array<LeadWriteColumn | "id"> = ["id", ...LEAD_WRITE_COLUMNS];
  const result = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO leads (${columns.join(", ")}) VALUES (${columns
      .map((_, index) => `$${index + 1}`)
      .join(", ")}) RETURNING id`,
    columns.map((column) => record[column]),
  );
  return result.rows[0] ?? null;
}

export async function getLead(
  id: string,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query(
    "SELECT * FROM leads WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateLead(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const record = toLeadUpdateRecord(body);
  const columns = Object.keys(record) as Array<keyof typeof record>;
  const result = await getPostgresPool().query(
    `UPDATE leads
     SET ${columns.map((column, index) => `${column} = $${index + 1}`).join(", ")},
       updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     WHERE id = $${columns.length + 1}
     RETURNING *`,
    [...columns.map((column) => record[column]), id],
  );
  return result.rows[0] ?? null;
}

export const postgresLeadsRepository: LeadsRepository = {
  listLeads,
  listLeadReferences,
  createLeadReference,
  createLead,
  getLead,
  updateLead,
  convertLead,
};
