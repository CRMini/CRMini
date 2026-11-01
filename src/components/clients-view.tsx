"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import Image from "next/image";
import EmptyState from "@/components/empty-state";
import { useEffect, useState } from "react";

type Client = {
  id: string;
  company_name: string;
  trade_name?: string;
  industry?: string;
  phone?: string;
  email?: string;
  city?: string;
  logo_path?: string;
  is_active?: boolean;
  contacts: { full_name: string; email?: string; is_primary: boolean }[];
};

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      fetch(`/api/clients${query ? `?q=${encodeURIComponent(query)}` : ""}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (active) { setClients(data); setError(""); }
        })
        .catch((reason: Error) => { if (active) setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    };
    if (!query) load();
    else { const timer = setTimeout(load, 200); return () => { active = false; clearTimeout(timer); }; }
    return () => { active = false; };
  }, [query]);

  async function deactivate(id: string) {
    if (!window.confirm("Desativar este cliente? O histórico será preservado."))
      return;
    try {
      const response = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!response.ok)
        throw new Error("Não foi possível desativar o cliente.");
      setClients((current) =>
        current.map((client) =>
          client.id === id ? { ...client, is_active: false } : client,
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <main className="records-page">
      <Breadcrumbs
        items={[{ label: "Meu espaço", href: "/" }, { label: "Clientes" }]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Clientes</h1>
          <p className="subheading">
            Empresas e pessoas de contato em um só lugar.
          </p>
        </div>
        <Link className="primary-button" href="/clientes/novo">
          ＋ Novo cliente
        </Link>
      </header>
      <div className="records-toolbar">
        <input
          aria-label="Buscar clientes"
          placeholder="Buscar empresa ou contato..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{clients.length} cliente(s)</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p role="status">Carregando clientes...</p> : error ? null : clients.length === 0 ? (
        <EmptyState
          icon="◎"
          title="Nenhum cliente cadastrado"
          description="Comece adicionando uma empresa e seus contatos."
          action={
            <Link className="primary-button" href="/clientes/novo">
              Cadastrar primeiro cliente
            </Link>
          }
        />
      ) : (
        <div className="client-list">
          {clients.map((client) => {
            const main =
              client.contacts?.find((contact) => contact.is_primary) ||
              client.contacts?.[0];
            return (
              <article className="client-row" key={client.id}>
                <div className="company-logo">
                  {client.logo_path ? (
                    <Image
                      src={client.logo_path}
                      alt={`Logo ${client.company_name}`}
                      width={56}
                      height={56}
                      unoptimized
                    />
                  ) : (
                    client.company_name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="company-info">
                  <b>
                    {client.company_name} {!client.is_active && "(Desativado)"}
                  </b>
                  <small>Nome fantasia: {client.trade_name || "—"}</small>
                </div>
                <div className="company-meta">
                  <span>
                    <b>Telefone</b>
                    {client.phone || "—"}
                  </span>
                  <span>
                    <b>Segmento</b>
                    {client.industry || "—"}
                  </span>
                </div>
                <div className="company-contact">
                  <b>{main?.full_name || "Sem contato"}</b>
                  <small>
                    {main?.email || client.email || "Nenhum e-mail"}
                  </small>
                </div>
                <Link
                  className="client-row-link"
                  href={`/clientes/${client.id}`}
                  aria-label={`Ver detalhes de ${client.company_name}`}
                />
                <span className="client-row-actions">
                  <Link
                    className="text-link"
                    href={`/clientes/${client.id}/editar`}
                    aria-label={`Editar cliente ${client.company_name}`}
                  >
                    Editar →
                  </Link>
                  {client.is_active && (
                    <button
                      type="button"
                      className="filter-button"
                      onClick={() => deactivate(client.id)}
                    >
                      Desativar
                    </button>
                  )}
                </span>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
