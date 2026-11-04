import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { ClientsRepository } from "../contracts";

const contactColumns = `
  'id', p.id, 'client_id', p.client_id, 'full_name', p.full_name,
  'job_title', p.job_title, 'email', p.email, 'phone', p.phone,
  'mobile', p.mobile, 'birthday', p.birthday, 'linkedin_url', p.linkedin_url,
  'notes', p.notes, 'is_primary', p.is_primary, 'is_active', p.is_active,
  'created_at', p.created_at, 'updated_at', p.updated_at`;

interface ClientRow extends Record<string, any> {
  is_active: number;
  contacts: string;
}

function mapClientRow(row: ClientRow): Record<string, any> {
  const contacts = JSON.parse(row.contacts || "[]") as Record<string, any>[];
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
  const rows = getDb()
    .prepare(
      `SELECT c.*, COALESCE(json_group_array(json_object(${contactColumns}))
        FILTER (WHERE p.id IS NOT NULL), '[]') AS contacts
      FROM clients c LEFT JOIN contacts p ON p.client_id = c.id AND p.is_active = 1
      WHERE (@search IS NULL OR normalize(c.company_name) LIKE '%' || normalize(@search) || '%'
        OR normalize(p.full_name) LIKE '%' || normalize(@search) || '%')
      GROUP BY c.id ORDER BY c.created_at DESC`,
    )
    .all({ search }) as ClientRow[];
  return rows.map(mapClientRow);
}

export async function listClientOptions(
  includeInactive = false,
): Promise<
  Array<{
    id: string;
    company_name: string;
    trade_name: string | null;
    is_active: boolean;
  }>
> {
  const rows = getDb()
    .prepare(
      `SELECT id, company_name, trade_name, is_active FROM clients
       ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY company_name`,
    )
    .all() as Array<{
    id: string;
    company_name: string;
    trade_name: string | null;
    is_active: number;
  }>;
  return rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createClient(
  body: Record<string, any>,
): Promise<Record<string, any>> {
  const db = getDb();
  const insertClient = db.prepare(
    `INSERT INTO clients (id, company_name, trade_name, tax_id, industry, website, phone, email,
     postal_code, street, street_number, complement, city, state, country, notes, logo_path)
     VALUES (@id, @company_name, @trade_name, @tax_id, @industry, @website, @phone, @email,
     @postal_code, @street, @street_number, @complement, @city, @state, @country, @notes, @logo_path)
     RETURNING *`,
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
     VALUES (@id, @client_id, @full_name, @job_title, @email, @phone, @mobile, @birthday, @linkedin_url, @notes, @is_primary)`,
  );
  const run = db.transaction((input: Record<string, any>) => {
    const client = insertClient.get({
      id: randomUUID(),
      company_name: input.company_name.trim(),
      trade_name: input.trade_name,
      tax_id: input.tax_id,
      industry: input.industry,
      website: input.website,
      phone: input.phone,
      email: input.email,
      postal_code: input.postal_code,
      street: input.street,
      street_number: input.street_number,
      complement: input.complement,
      city: input.city,
      state: input.state,
      country: input.country || "Brasil",
      notes: input.notes,
      logo_path: input.logo_path,
    }) as Record<string, any>;
    for (const contact of input.contacts || []) {
      if (!contact.full_name?.trim()) continue;
      insertContact.run({
        id: randomUUID(),
        client_id: client.id,
        full_name: contact.full_name.trim(),
        job_title: contact.job_title,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        birthday: contact.birthday || null,
        linkedin_url: contact.linkedin_url,
        notes: contact.notes,
        is_primary: contact.is_primary ? 1 : 0,
      });
    }
    return client;
  });
  const client = run(body) as Record<string, any>;
  return { ...client, is_active: Boolean(client.is_active) };
}

export async function getClient(
  id: string,
): Promise<{ client: Record<string, any> | undefined; found: boolean }> {
  const row = getDb()
    .prepare(
      `SELECT c.*, COALESCE(json_group_array(json_object(${contactColumns}))
        FILTER (WHERE p.id IS NOT NULL), '[]') AS contacts
      FROM clients c LEFT JOIN contacts p ON p.client_id = c.id AND p.is_active = 1
      WHERE c.id = @id GROUP BY c.id`,
    )
    .get({ id }) as ClientRow | undefined;
  return { client: row ? mapClientRow(row) : undefined, found: Boolean(row) };
}

export async function updateClient(
  id: string,
  body: Record<string, any>,
): Promise<Record<string, any> | null> {
  const db = getDb();
  const updateStmt = db.prepare(
    `UPDATE clients SET company_name=@company_name, trade_name=@trade_name, tax_id=@tax_id,
     industry=@industry, website=@website, phone=@phone, email=@email, postal_code=@postal_code,
     street=@street, street_number=@street_number, complement=@complement, city=@city, state=@state,
     country=@country, notes=@notes, logo_path=@logo_path,
     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id=@id RETURNING *`,
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
     VALUES (@id, @client_id, @full_name, @job_title, @email, @phone, @mobile, @birthday, @linkedin_url, @notes, @is_primary)`,
  );
  const updateContact = db.prepare(
    `UPDATE contacts SET full_name=@full_name, job_title=@job_title, email=@email, phone=@phone,
     mobile=@mobile, birthday=@birthday, linkedin_url=@linkedin_url, notes=@notes, is_primary=@is_primary,
     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id=@id AND client_id=@client_id`,
  );
  const deactivateContact = db.prepare("UPDATE contacts SET is_active = 0, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id AND client_id = @client_id");
  const listExistingContacts = db.prepare(
    "SELECT id, full_name, is_active FROM contacts WHERE client_id = @client_id",
  );
  const run = db.transaction((input: Record<string, any>) => {
    const existing = listExistingContacts.all({ client_id: id }) as {
      id: string;
      full_name: string;
      is_active: number;
    }[];
    const existingIds = new Set(existing.map((contact) => contact.id));
    const contacts = (input.contacts || []).filter((contact: any) =>
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
    const removed = existing.filter((contact) => contact.is_active === 1 && !keptIds.has(contact.id));
    const updated = updateStmt.get({
      id,
      company_name: input.company_name.trim(),
      trade_name: input.trade_name,
      tax_id: input.tax_id,
      industry: input.industry,
      website: input.website,
      phone: input.phone,
      email: input.email,
      postal_code: input.postal_code,
      street: input.street,
      street_number: input.street_number,
      complement: input.complement,
      city: input.city,
      state: input.state,
      country: input.country || "Brasil",
      notes: input.notes,
      logo_path: input.logo_path,
    }) as Record<string, any> | undefined;
    if (!updated) return null;
    for (const contact of contacts) {
      const values = {
        full_name: contact.full_name.trim(),
        job_title: contact.job_title,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        birthday: contact.birthday || null,
        linkedin_url: contact.linkedin_url,
        notes: contact.notes,
        is_primary: contact.is_primary ? 1 : 0,
      };
      if (contact.id) {
        updateContact.run({ ...values, id: contact.id, client_id: id });
      } else {
        insertContact.run({ ...values, id: randomUUID(), client_id: id });
      }
    }
    for (const contact of removed) {
      deactivateContact.run({ id: contact.id, client_id: id });
    }
    return updated;
  });
  const updated = run(body) as Record<string, any> | null;
  return updated ? { ...updated, is_active: Boolean(updated.is_active) } : null;
}

export async function deactivateClient(
  id: string,
): Promise<{ found: boolean; row: unknown }> {
  const row = getDb()
    .prepare(
      `UPDATE clients SET is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = @id RETURNING id`,
    )
    .get({ id });
  return { found: Boolean(row), row };
}

export const sqliteClientsRepository: ClientsRepository = {
  listClients,
  listClientOptions,
  createClient,
  getClient,
  updateClient,
  deactivateClient,
};
