import { getRepositories } from "./registry";
import type { LeadReference, LeadReferenceType } from "@/lib/lead-references";
import type { LeadConversionResult } from "./contracts";

export function listLeads(
  search: string | null,
  statuses: string[] | null,
): Promise<Record<string, any>[]> {
  return getRepositories().leads.listLeads(search, statuses);
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

export function getLead(id: string): Promise<Record<string, any> | null> {
  return getRepositories().leads.getLead(id);
}

export function updateLead(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().leads.updateLead(id, body);
}

export function convertLead(
  id: string,
  opportunity: Record<string, unknown>,
): Promise<LeadConversionResult | null> {
  return getRepositories().leads.convertLead(id, opportunity);
}
