import { getDb } from "@/lib/db";
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

export const sqliteLeadsRepository: LeadsRepository = {
  listLeads,
};
