import { getRepositories } from "./registry";

export function listOpportunities(
  query: string | null,
  clientId: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getRepositories().opportunities.listOpportunities(
    query,
    clientId,
    status,
  );
}

export function createOpportunity(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().opportunities.createOpportunity(body);
}

export function changeOpportunityStatus(
  id: string,
  status: string,
  reason: string | null,
): Promise<Record<string, any> | null> {
  return getRepositories().opportunities.changeOpportunityStatus(
    id,
    status,
    reason,
  );
}

export function updateOpportunity(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().opportunities.updateOpportunity(id, body);
}

export function getOpportunity(
  id: string,
): Promise<Record<string, any> | null> {
  return getRepositories().opportunities.getOpportunity(id);
}
