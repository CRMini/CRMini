import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";

export default function LeadsView() {
  return (
    <main className="records-page">
      <Breadcrumbs
        items={[{ label: "Meu espaço", href: "/" }, { label: "Leads" }]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Leads</h1>
          <p className="subheading">
            Empresas em qualificação comercial antes de virarem clientes.
          </p>
        </div>
      </header>
      <EmptyState
        icon="◎"
        title="Nenhum lead cadastrado"
        description="Quando você começar o cadastro, os leads em qualificação aparecerão aqui."
      />
    </main>
  );
}
