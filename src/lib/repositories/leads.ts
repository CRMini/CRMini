import { getRepositories } from "./registry";
import type { LeadReference, LeadReferenceType } from "@/lib/lead-references";

export function listLeads(
  search: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getRepositories().leads.listLeads(search, status);
}

export function listLeadReferences(): Promise<
  Record<LeadReferenceType, LeadReference[]>
> {
  return getRepositories().leads.listLeadReferences();
}

export function createLeadReference(
  type: LeadReferenceType,
  name: string,
): Promise<LeadReference | null> {
  return getRepositories().leads.createLeadReference(type, name);
}

export function createLead(
  body: Record<string, unknown>,
): Promise<{ id: string } | null> {
  return getRepositories().leads.createLead(body);
}
