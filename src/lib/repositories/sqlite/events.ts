import { randomUUID } from "node:crypto";
import { getBrazilDateString } from "@/lib/brazil-date";
import { getDb } from "@/lib/db";
import type { EventListFilters, EventsRepository } from "../contracts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const eventSelect = `
  SELECT e.*, c.company_name, o.name AS opportunity_name,
    p.full_name AS contact_name
  FROM events e
  JOIN clients c ON c.id = e.client_id
  LEFT JOIN opportunities o ON o.id = e.opportunity_id AND o.client_id = e.client_id
  LEFT JOIN contacts p ON p.id = e.contact_id AND p.client_id = e.client_id`;

function mapEventRow(row: Record<string, any>): Record<string, any> {
  return { ...row, is_origin: Boolean(row.is_origin) };
}

function normalizeLimit(value: number | null | undefined): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export async function listEvents(
  filters: EventListFilters = {},
): Promise<Record<string, any>[]> {
  const rows = getDb()
    .prepare(
      `${eventSelect}
      WHERE e.is_active = 1
        AND (@clientId IS NULL OR e.client_id = @clientId)
        AND (@opportunityId IS NULL OR e.opportunity_id = @opportunityId)
        AND (@type IS NULL OR e.event_type = @type)
      ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
      LIMIT @limit`,
    )
    .all({
      clientId: filters.clientId || null,
      opportunityId: filters.opportunityId || null,
      type: filters.type || null,
      limit: normalizeLimit(filters.limit),
    }) as Record<string, any>[];
  return rows.map(mapEventRow);
}

export async function getEvent(
  id: string,
): Promise<Record<string, any> | null> {
  const row = getDb()
    .prepare(`${eventSelect} WHERE e.id = @id`)
    .get({ id }) as Record<string, any> | undefined;
  return row ? mapEventRow(row) : null;
}

export async function createEvent(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const details =
    typeof body.details === "string" && body.details.trim()
      ? body.details
      : null;
  const occurredAt =
    typeof body.occurred_at === "string" && body.occurred_at
      ? body.occurred_at
      : getBrazilDateString();
  const row = getDb()
    .prepare(
      `INSERT INTO events (id, client_id, opportunity_id, contact_id, event_type, title, details, occurred_at, is_origin)
       SELECT @id, @client_id, @opportunity_id, @contact_id, @event_type, @title, @details, @occurred_at, 0
       WHERE EXISTS (SELECT 1 FROM clients c WHERE c.id = @client_id)
       AND (@opportunity_id IS NULL OR EXISTS (
         SELECT 1 FROM opportunities o WHERE o.id = @opportunity_id AND o.client_id = @client_id
       ))
       AND (@contact_id IS NULL OR EXISTS (
         SELECT 1 FROM contacts p WHERE p.id = @contact_id AND p.client_id = @client_id
       ))
       RETURNING *`,
    )
    .get({
      id: randomUUID(),
      client_id: body.client_id,
      opportunity_id: body.opportunity_id || null,
      contact_id: body.contact_id || null,
      event_type: body.event_type || "nota",
      title: String(body.title ?? "").trim(),
      details,
      occurred_at: occurredAt,
    }) as Record<string, any> | undefined;
  return row ? mapEventRow(row) : null;
}

export async function updateEvent(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const details =
    typeof body.details === "string" && body.details.trim()
      ? body.details
      : null;
  const row = getDb()
    .prepare(
      `UPDATE events SET event_type = @event_type, title = @title,
        details = @details, occurred_at = @occurred_at,
        contact_id = @contact_id, opportunity_id = @opportunity_id,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = @id AND is_active = 1 AND client_id = @client_id
       AND (@contact_id IS NULL OR EXISTS (
         SELECT 1 FROM contacts p
         WHERE p.id = @contact_id AND p.client_id = @client_id
       ))
       AND (@opportunity_id IS NULL OR EXISTS (
         SELECT 1 FROM opportunities o
         WHERE o.id = @opportunity_id AND o.client_id = @client_id
       ))
       AND (is_origin = 0 OR opportunity_id = @opportunity_id)
       RETURNING *`,
    )
    .get({
      id,
      client_id: body.client_id,
      event_type: body.event_type,
      title: String(body.title ?? "").trim(),
      details,
      occurred_at: body.occurred_at,
      contact_id: body.contact_id || null,
      opportunity_id: body.opportunity_id || null,
    }) as Record<string, any> | undefined;
  return row ? mapEventRow(row) : null;
}

export async function deactivateEvent(
  id: string,
): Promise<Record<string, any> | null> {
  const row = getDb()
    .prepare(
      `UPDATE events SET is_active = 0,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = @id AND is_active = 1 AND is_origin = 0
       RETURNING id`,
    )
    .get({ id }) as Record<string, any> | undefined;
  return row ?? null;
}

export const sqliteEventsRepository: EventsRepository = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deactivateEvent,
};
