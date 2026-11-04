import { getDb } from "@/lib/db";
import {
  getDashboardMetrics,
  type DashboardMetricRow,
} from "@/lib/dashboard-metrics";
import {
  getRecentOpportunities as queryRecentOpportunities,
  type RecentOpportunity,
} from "@/lib/recent-opportunities";
import type { DashboardRepository } from "../contracts";

export const sqliteDashboardRepository: DashboardRepository = {
  getMetrics: () =>
    getDashboardMetrics((sql) => ({
      rows: [getDb().prepare(sql).get() as DashboardMetricRow],
    })),
  getRecentOpportunities: () =>
    queryRecentOpportunities((sql) => ({
      rows: getDb().prepare(sql).all() as RecentOpportunity[],
    })),
};
