import { randomUUID } from "node:crypto";
import type { OpportunitiesRepository } from "../contracts";
import { getPostgresPool } from "./connection";

/**
 * Espelha o timestamp UTC gravado pelos defaults do schema
 * (database/postgresql/init.sql): "YYYY-MM-DDTHH:MM:SS.sssZ", comparável
 * lexicograficamente.
 */
const nowUtcSql = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Lista única de campos aceitos (nunca derivada do corpo da requisição),
// espelhando src/lib/repositories/sqlite/opportunities.ts. Somente nomes desta
// lista chegam ao SQL, garantindo que dados do usuário nunca virem colunas.
const fields = [
  "name",
  "client_id",
  "contact_id",
  "technology",
  "value",
  "currency",
  "service_type",
  "resources",
  "budget",
  "budget_currency",
  "notes",
  "customer_need",
  "offered_solution",
  "project_hours",
  "opened_at",
  "expected_close_at",
  "status",
  "loss_reason",
];

// Campos monetários/horas ficam em TEXT com decimal canônico para preservar a
// precisão (ex.: "1234.56").
const decimalFields = new Set(["value", "budget", "project_hours"]);

function normalizeField(field: string, value: unknown) {
  if (value === "" || value === undefined || value === null) return null;
  if (decimalFields.has(field)) return String(value);
  return value;
}

export async function listOpportunities(
  query: string | null,
  clientId: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT o.*, c.company_name, p.full_name AS contact_name
     FROM opportunities o
     JOIN clients c ON c.id = o.client_id
     JOIN contacts p ON p.id = o.contact_id AND p.client_id = o.client_id
     WHERE ($1::text IS NULL
       OR crm_normalize(o.name) LIKE '%' || crm_normalize($1::text) || '%'
       OR crm_normalize(c.company_name) LIKE '%' || crm_normalize($1::text) || '%'
       OR crm_normalize(p.full_name) LIKE '%' || crm_normalize($1::text) || '%')
       AND ($2::text IS NULL OR o.client_id = $2::text)
       AND ($3::text IS NULL OR o.status = $3::text)
     ORDER BY o.created_at DESC`,
    [query, clientId, status],
  );
  return result.rows;
}

export async function createOpportunity(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  // Só insere quando o cliente está ativo e o contato pertence a esse cliente;
  // sem linha produzida, retorna null (como no SQLite).
  const columns = fields.filter((field) => body[field] !== undefined);
  const values: unknown[] = [randomUUID()];
  const positions: Record<string, number> = {};
  for (const column of columns) {
    positions[column] = values.length + 1;
    values.push(normalizeField(column, body[column]));
  }

  const result = await getPostgresPool().query<Record<string, any>>(
    `INSERT INTO opportunities (id, ${columns.join(", ")})
     SELECT $1, ${columns.map((column) => `$${positions[column]}`).join(", ")}
     WHERE EXISTS (SELECT 1 FROM clients c WHERE c.id = $${positions.client_id} AND c.is_active = 1)
     AND EXISTS (SELECT 1 FROM contacts p WHERE p.id = $${positions.contact_id} AND p.client_id = $${positions.client_id})
     RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function changeOpportunityStatus(
  id: string,
  status: string,
  reason: string | null,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `UPDATE opportunities SET status = $2, loss_reason = $3,
     updated_at = ${nowUtcSql}
     WHERE id = $1 RETURNING id`,
    [id, status, reason],
  );
  return result.rows[0] ?? null;
}

export async function updateOpportunity(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  // Atualização dinâmica restrita à lista permitida; a associação cliente/contato
  // é revalidada com as MESMAS condições do create (cliente ativo + contato do
  // mesmo cliente), retornando null quando nada for atualizado.
  const keys = fields.filter((key) => body[key] !== undefined);
  const values: unknown[] = [id];
  const positions: Record<string, number> = {};
  for (const key of keys) {
    positions[key] = values.length + 1;
    values.push(normalizeField(key, body[key]));
  }
  const assignments = keys
    .map((key) => `${key} = $${positions[key]}`)
    .join(", ");

  const result = await getPostgresPool().query<Record<string, any>>(
    `UPDATE opportunities SET ${assignments},
     updated_at = ${nowUtcSql}
     WHERE id = $1
     AND EXISTS (SELECT 1 FROM clients c WHERE c.id = $${positions.client_id} AND c.is_active = 1)
     AND EXISTS (SELECT 1 FROM contacts p WHERE p.id = $${positions.contact_id} AND p.client_id = $${positions.client_id})
     RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function getOpportunity(
  id: string,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT o.*, c.company_name, p.full_name AS contact_name,
       p.email AS contact_email, p.phone AS contact_phone
     FROM opportunities o
     JOIN clients c ON c.id = o.client_id
     JOIN contacts p ON p.id = o.contact_id AND p.client_id = o.client_id
     WHERE o.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export const postgresOpportunitiesRepository: OpportunitiesRepository = {
  listOpportunities,
  createOpportunity,
  changeOpportunityStatus,
  updateOpportunity,
  getOpportunity,
};
