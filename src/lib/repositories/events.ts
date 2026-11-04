import type { EventListFilters } from "./contracts";
import { getRepositories } from "./registry";

export type { EventListFilters } from "./contracts";

export function listEvents(
  filters: EventListFilters = {},
): Promise<Record<string, any>[]> {
  return getRepositories().events.listEvents(filters);
}

export function getEvent(id: string): Promise<Record<string, any> | null> {
  return getRepositories().events.getEvent(id);
}

export function createEvent(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().events.createEvent(body);
}

export function updateEvent(
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().events.updateEvent(id, body);
}

export function deactivateEvent(
  id: string,
): Promise<Record<string, any> | null> {
  return getRepositories().events.deactivateEvent(id);
}
