import { getDb } from "@/lib/db";
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

export async function createContact(input: Record<string, any>) {
  const result = getDb()
    .prepare(
      `INSERT INTO contacts (id, client_id, full_name, job_title, email, phone, mobile, birthday, linkedin_url, notes, is_primary)
       SELECT @id, c.id, @full_name, @job_title, @email, @phone, @mobile, @birthday, @linkedin_url, @notes, @is_primary
       FROM clients c WHERE c.id = @client_id AND c.is_active = 1
       RETURNING *`,
    )
    .get({
      id: randomUUID(), client_id: input.client_id, full_name: input.full_name.trim(),
      job_title: input.job_title || null, email: input.email || null,
      phone: input.phone || null, mobile: input.mobile || null,
      birthday: input.birthday || null, linkedin_url: input.linkedin_url || null,
      notes: input.notes || null, is_primary: input.is_primary ? 1 : 0,
    });
  return result;
}

export async function getContact(id: string): Promise<Record<string, any> | undefined> {
  const row = getDb().prepare(
    `SELECT p.*, c.company_name, c.trade_name, c.industry
     FROM contacts p JOIN clients c ON c.id = p.client_id WHERE p.id = @id`,
  ).get({ id }) as Record<string, any> | undefined;
  return row ? { ...row, is_primary: Boolean(row.is_primary), is_active: Boolean(row.is_active) } : undefined;
}

async function setContactActive(id: string, isActive: boolean): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("UPDATE contacts SET is_active = @active, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id").run({ id, active: isActive ? 1 : 0 });
  return result.changes > 0 || Boolean(db.prepare("SELECT 1 FROM contacts WHERE id = ?").get(id));
}
export const deactivateContact = (id: string) => setContactActive(id, false);
export const reactivateContact = (id: string) => setContactActive(id, true);

export async function updateContact(id: string, input: Record<string, any>) {
  const result = getDb().prepare(
    `UPDATE contacts SET full_name = @full_name, job_title = @job_title,
     email = @email, phone = @phone, mobile = @mobile, birthday = @birthday,
     linkedin_url = @linkedin_url, notes = @notes, is_primary = @is_primary,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`,
  ).run({
    id, full_name: input.full_name.trim(), job_title: input.job_title || null,
    email: input.email || null, phone: input.phone || null, mobile: input.mobile || null,
    birthday: input.birthday || null, linkedin_url: input.linkedin_url || null,
    notes: input.notes || null, is_primary: input.is_primary ? 1 : 0,
  });
  return result.changes ? getContact(id) : undefined;
}

export async function listContacts(
  query: string | null,
  industry: string | null,
  includeInactive = false,
): Promise<Record<string, any>[]> {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.full_name, p.job_title, p.email, p.phone, p.mobile,
        p.birthday, p.linkedin_url, p.notes, p.is_primary, p.is_active, p.client_id,
        c.company_name, c.trade_name, c.industry, c.logo_path
       FROM contacts p JOIN clients c ON c.id = p.client_id
       WHERE (@include_inactive = 1 OR p.is_active = 1)
         AND (@query IS NULL OR normalize(p.full_name) LIKE '%' || normalize(@query) || '%'
         OR normalize(p.email) LIKE '%' || normalize(@query) || '%' OR normalize(p.job_title) LIKE '%' || normalize(@query) || '%'
         OR normalize(p.phone) LIKE '%' || normalize(@query) || '%' OR normalize(p.mobile) LIKE '%' || normalize(@query) || '%'
         OR (phone_digits(@query) <> ''
           AND (phone_digits(p.phone) LIKE '%' || phone_digits(@query) || '%'
             OR phone_digits(p.mobile) LIKE '%' || phone_digits(@query) || '%'))
         OR normalize(c.company_name) LIKE '%' || normalize(@query) || '%' OR normalize(c.trade_name) LIKE '%' || normalize(@query) || '%')
         AND (@industry IS NULL OR c.industry = @industry)
       ORDER BY c.company_name, p.is_primary DESC, p.full_name`,
    )
    .all({ query, industry, include_inactive: includeInactive ? 1 : 0 }) as Record<string, any>[];
  return rows.map((row) => ({ ...row, is_primary: Boolean(row.is_primary), is_active: Boolean(row.is_active) }));
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

  const db = getDb();

  const activeContacts = db
    .prepare(
      `SELECT id, client_id, linkedin_url, email FROM contacts
       WHERE is_active = 1 AND (linkedin_url IS NOT NULL OR email IS NOT NULL)`,
    )
    .all() as Array<{
    id: string;
    client_id: string;
    linkedin_url: string | null;
    email: string | null;
  }>;

  const urlToContactId = new Map<string, string>();
  const clientEmailToContactId = new Map<string, string>();
  for (const contact of activeContacts) {
    const urlKey = normalizeLinkedInProfileUrl(contact.linkedin_url);
    if (urlKey) urlToContactId.set(urlKey, contact.id);
    const emailKey = normalizeEmailKey(contact.email);
    if (emailKey) {
      clientEmailToContactId.set(`${contact.client_id}|${emailKey}`, contact.id);
    }
  }

  const clientIds = [...new Set(items.map((item) => item.clientId).filter(Boolean))];
  const activeClientIds = new Set<string>();
  for (let offset = 0; offset < clientIds.length; offset += CLIENT_QUERY_BLOCK) {
    const block = clientIds.slice(offset, offset + CLIENT_QUERY_BLOCK);
    const placeholders = block.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT id FROM clients WHERE is_active = 1 AND id IN (${placeholders})`)
      .all(...block) as Array<{ id: string }>;
    for (const row of rows) activeClientIds.add(row.id);
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
      const existing = clientEmailToContactId.get(`${item.clientId}|${emailKey}`);
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
  const db = getDb();
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, client_id, full_name, job_title, email, linkedin_url, notes, is_primary)
     SELECT @id, c.id, @full_name, @job_title, @email, @linkedin_url, NULL, 0
     FROM clients c WHERE c.id = @client_id AND c.is_active = 1
     RETURNING id`,
  );
  const run = db.transaction((): ContactImportOutcome[] => {
    const outcomes: ContactImportOutcome[] = [];
    for (let index = 0; index < planned.length; index += 1) {
      const outcome = planned[index];
      if (outcome.status !== "would_import") {
        outcomes.push(outcome);
        continue;
      }
      const item = items[index];
      const inserted = insertContact.get({
        id: randomUUID(),
        client_id: item.clientId,
        full_name: item.fullName.trim(),
        job_title: item.jobTitle || null,
        email: item.email || null,
        linkedin_url: item.linkedinUrl || null,
      }) as { id: string } | undefined;
      if (!inserted) {
        outcomes.push({ rowId: item.rowId, status: "invalid_client" });
      } else {
        outcomes.push({
          rowId: item.rowId,
          status: "imported",
          contactId: inserted.id,
        });
      }
    }
    return outcomes;
  });
  return run();
}

export const sqliteContactsRepository: ContactsRepository = {
  createContact,
  getContact,
  deactivateContact,
  reactivateContact,
  updateContact,
  listContacts,
  planContactImport,
  createContactsBatch,
};
