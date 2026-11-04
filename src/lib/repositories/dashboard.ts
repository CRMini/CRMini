import type { DashboardMetrics } from "@/lib/dashboard-metrics";
import type { RecentOpportunity } from "@/lib/recent-opportunities";
import type { DashboardRepository } from "./contracts";
import { getRepositories } from "./registry";

export type { DashboardRepository } from "./contracts";

export function getDashboardRepository(): DashboardRepository {
  return getRepositories().dashboard;
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
