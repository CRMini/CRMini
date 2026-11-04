import { randomUUID } from "node:crypto";
import type { ClientsRepository } from "../contracts";
import { getPostgresPool, withPostgresTransaction } from "./connection";

/**
 * Espelha o timestamp UTC gravado pelos defaults do schema (database/postgresql/init.sql):
 * "YYYY-MM-DDTHH:MM:SS.sssZ", comparável lexicograficamente.
 */
const nowUtcSql = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

interface ClientRow extends Record<string, any> {
  is_active: number;
  contacts: Record<string, any>[];
}

function mapClientRow(row: ClientRow): Record<string, any> {
  const contacts = Array.isArray(row.contacts) ? row.contacts : [];
  return {
    ...row,
    is_active: Boolean(row.is_active),
    contacts: contacts.map((contact) => ({
      ...contact,
      is_primary: Boolean(contact.is_primary),
      is_active: Boolean(contact.is_active),
    })),
  };
}

export async function listClients(
  search: string | null,
): Promise<Record<string, any>[]> {
  const result = await getPostgresPool().query<ClientRow>(
    `SELECT c.*,
       COALESCE(
         jsonb_agg(to_jsonb(p)) FILTER (WHERE p.id IS NOT NULL),
         '[]'::jsonb
       ) AS contacts
     FROM clients c
     LEFT JOIN contacts p ON p.client_id = c.id AND p.is_active = 1
     WHERE ($1::text IS NULL
       OR crm_normalize(c.company_name) LIKE '%' || crm_normalize($1) || '%'
       OR crm_normalize(p.full_name) LIKE '%' || crm_normalize($1) || '%')
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [search],
  );
  return result.rows.map(mapClientRow);
}

export async function listClientOptions(includeInactive = false): Promise<
  Array<{
    id: string;
    company_name: string;
    trade_name: string | null;
    is_active: boolean;
  }>
> {
  const result = await getPostgresPool().query<{
    id: string;
    company_name: string;
    trade_name: string | null;
    is_active: number;
  }>(
    `SELECT id, company_name, trade_name, is_active FROM clients
     ${includeInactive ? "" : "WHERE is_active = 1"}
     ORDER BY company_name`,
  );
  return result.rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

export async function createClient(
  body: Record<string, any>,
): Promise<Record<string, any>> {
  // A validação de empresa obrigatória fica na rota, como no adaptador SQLite.
  return withPostgresTransaction(async (client) => {
    const inserted = await client.query<Record<string, any>>(
      `INSERT INTO clients (id, company_name, trade_name, tax_id, industry, website, phone, email,
         postal_code, street, street_number, complement, city, state, country, notes, logo_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        randomUUID(),
        body.company_name.trim(),
        body.trade_name ?? null,
        body.tax_id ?? null,
        body.industry ?? null,
        body.website ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.postal_code ?? null,
        body.street ?? null,
        body.street_number ?? null,
        body.complement ?? null,
        body.city ?? null,
        body.state ?? null,
        body.country || "Brasil",
        body.notes ?? null,
        body.logo_path ?? null,
      ],
    );
    const saved = inserted.rows[0];

    for (const contact of body.contacts || []) {
      if (!contact.full_name?.trim()) continue;
      await client.query(
        `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          saved.id,
          contact.full_name.trim(),
          contact.job_title ?? null,
          contact.email ?? null,
          contact.phone ?? null,
          contact.mobile ?? null,
          contact.birthday || null,
          contact.linkedin_url ?? null,
          contact.notes ?? null,
          contact.is_primary ? 1 : 0,
        ],
      );
    }

    return { ...saved, is_active: Boolean(saved.is_active) };
  });
}

export async function getClient(
  id: string,
): Promise<{ client: Record<string, any> | undefined; found: boolean }> {
  const result = await getPostgresPool().query<ClientRow>(
    `SELECT c.*,
       COALESCE(
         jsonb_agg(to_jsonb(p)) FILTER (WHERE p.id IS NOT NULL),
         '[]'::jsonb
       ) AS contacts
     FROM clients c
     LEFT JOIN contacts p ON p.client_id = c.id AND p.is_active = 1
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  const row = result.rows[0];
  return { client: row ? mapClientRow(row) : undefined, found: Boolean(row) };
}

export async function updateClient(
  id: string,
  body: Record<string, any>,
): Promise<Record<string, any> | null> {
  // A validação de empresa obrigatória fica na rota, como no adaptador SQLite.
  return withPostgresTransaction(async (client) => {
    const existingResult = await client.query<{
      id: string;
      full_name: string;
      is_active: number;
    }>("SELECT id, full_name, is_active FROM contacts WHERE client_id = $1", [
      id,
    ]);
    const existing = existingResult.rows;
    const existingIds = new Set(existing.map((contact) => contact.id));
    const contacts = (body.contacts || []).filter((contact: any) =>
      contact.full_name?.trim(),
    );
    for (const contact of contacts) {
      if (contact.id && !existingIds.has(contact.id))
        throw new Error("Contato não pertence ao cliente informado.");
    }
    const keptIds = new Set(
      contacts
        .map((contact: any) => contact.id)
        .filter((contactId: string | undefined): contactId is string =>
          Boolean(contactId),
        ),
    );
    const removed = existing.filter(
      (contact) => contact.is_active === 1 && !keptIds.has(contact.id),
    );

    const updatedResult = await client.query<Record<string, any>>(
      `UPDATE clients SET company_name=$1, trade_name=$2, tax_id=$3, industry=$4, website=$5,
         phone=$6, email=$7, postal_code=$8, street=$9, street_number=$10, complement=$11,
         city=$12, state=$13, country=$14, notes=$15, logo_path=$16,
         updated_at=${nowUtcSql}
       WHERE id=$17 RETURNING *`,
      [
        body.company_name.trim(),
        body.trade_name ?? null,
        body.tax_id ?? null,
        body.industry ?? null,
        body.website ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.postal_code ?? null,
        body.street ?? null,
        body.street_number ?? null,
        body.complement ?? null,
        body.city ?? null,
        body.state ?? null,
        body.country || "Brasil",
        body.notes ?? null,
        body.logo_path ?? null,
        id,
      ],
    );
    const updated = updatedResult.rows[0];
    if (!updated) return null;

    for (const contact of contacts) {
      const values = [
        contact.full_name.trim(),
        contact.job_title ?? null,
        contact.email ?? null,
        contact.phone ?? null,
        contact.mobile ?? null,
        contact.birthday || null,
        contact.linkedin_url ?? null,
        contact.notes ?? null,
        contact.is_primary ? 1 : 0,
      ];
      if (contact.id) {
        await client.query(
          `UPDATE contacts SET full_name=$1, job_title=$2, email=$3, phone=$4, mobile=$5,
             birthday=$6, linkedin_url=$7, notes=$8, is_primary=$9, updated_at=${nowUtcSql}
           WHERE id=$10 AND client_id=$11`,
          [...values, contact.id, id],
        );
      } else {
        await client.query(
          `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [randomUUID(), id, ...values],
        );
      }
    }

    for (const contact of removed) {
      await client.query(
        `UPDATE contacts SET is_active = 0, updated_at=${nowUtcSql} WHERE id=$1 AND client_id=$2`,
        [contact.id, id],
      );
    }

    return { ...updated, is_active: Boolean(updated.is_active) };
  });
}

export async function deactivateClient(
  id: string,
): Promise<{ found: boolean; row: unknown }> {
  const result = await getPostgresPool().query<{ id: string }>(
    `UPDATE clients SET is_active = 0, updated_at = ${nowUtcSql} WHERE id = $1 RETURNING id`,
    [id],
  );
  const row = result.rows[0];
  return { found: Boolean(row), row };
}

export const postgresClientsRepository: ClientsRepository = {
  listClients,
  listClientOptions,
  createClient,
  getClient,
  updateClient,
  deactivateClient,
};
