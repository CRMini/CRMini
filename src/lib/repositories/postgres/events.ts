import { randomUUID } from "node:crypto";
import { getBrazilDateString } from "@/lib/brazil-date";
import type { EventListFilters, EventsRepository } from "../contracts";
import { getPostgresPool } from "./connection";

/**
 * Espelha o timestamp UTC gravado pelos defaults do schema
 * (database/postgresql/init.sql): "YYYY-MM-DDTHH:MM:SS.sssZ", comparável
 * lexicograficamente.
 */
const nowUtcSql = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

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
  const result = await getPostgresPool().query<Record<string, any>>(
    `${eventSelect}
      WHERE e.is_active = 1
        AND ($1::text IS NULL OR e.client_id = $1::text)
        AND ($2::text IS NULL OR e.opportunity_id = $2::text)
        AND ($3::text IS NULL OR e.event_type = $3::text)
      ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
      LIMIT $4::int`,
    [
      filters.clientId || null,
      filters.opportunityId || null,
      filters.type || null,
      normalizeLimit(filters.limit),
    ],
  );
  return result.rows.map(mapEventRow);
}

export async function getEvent(
  id: string,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `${eventSelect} WHERE e.id = $1`,
    [id],
  );
  const row = result.rows[0];
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
  const result = await getPostgresPool().query<Record<string, any>>(
    `INSERT INTO events (id, client_id, opportunity_id, contact_id, event_type, title, details, occurred_at, is_origin)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, 0
     WHERE EXISTS (SELECT 1 FROM clients c WHERE c.id = $2)
     AND ($3::text IS NULL OR EXISTS (
       SELECT 1 FROM opportunities o WHERE o.id = $3::text AND o.client_id = $2
     ))
     AND ($4::text IS NULL OR EXISTS (
       SELECT 1 FROM contacts p WHERE p.id = $4::text AND p.client_id = $2
     ))
     RETURNING *`,
    [
      randomUUID(),
      body.client_id,
      body.opportunity_id || null,
      body.contact_id || null,
      body.event_type || "nota",
      String(body.title ?? "").trim(),
      details,
      occurredAt,
    ],
  );
  return result.rows[0] ? mapEventRow(result.rows[0]) : null;
}

export async function updateEvent(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const details =
    typeof body.details === "string" && body.details.trim()
      ? body.details
      : null;
  const result = await getPostgresPool().query<Record<string, any>>(
    `UPDATE events SET event_type = $2, title = $3,
        details = $4, occurred_at = $5,
        contact_id = $6, opportunity_id = $7,
        updated_at = ${nowUtcSql}
     WHERE id = $1 AND is_active = 1 AND client_id = $8
     AND ($6::text IS NULL OR EXISTS (
       SELECT 1 FROM contacts p
       WHERE p.id = $6::text AND p.client_id = $8
     ))
     AND ($7::text IS NULL OR EXISTS (
       SELECT 1 FROM opportunities o
       WHERE o.id = $7::text AND o.client_id = $8
     ))
     AND (is_origin = 0 OR opportunity_id = $7::text)
     RETURNING *`,
    [
      id,
      body.event_type,
      String(body.title ?? "").trim(),
      details,
      body.occurred_at,
      body.contact_id || null,
      body.opportunity_id || null,
      body.client_id,
    ],
  );
  return result.rows[0] ? mapEventRow(result.rows[0]) : null;
}

export async function deactivateEvent(
  id: string,
): Promise<Record<string, any> | null> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `UPDATE events SET is_active = 0,
        updated_at = ${nowUtcSql}
     WHERE id = $1 AND is_active = 1 AND is_origin = 0
     RETURNING id`,
    [id],
  );
  return result.rows[0] ?? null;
}

export const postgresEventsRepository: EventsRepository = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deactivateEvent,
};
