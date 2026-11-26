import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
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
} from "@/lib/lead-validation";
import type { LeadsRepository } from "../contracts";

/**
 * Listagem de leads (somente ativos), com as referências resolvidas por LEFT
 * JOIN. A busca textual usa a função `normalize` registrada em src/lib/db.ts
 * (minúsculas e sem acentos), cobrindo razão social, nome fantasia, nome e
 * sobrenome do contato e CNPJ. O filtro de status é opcional.
 */
export async function listLeads(
  search: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getDb()
    .prepare(
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
         AND (@search IS NULL
           OR normalize(l.company_name) LIKE '%' || normalize(@search) || '%'
           OR normalize(l.trade_name) LIKE '%' || normalize(@search) || '%'
           OR normalize(l.contact_first_name) LIKE '%' || normalize(@search) || '%'
           OR normalize(l.contact_last_name) LIKE '%' || normalize(@search) || '%'
           OR normalize(l.tax_id) LIKE '%' || normalize(@search) || '%')
         AND (@status IS NULL OR l.status = @status)
       ORDER BY l.updated_at DESC`,
    )
    .all({ search, status }) as Record<string, any>[];
}

export async function listLeadReferences(): Promise<
  Record<LeadReferenceType, LeadReference[]>
> {
  const db = getDb();
  const references = {} as Record<LeadReferenceType, LeadReference[]>;
  for (const type of LEAD_REFERENCE_TYPES) {
    const rows = db
      .prepare(`SELECT id, name FROM ${LEAD_REFERENCE_TABLES[type]}`)
      .all() as LeadReference[];
    references[type] = sortLeadReferences(rows);
  }
  return references;
}

export async function createLeadReference(
  type: LeadReferenceType,
  name: string,
): Promise<LeadReference | null> {
  const reference: LeadReference = { id: randomUUID(), name: name.trim() };
  try {
    getDb()
      .prepare(
        `INSERT INTO ${LEAD_REFERENCE_TABLES[type]} (id, name) VALUES (?, ?)`,
      )
      .run(reference.id, reference.name);
    return reference;
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE")
      return null;
    throw error;
  }
}

export async function createLead(
  body: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const record = toLeadRecord(randomUUID(), body);
  const columns = ["id", ...LEAD_WRITE_COLUMNS];
  getDb()
    .prepare(
      `INSERT INTO leads (${columns.join(", ")}) VALUES (${columns
        .map((column) => `@${column}`)
        .join(", ")})`,
    )
    .run(record);
  return { id: String(record.id) };
}

export async function getLead(
  id: string,
): Promise<Record<string, any> | null> {
  const row = getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id);
  return (row as Record<string, any> | undefined) ?? null;
}

export async function updateLead(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const record = toLeadUpdateRecord(body);
  const columns = Object.keys(record) as Array<keyof typeof record>;
  const result = getDb()
    .prepare(
      `UPDATE leads
       SET ${columns.map((column) => `${column} = @${column}`).join(", ")},
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id`,
    )
    .run({ ...record, id });
  if (result.changes === 0) return null;
  return getLead(id);
}

export const sqliteLeadsRepository: LeadsRepository = {
  listLeads,
  listLeadReferences,
  createLeadReference,
  createLead,
  getLead,
  updateLead,
};
