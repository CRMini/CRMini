import type { ContactImportInput, ContactImportOutcome } from "./contracts";
import { getRepositories } from "./registry";

export type {
  ContactImportInput,
  ContactImportOutcome,
  ContactImportStatus,
} from "./contracts";

export function createContact(input: Record<string, any>): Promise<unknown> {
  return getRepositories().contacts.createContact(input);
}

export function getContact(
  id: string,
): Promise<Record<string, any> | undefined> {
  return getRepositories().contacts.getContact(id);
}

export function deactivateContact(id: string): Promise<boolean> {
  return getRepositories().contacts.deactivateContact(id);
}

export function reactivateContact(id: string): Promise<boolean> {
  return getRepositories().contacts.reactivateContact(id);
}

export function updateContact(
  id: string,
  input: Record<string, any>,
): Promise<Record<string, any> | undefined> {
  return getRepositories().contacts.updateContact(id, input);
}

export function listContacts(
  query: string | null,
  industry: string | null,
  includeInactive = false,
): Promise<Record<string, any>[]> {
  return getRepositories().contacts.listContacts(
    query,
    industry,
    includeInactive,
  );
}

export function planContactImport(
  items: ContactImportInput[],
): Promise<ContactImportOutcome[]> {
  return getRepositories().contacts.planContactImport(items);
}

export function createContactsBatch(
  items: ContactImportInput[],
): Promise<ContactImportOutcome[]> {
  return getRepositories().contacts.createContactsBatch(items);
}
