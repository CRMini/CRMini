import OpportunitiesView from "@/components/opportunities-view";

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OpportunitiesView mode="edit" id={id} />;
}
