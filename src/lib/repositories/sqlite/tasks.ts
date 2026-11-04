import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { TasksRepository } from "../contracts";

export async function listTasks(
  start: string | null,
  end: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getDb()
    .prepare(
      `SELECT t.id, t.contact_type, t.subject, t.description, t.scheduled_at, t.status,
        t.client_id, t.contact_id, c.company_name, p.full_name AS contact_name
      FROM tasks t
      JOIN clients c ON c.id = t.client_id
      JOIN contacts p ON p.id = t.contact_id AND p.client_id = t.client_id
      WHERE (@start IS NULL OR (t.scheduled_at >= @start AND t.scheduled_at < @end))
        AND (@status IS NULL OR t.status = @status)
      ORDER BY t.scheduled_at`,
    )
    .all({ start, end, status }) as Record<string, any>[];
}

export async function createTask(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  // Instantes são persistidos normalizados em UTC ISO-8601 ("...Z"), mantendo a
  // comparação lexicográfica equivalente à cronológica, como era com TIMESTAMPTZ.
  const scheduledAt = new Date(String(body.scheduled_at)).toISOString();
  const row = getDb()
    .prepare(
      `INSERT INTO tasks (id, contact_type, subject, description, scheduled_at, client_id, contact_id)
       SELECT @id, @contact_type, @subject, @description, @scheduled_at, @client_id, @contact_id
       WHERE EXISTS (SELECT 1 FROM clients WHERE id = @client_id AND is_active)
       AND EXISTS (SELECT 1 FROM contacts WHERE id = @contact_id AND client_id = @client_id)
       RETURNING *`,
    )
    .get({
      id: randomUUID(),
      contact_type: body.contact_type,
      subject: (body.subject as string).trim(),
      description: body.description || null,
      scheduled_at: scheduledAt,
      client_id: body.client_id,
      contact_id: body.contact_id,
    }) as Record<string, any> | undefined;
  return row ?? null;
}

export async function updateTaskStatus(
  id: string,
  status: unknown,
): Promise<Record<string, any> | null> {
  const row = getDb()
    .prepare(
      `UPDATE tasks SET status = @status,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id RETURNING id, status`,
    )
    .get({ id, status }) as Record<string, any> | undefined;
  return row ?? null;
}

export const sqliteTasksRepository: TasksRepository = {
  listTasks,
  createTask,
  updateTaskStatus,
};
