import type { DashboardMetrics } from "@/lib/dashboard-metrics";
import type { RecentOpportunity } from "@/lib/recent-opportunities";
import type { EventListFilters } from "./events";

/**
 * Contratos públicos da camada de persistência.
 *
 * As assinaturas reproduzem exatamente as funções exportadas pelos módulos de
 * repositório atuais; os consumidores continuam importando os módulos públicos
 * e a implementação concreta fica a cargo do provedor selecionado.
 */

export type ContactImportInput = {
  rowId: number;
  clientId: string;
  fullName: string;
  jobTitle?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
};

export type ContactImportStatus =
  | "imported"
  | "would_import"
  | "duplicate"
  | "duplicate_in_batch"
  | "invalid_client"
  | "invalid_name";

export type ContactImportOutcome = {
  rowId: number;
  status: ContactImportStatus;
  contactId?: string;
  existingContactId?: string;
};

export interface ClientsRepository {
  listClients(search: string | null): Promise<Record<string, any>[]>;
  listClientOptions(includeInactive?: boolean): Promise<
    Array<{
      id: string;
      company_name: string;
      trade_name: string | null;
      is_active: boolean;
    }>
  >;
  createClient(body: Record<string, any>): Promise<Record<string, any>>;
  getClient(
    id: string,
  ): Promise<{ client: Record<string, any> | undefined; found: boolean }>;
  updateClient(
    id: string,
    body: Record<string, any>,
  ): Promise<Record<string, any> | null>;
  deactivateClient(id: string): Promise<{ found: boolean; row: unknown }>;
}

export interface ContactsRepository {
  createContact(input: Record<string, any>): Promise<unknown>;
  getContact(id: string): Promise<Record<string, any> | undefined>;
  deactivateContact(id: string): Promise<boolean>;
  reactivateContact(id: string): Promise<boolean>;
  updateContact(
    id: string,
    input: Record<string, any>,
  ): Promise<Record<string, any> | undefined>;
  listContacts(
    query: string | null,
    industry: string | null,
    includeInactive?: boolean,
  ): Promise<Record<string, any>[]>;
  planContactImport(
    items: ContactImportInput[],
  ): Promise<ContactImportOutcome[]>;
  createContactsBatch(
    items: ContactImportInput[],
  ): Promise<ContactImportOutcome[]>;
}

export interface OpportunitiesRepository {
  listOpportunities(
    query: string | null,
    clientId: string | null,
    status: string | null,
  ): Promise<Record<string, any>[]>;
  createOpportunity(
    body: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  changeOpportunityStatus(
    id: string,
    status: string,
    reason: string | null,
  ): Promise<Record<string, any> | null>;
  updateOpportunity(
    id: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  getOpportunity(id: string): Promise<Record<string, any> | null>;
}

export interface TasksRepository {
  listTasks(
    start: string | null,
    end: string | null,
    status: string | null,
  ): Promise<Record<string, any>[]>;
  createTask(
    body: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  updateTaskStatus(
    id: string,
    status: unknown,
  ): Promise<Record<string, any> | null>;
}

export interface EventsRepository {
  listEvents(filters?: EventListFilters): Promise<Record<string, any>[]>;
  getEvent(id: string): Promise<Record<string, any> | null>;
  createEvent(
    body: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  updateEvent(
    id: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
  deactivateEvent(id: string): Promise<Record<string, any> | null>;
}

export interface SettingsRepository {
  getUserName(): Promise<string | null>;
  saveUserName(name: string | null): Promise<void>;
}

/** Contrato read-only consumido pelo painel, independente do banco. */
export interface DashboardRepository {
  getMetrics(): Promise<DashboardMetrics>;
  getRecentOpportunities(): Promise<RecentOpportunity[]>;
}
