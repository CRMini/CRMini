import { randomUUID } from "node:crypto";
import type { TasksRepository } from "../contracts";
import { getPostgresPool } from "./connection";

/**
 * Espelha o timestamp UTC gravado pelos defaults do schema
 * (database/postgresql/init.sql): "YYYY-MM-DDTHH:MM:SS.sssZ", comparável
 * lexicograficamente.
 */
const nowUtcSql = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export async function listTasks(
  start: string | null,
  end: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT t.id, t.contact_type, t.subject, t.description, t.scheduled_at, t.status,
       t.client_id, t.contact_id, c.company_name, p.full_name AS contact_name
     FROM tasks t
     JOIN clients c ON c.id = t.client_id
     JOIN contacts p ON p.id = t.contact_id AND p.client_id = t.client_id
     WHERE ($1::text IS NULL OR (t.scheduled_at >= $1::text AND t.scheduled_at < $2::text))
       AND ($3::text IS NULL OR t.status = $3::text)
     ORDER BY t.scheduled_at`,
    [start, end, status],
  );
  return result.rows;
}

export async function createTask(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  // Instantes são persistidos normalizados em UTC ISO-8601 ("...Z"), mantendo a
  // comparação lexicográfica equivalente à cronológica, como no SQLite.
  const scheduledAt = new Date(String(body.scheduled_at)).toISOString();
  const result = await getPostgresPool().query<Record<string, any>>(
    `INSERT INTO tasks (id, contact_type, subject, description, scheduled_at, client_id, contact_id)
     SELECT $1, $2, $3, $4, $5, $6, $7
     WHERE EXISTS (SELECT 1 FROM clients WHERE id = $6 AND is_active = 1)
     AND EXISTS (SELECT 1 FROM contacts WHERE id = $7 AND client_id = $6)
     RETURNING *`,
    [
      randomUUID(),
      body.contact_type,
      (body.subject as string).trim(),
      body.description || null,
      scheduledAt,
      body.client_id,
      body.contact_id,
    ],
  );
  return result.rows[0] ?? null;
}

export async function updateTaskStatus(
  id: string,
  status: unknown,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `UPDATE tasks SET status = $2,
     updated_at = ${nowUtcSql}
     WHERE id = $1 RETURNING id, status`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export const postgresTasksRepository: TasksRepository = {
  listTasks,
  createTask,
  updateTaskStatus,
};
