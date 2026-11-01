import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

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
// precisão que o NUMERIC do PostgreSQL garantia (ex.: "1234.56").
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
  return getDb()
    .prepare(
      `SELECT o.*, c.company_name, p.full_name AS contact_name FROM opportunities o
      JOIN clients c ON c.id = o.client_id
      JOIN contacts p ON p.id = o.contact_id AND p.client_id = o.client_id
      WHERE (@query IS NULL OR normalize(o.name) LIKE '%' || normalize(@query) || '%'
        OR normalize(c.company_name) LIKE '%' || normalize(@query) || '%' OR normalize(p.full_name) LIKE '%' || normalize(@query) || '%')
        AND (@clientId IS NULL OR o.client_id = @clientId)
        AND (@status IS NULL OR o.status = @status)
      ORDER BY o.created_at DESC`,
    )
    .all({ query, clientId, status }) as Record<string, any>[];
}

export async function createOpportunity(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const columns = fields.filter((field) => body[field] !== undefined);
  const params: Record<string, unknown> = { id: randomUUID() };
  for (const column of columns)
    params[column] = normalizeField(column, body[column]);
  const row = getDb()
    .prepare(
      `INSERT INTO opportunities (id, ${columns.join(",")})
       SELECT @id, ${columns.map((column) => `@${column}`).join(",")}
       WHERE EXISTS (SELECT 1 FROM clients c WHERE c.id = @client_id AND c.is_active)
       AND EXISTS (SELECT 1 FROM contacts p WHERE p.id = @contact_id AND p.client_id = @client_id)
       RETURNING *`,
    )
    .get(params) as Record<string, any> | undefined;
  return row ?? null;
}

export async function changeOpportunityStatus(
  id: string,
  status: string,
  reason: string | null,
): Promise<Record<string, any> | null> {
  const row = getDb()
    .prepare(
      `UPDATE opportunities SET status = @status, loss_reason = @reason,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id RETURNING id`,
    )
    .get({ id, status, reason });
  return row ?? null;
}

export async function updateOpportunity(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const keys = fields.filter((key) => body[key] !== undefined);
  const params: Record<string, unknown> = { id };
  for (const key of keys) params[key] = normalizeField(key, body[key]);
  const assignments = keys.map((key) => `${key} = @${key}`).join(", ");
  const row = getDb()
    .prepare(
      `UPDATE opportunities SET ${assignments},
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id
       AND EXISTS (SELECT 1 FROM clients c WHERE c.id = @client_id AND c.is_active)
       AND EXISTS (SELECT 1 FROM contacts p WHERE p.id = @contact_id AND p.client_id = @client_id)
       RETURNING *`,
    )
    .get(params) as Record<string, any> | undefined;
  return row ?? null;
}

export async function getOpportunity(
  id: string,
): Promise<Record<string, any> | null> {
  const row = getDb()
    .prepare(
      `SELECT o.*, c.company_name, p.full_name AS contact_name,
        p.email AS contact_email, p.phone AS contact_phone
       FROM opportunities o
       JOIN clients c ON c.id = o.client_id
       JOIN contacts p ON p.id = o.contact_id AND p.client_id = o.client_id
       WHERE o.id = @id`,
    )
    .get({ id }) as Record<string, any> | undefined;
  return row ?? null;
}
