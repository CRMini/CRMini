import { getRepositories } from "./registry";

export function listClients(
  search: string | null,
): Promise<Record<string, any>[]> {
  return getRepositories().clients.listClients(search);
}

export function listClientOptions(includeInactive = false): Promise<
  Array<{
    id: string;
    company_name: string;
    trade_name: string | null;
    is_active: boolean;
  }>
> {
  return getRepositories().clients.listClientOptions(includeInactive);
}

export function createClient(
  body: Record<string, any>,
): Promise<Record<string, any>> {
  return getRepositories().clients.createClient(body);
}

export function getClient(
  id: string,
): Promise<{ client: Record<string, any> | undefined; found: boolean }> {
  return getRepositories().clients.getClient(id);
}

export function updateClient(
  id: string,
  body: Record<string, any>,
): Promise<Record<string, any> | null> {
  return getRepositories().clients.updateClient(id, body);
}

export function deactivateClient(
  id: string,
): Promise<{ found: boolean; row: unknown }> {
  return getRepositories().clients.deactivateClient(id);
}
