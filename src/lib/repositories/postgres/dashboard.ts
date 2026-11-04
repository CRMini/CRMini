import {
  sumOpenValuesByCurrency,
  type DashboardMetrics,
} from "@/lib/dashboard-metrics";
import {
  getRecentOpportunities as queryRecentOpportunities,
  type RecentOpportunity,
} from "@/lib/recent-opportunities";
import type { DashboardRepository } from "../contracts";
import { getPostgresPool } from "./connection";

interface DashboardCountRow {
  contacts_count: number;
  opportunities_count: number;
  open_opportunities_count: number;
  won_count: number;
  lost_count: number;
}

interface OpenValueRow {
  currency: string;
  value: string;
}

export async function getMetrics(): Promise<DashboardMetrics> {
  const pool = getPostgresPool();

  // COUNT(*) no PostgreSQL retorna bigint (int8), serializado como string pelo
  // driver; o ::int garante os mesmos números do SQLite, sem concatenação.
  const counts = await pool.query<DashboardCountRow>(
    `SELECT
       (SELECT COUNT(*) FROM contacts WHERE is_active = 1)::int AS contacts_count,
       (SELECT COUNT(*) FROM opportunities)::int AS opportunities_count,
       (SELECT COUNT(*) FROM opportunities WHERE status NOT IN ('Ganha', 'Perdida'))::int AS open_opportunities_count,
       (SELECT COUNT(*) FROM opportunities WHERE status = 'Ganha')::int AS won_count,
       (SELECT COUNT(*) FROM opportunities WHERE status = 'Perdida')::int AS lost_count`,
  );
  const row = counts.rows[0];

  if (!row) {
    throw new Error("A consulta do painel não retornou métricas.");
  }

  const openValues = await pool.query<OpenValueRow>(
    `SELECT currency, value
     FROM opportunities
     WHERE status NOT IN ('Ganha', 'Perdida') AND value IS NOT NULL`,
  );

  const decided = row.won_count + row.lost_count;

  return {
    contactsCount: row.contacts_count,
    opportunitiesCount: row.opportunities_count,
    openOpportunitiesCount: row.open_opportunities_count,
    conversionRate: decided ? Math.round((row.won_count / decided) * 100) : 0,
    openValueByCurrency: sumOpenValuesByCurrency(openValues.rows),
  };
}

export const postgresDashboardRepository: DashboardRepository = {
  getMetrics,
  getRecentOpportunities: () =>
    queryRecentOpportunities(async (sql) => ({
      rows: (await getPostgresPool().query<RecentOpportunity>(sql)).rows,
    })),
};
