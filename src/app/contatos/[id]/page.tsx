import ContactForm from "@/components/contact-form";

export default async function EditContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const returnTo =
    typeof query.returnTo === "string" ? query.returnTo : undefined;
  return <ContactForm id={id} returnTo={returnTo} />;
}
