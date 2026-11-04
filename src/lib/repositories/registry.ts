import type {
  ClientsRepository,
  ContactsRepository,
  DashboardRepository,
  EventsRepository,
  OpportunitiesRepository,
  SettingsRepository,
  TasksRepository,
} from "./contracts";
import {
  resolvePersistenceProvider,
  type PersistenceProvider,
} from "./provider";
import { sqliteClientsRepository } from "./sqlite/clients";
import { sqliteContactsRepository } from "./sqlite/contacts";
import { sqliteDashboardRepository } from "./sqlite/dashboard";
import { sqliteEventsRepository } from "./sqlite/events";
import { sqliteOpportunitiesRepository } from "./sqlite/opportunities";
import { sqliteSettingsRepository } from "./sqlite/settings";
import { sqliteTasksRepository } from "./sqlite/tasks";

/** Conjunto completo de repositórios por domínio. */
export interface Repositories {
  clients: ClientsRepository;
  contacts: ContactsRepository;
  opportunities: OpportunitiesRepository;
  tasks: TasksRepository;
  events: EventsRepository;
  settings: SettingsRepository;
  dashboard: DashboardRepository;
}

function createSqliteRepositories(): Repositories {
  return {
    clients: sqliteClientsRepository,
    contacts: sqliteContactsRepository,
    opportunities: sqliteOpportunitiesRepository,
    tasks: sqliteTasksRepository,
    events: sqliteEventsRepository,
    settings: sqliteSettingsRepository,
    dashboard: sqliteDashboardRepository,
  };
}

let repositories: Repositories | undefined;

/** Resolve o conjunto de repositórios uma única vez por processo. */
export function getRepositories(): Repositories {
  if (repositories) return repositories;

  const provider: PersistenceProvider = resolvePersistenceProvider();

  switch (provider) {
    case "sqlite":
      repositories = createSqliteRepositories();
      break;
    default: {
      const unsupported: never = provider;
      throw new Error(
        `Driver de persistência sem implementação: "${unsupported}".`,
      );
    }
  }

  return repositories;
}
