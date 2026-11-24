import { getRepositories } from "./registry";

export function listLeads(
  search: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getRepositories().leads.listLeads(search, status);
}
