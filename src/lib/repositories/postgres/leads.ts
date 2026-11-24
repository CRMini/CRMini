import type { LeadsRepository } from "../contracts";
import { getPostgresPool } from "./connection";

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

export const postgresLeadsRepository: LeadsRepository = {
  listLeads,
};
