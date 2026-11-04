import { randomUUID } from "node:crypto";
import {
  normalizeEmailKey,
  normalizeLinkedInProfileUrl,
} from "@/lib/linkedin-connections";
import type {
  ContactImportInput,
  ContactImportOutcome,
  ContactsRepository,
} from "../contracts";
import { getPostgresPool, withPostgresTransaction } from "./connection";

/**
 * Espelha o timestamp UTC gravado pelos defaults do schema (database/postgresql/init.sql):
 * "YYYY-MM-DDTHH:MM:SS.sssZ", comparável lexicograficamente.
 */
const nowUtcSql = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export async function createContact(
  input: Record<string, any>,
): Promise<Record<string, any> | undefined> {
  // Só insere quando o cliente existe e está ativo; quando o INSERT ... SELECT
  // não produz linha, nenhum contato é gravado (como no SQLite).
  const result = await getPostgresPool().query<Record<string, any>>(
    `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
     SELECT $1, c.id, $2, $3, $4, $5, $6, $7, $8, $9, $10
     FROM clients c WHERE c.id = $11 AND c.is_active = 1
     RETURNING *`,
    [
      randomUUID(),
      input.full_name.trim(),
      input.job_title || null,
      input.email || null,
      input.phone || null,
      input.mobile || null,
      input.birthday || null,
      input.linkedin_url || null,
      input.notes || null,
      input.is_primary ? 1 : 0,
      input.client_id,
    ],
  );
  return result.rows[0];
}

export async function getContact(
  id: string,
): Promise<Record<string, any> | undefined> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT p.*, c.company_name, c.trade_name, c.industry
     FROM contacts p JOIN clients c ON c.id = p.client_id WHERE p.id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row
    ? {
        ...row,
        is_primary: Boolean(row.is_primary),
        is_active: Boolean(row.is_active),
      }
    : undefined;
}

async function setContactActive(
  id: string,
  isActive: boolean,
): Promise<boolean> {
  const result = await getPostgresPool().query(
    `UPDATE contacts SET is_active = $1, updated_at = ${nowUtcSql} WHERE id = $2 RETURNING id`,
    [isActive ? 1 : 0, id],
  );
  return (result.rowCount ?? 0) > 0;
}
export const deactivateContact = (id: string) => setContactActive(id, false);
export const reactivateContact = (id: string) => setContactActive(id, true);

export async function updateContact(
  id: string,
  input: Record<string, any>,
): Promise<Record<string, any> | undefined> {
  const result = await getPostgresPool().query(
    `UPDATE contacts SET full_name = $1, job_title = $2,
     email = $3, phone = $4, mobile = $5, birthday = $6,
     linkedin_url = $7, notes = $8, is_primary = $9,
     updated_at = ${nowUtcSql} WHERE id = $10 RETURNING id`,
    [
      input.full_name.trim(),
      input.job_title || null,
      input.email || null,
      input.phone || null,
      input.mobile || null,
      input.birthday || null,
      input.linkedin_url || null,
      input.notes || null,
      input.is_primary ? 1 : 0,
      id,
    ],
  );
  if (result.rowCount === 0) return undefined;
  return getContact(id);
}

export async function listContacts(
  query: string | null,
  industry: string | null,
  includeInactive = false,
): Promise<Record<string, any>[]> {
  const result = await getPostgresPool().query<Record<string, any>>(
    `SELECT p.id, p.full_name, p.job_title, p.email, p.phone, p.mobile,
       p.birthday, p.linkedin_url, p.notes, p.is_primary, p.is_active, p.client_id,
       c.company_name, c.trade_name, c.industry, c.logo_path
     FROM contacts p JOIN clients c ON c.id = p.client_id
     WHERE ($1::int = 1 OR p.is_active = 1)
       AND ($2::text IS NULL
         OR crm_normalize(p.full_name) LIKE '%' || crm_normalize($2::text) || '%'
         OR crm_normalize(p.email) LIKE '%' || crm_normalize($2::text) || '%'
         OR crm_normalize(p.job_title) LIKE '%' || crm_normalize($2::text) || '%'
         OR crm_normalize(p.phone) LIKE '%' || crm_normalize($2::text) || '%'
         OR crm_normalize(p.mobile) LIKE '%' || crm_normalize($2::text) || '%'
         OR (crm_phone_digits($2::text) <> ''
           AND (crm_phone_digits(p.phone) LIKE '%' || crm_phone_digits($2::text) || '%'
             OR crm_phone_digits(p.mobile) LIKE '%' || crm_phone_digits($2::text) || '%'))
         OR crm_normalize(c.company_name) LIKE '%' || crm_normalize($2::text) || '%'
         OR crm_normalize(c.trade_name) LIKE '%' || crm_normalize($2::text) || '%')
       AND ($3::text IS NULL OR c.industry = $3::text)
     ORDER BY c.company_name, p.is_primary DESC, p.full_name`,
    [includeInactive ? 1 : 0, query, industry],
  );
  return result.rows.map((row) => ({
    ...row,
    is_primary: Boolean(row.is_primary),
    is_active: Boolean(row.is_active),
  }));
}

const CLIENT_QUERY_BLOCK = 400;

/**
 * Planeja uma importação sem gravar nada. Valida, na ordem: nome vazio/só
 * espaços ou >200; cliente inexistente/inativo; duplicata forte (URL global ou
 * e-mail no mesmo cliente); duplicata dentro do próprio lote; senão would_import.
 */
export async function planContactImport(
  items: ContactImportInput[],
): Promise<ContactImportOutcome[]> {
  if (items.length === 0) return [];

  const pool = getPostgresPool();

  const activeContactsResult = await pool.query<{
    id: string;
    client_id: string;
    linkedin_url: string | null;
    email: string | null;
  }>(
    `SELECT id, client_id, linkedin_url, email FROM contacts
     WHERE is_active = 1 AND (linkedin_url IS NOT NULL OR email IS NOT NULL)`,
  );
  const activeContacts = activeContactsResult.rows;

  const urlToContactId = new Map<string, string>();
  const clientEmailToContactId = new Map<string, string>();
  for (const contact of activeContacts) {
    const urlKey = normalizeLinkedInProfileUrl(contact.linkedin_url);
    if (urlKey) urlToContactId.set(urlKey, contact.id);
    const emailKey = normalizeEmailKey(contact.email);
    if (emailKey) {
      clientEmailToContactId.set(
        `${contact.client_id}|${emailKey}`,
        contact.id,
      );
    }
  }

  const clientIds = [
    ...new Set(items.map((item) => item.clientId).filter(Boolean)),
  ];
  const activeClientIds = new Set<string>();
  for (
    let offset = 0;
    offset < clientIds.length;
    offset += CLIENT_QUERY_BLOCK
  ) {
    const block = clientIds.slice(offset, offset + CLIENT_QUERY_BLOCK);
    const placeholders = block.map((_, index) => `$${index + 1}`).join(",");
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE is_active = 1 AND id IN (${placeholders})`,
      block,
    );
    for (const row of result.rows) activeClientIds.add(row.id);
  }

  const batchUrls = new Set<string>();
  const batchClientEmails = new Set<string>();

  const outcomes: ContactImportOutcome[] = [];
  for (const item of items) {
    const trimmedName = (item.fullName ?? "").trim();
    if (!trimmedName || trimmedName.length > 200) {
      outcomes.push({ rowId: item.rowId, status: "invalid_name" });
      continue;
    }
    if (!activeClientIds.has(item.clientId)) {
      outcomes.push({ rowId: item.rowId, status: "invalid_client" });
      continue;
    }

    const urlKey = normalizeLinkedInProfileUrl(item.linkedinUrl);
    if (urlKey && urlToContactId.has(urlKey)) {
      outcomes.push({
        rowId: item.rowId,
        status: "duplicate",
        existingContactId: urlToContactId.get(urlKey),
      });
      continue;
    }

    const emailKey = normalizeEmailKey(item.email);
    if (emailKey) {
      const existing = clientEmailToContactId.get(
        `${item.clientId}|${emailKey}`,
      );
      if (existing) {
        outcomes.push({
          rowId: item.rowId,
          status: "duplicate",
          existingContactId: existing,
        });
        continue;
      }
    }

    if (urlKey) {
      if (batchUrls.has(urlKey)) {
        outcomes.push({ rowId: item.rowId, status: "duplicate_in_batch" });
        continue;
      }
      batchUrls.add(urlKey);
    }
    if (emailKey) {
      const key = `${item.clientId}|${emailKey}`;
      if (batchClientEmails.has(key)) {
        outcomes.push({ rowId: item.rowId, status: "duplicate_in_batch" });
        continue;
      }
      batchClientEmails.add(key);
    }

    outcomes.push({ rowId: item.rowId, status: "would_import" });
  }

  return outcomes;
}

export async function createContactsBatch(
  items: ContactImportInput[],
): Promise<ContactImportOutcome[]> {
  const planned = await planContactImport(items);
  return withPostgresTransaction(async (client) => {
    const outcomes: ContactImportOutcome[] = [];
    for (let index = 0; index < planned.length; index += 1) {
      const outcome = planned[index];
      if (outcome.status !== "would_import") {
        outcomes.push(outcome);
        continue;
      }
      const item = items[index];
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO contacts (id, client_id, full_name, job_title, email, linkedin_url, notes, is_primary)
         SELECT $1, c.id, $2, $3, $4, $5, NULL, 0
         FROM clients c WHERE c.id = $6 AND c.is_active = 1
         RETURNING id`,
        [
          randomUUID(),
          item.fullName.trim(),
          item.jobTitle || null,
          item.email || null,
          item.linkedinUrl || null,
          item.clientId,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        outcomes.push({ rowId: item.rowId, status: "invalid_client" });
      } else {
        outcomes.push({
          rowId: item.rowId,
          status: "imported",
          contactId: row.id,
        });
      }
    }
    return outcomes;
  });
}

export const postgresContactsRepository: ContactsRepository = {
  createContact,
  getContact,
  deactivateContact,
  reactivateContact,
  updateContact,
  listContacts,
  planContactImport,
  createContactsBatch,
};
