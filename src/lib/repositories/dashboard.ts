import { getDb } from "@/lib/db";
import {
  getDashboardMetrics,
  type DashboardMetricRow,
  type DashboardMetrics,
} from "@/lib/dashboard-metrics";
import {
  getRecentOpportunities as queryRecentOpportunities,
  type RecentOpportunity,
} from "@/lib/recent-opportunities";

/** Read-only data contract consumed by the dashboard, independent of SQLite. */
export interface DashboardRepository {
  getMetrics(): Promise<DashboardMetrics>;
  getRecentOpportunities(): Promise<RecentOpportunity[]>;
}

const sqliteDashboardRepository: DashboardRepository = {
  getMetrics: () =>
    getDashboardMetrics((sql) => ({
      rows: [getDb().prepare(sql).get() as DashboardMetricRow],
    })),
  getRecentOpportunities: () =>
    queryRecentOpportunities((sql) => ({
      rows: getDb().prepare(sql).all() as RecentOpportunity[],
    })),
};

/** Persistence selection is deliberately centralized here for future drivers. */
export function getDashboardRepository(): DashboardRepository {
  return sqliteDashboardRepository;
}

export function getDashboardData(): Promise<{
  opportunities: RecentOpportunity[];
  metrics: DashboardMetrics;
}> {
  const repository = getDashboardRepository();
  return Promise.all([
    repository.getRecentOpportunities(),
    repository.getMetrics(),
  ]).then(([opportunities, metrics]) => ({ opportunities, metrics }));
}
