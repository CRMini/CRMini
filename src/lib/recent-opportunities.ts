export interface RecentOpportunity {
  id: string;
  name: string;
  company_name: string;
  contact_name: string;
  status: string;
  value: string | number | null;
  currency: string;
  updated_at: string | Date;
}

type RecentOpportunitiesQuery = (
  statement: string,
) => { rows: RecentOpportunity[] } | Promise<{ rows: RecentOpportunity[] }>;

const recentOpportunitiesQuery = `SELECT o.id, o.name, c.company_name, p.full_name AS contact_name, o.status, o.value, o.currency, o.updated_at
  FROM opportunities o JOIN clients c ON c.id=o.client_id
  JOIN contacts p ON p.id=o.contact_id AND p.client_id=o.client_id
  ORDER BY o.created_at DESC, o.id DESC LIMIT 4`;

export async function getRecentOpportunities(
  query: RecentOpportunitiesQuery,
): Promise<RecentOpportunity[]> {
  const result = await query(recentOpportunitiesQuery);

  return result.rows;
}
