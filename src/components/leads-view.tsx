"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";
import { RowActionLink } from "@/components/row-action";
import { useEffect, useState } from "react";
import { formatBrazilDateTime } from "@/lib/brazil-date";
import { LEAD_STATUSES } from "@/lib/lead-status";

type Lead = {
  id: string;
  company_name: string;
  trade_name: string;
  tax_id: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  lead_source: string | null;
  industry: string | null;
  segment: string | null;
  city: string | null;
  country: string | null;
  updated_at: string;
};

function contactName(lead: Lead): string {
  const name = [lead.contact_first_name, lead.contact_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "Contato não informado";
}

function companyInitials(lead: Lead): string {
  return lead.company_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      for (const item of statuses) params.append("status", item);
      fetch(`/api/leads${params.size ? `?${params}` : ""}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Falha ao carregar leads.");
          if (active) {
            setLeads(data);
            setError("");
          }
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    if (!query && !statuses.length) load();
    else {
      const timer = setTimeout(load, 200);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [query, statuses]);

  const hasFilter = query.trim() !== "" || statuses.length > 0;

  function toggleStatus(status: string) {
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

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
        <Link className="primary-button" href="/leads/novo">
          ＋ Novo lead
        </Link>
      </header>
      <div className="contact-filters">
        <input
          aria-label="Buscar leads"
          placeholder="Buscar por empresa, nome fantasia, contato ou CNPJ..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <details className="lead-status-filter">
          <summary className="filter-button">
            Status
            {statuses.length > 0 && ` (${statuses.length})`}
          </summary>
          <div className="lead-status-options" role="group" aria-label="Status do lead">
            {LEAD_STATUSES.map((item) => (
              <label key={item} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={statuses.includes(item)}
                  onChange={() => toggleStatus(item)}
                />
                {item}
              </label>
            ))}
          </div>
        </details>
        <span className="contact-count">{leads.length} lead(s)</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando leads...</p>
      ) : error ? null : !leads.length ? (
        hasFilter ? (
          <EmptyState
            icon="◎"
            title="Nenhum lead encontrado"
            description="Experimente ajustar a busca ou o filtro de status."
          />
        ) : (
          <EmptyState
            icon="◎"
            title="Nenhum lead cadastrado"
            description="Quando você começar o cadastro, os leads em qualificação aparecerão aqui."
            action={
              <Link className="text-link" href="/leads/novo">
                Cadastrar primeiro lead →
              </Link>
            }
          />
        )
      ) : (
        <div className="contact-list">
          {leads.map((lead) => (
            <article className="contact-row lead-row" key={lead.id}>
              <div className="contact-list-avatar" aria-hidden="true">
                {companyInitials(lead)}
              </div>
              <div className="contact-list-company">
                <span>
                  <b>{lead.company_name}</b>
                  <small>{lead.trade_name}</small>
                </span>
              </div>
              <div className="contact-list-person">
                <b>{contactName(lead)}</b>
                <small>{lead.contact_email || "—"}</small>
              </div>
              <div className="contact-list-details">
                <span>
                  <b>Status</b>
                  {lead.status}
                </span>
                <span>
                  <b>Origem</b>
                  {lead.lead_source || "—"}
                </span>
                <span>
                  <b>Atualizado em</b>
                  {formatBrazilDateTime(lead.updated_at)}
                </span>
              </div>
              <span className="contact-row-actions">
                <RowActionLink
                  href={`/leads/${lead.id}/editar`}
                  icon="✎"
                  label={`Editar lead ${lead.company_name}`}
                />
              </span>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
