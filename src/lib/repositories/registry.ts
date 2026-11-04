import * as clients from "./clients";
import * as contacts from "./contacts";
import * as events from "./events";
import * as opportunities from "./opportunities";
import * as tasks from "./tasks";
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
import { sqliteDashboardRepository } from "./sqlite/dashboard";
import { sqliteSettingsRepository } from "./sqlite/settings";

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

// Os domínios ainda não migrados já são implementações SQLite e continuam
// sendo importados dos módulos públicos até a movimentação planejada.
function createSqliteRepositories(): Repositories {
  return {
    clients,
    contacts,
    opportunities,
    tasks,
    events,
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
