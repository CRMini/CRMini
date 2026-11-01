"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import EventTimeline from "@/components/event-timeline";
import { formatBrazilDate } from "@/lib/brazil-date";
import { formatCepForDisplay, formatCnpjForDisplay } from "@/lib/masks";
import { formatPhoneForDisplay } from "@/lib/phone";

type Contact = {
  id: string;
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  birthday?: string | null;
  linkedin_url?: string | null;
  is_primary?: boolean;
  is_active?: boolean;
};

type Client = {
  id: string;
  company_name: string;
  trade_name?: string | null;
  tax_id?: string | null;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  postal_code?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  logo_path?: string | null;
  is_active?: boolean;
  contacts?: Contact[];
};

const breadcrumbs = [
  { label: "Meu espaço", href: "/" },
  { label: "Clientes", href: "/clientes" },
  { label: "Detalhes do cliente" },
];

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="client-detail-item">
      <b>{label}</b>
      <span>{value?.trim() || "—"}</span>
    </div>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <article className="client-detail-contact">
      <div className="client-detail-contact-heading">
        <b>{contact.full_name}</b>
        {contact.is_primary && (
          <span className="client-detail-badge">Principal</span>
        )}
      </div>
      {contact.job_title && <small>{contact.job_title}</small>}
      <div className="client-detail-contact-meta">
        <span>
          <b>E-mail</b>
          {contact.email || "—"}
        </span>
        <span>
          <b>Telefone</b>
          {formatPhoneForDisplay(contact.phone) || "—"}
        </span>
        <span>
          <b>Celular</b>
          {formatPhoneForDisplay(contact.mobile) || "—"}
        </span>
        <span>
          <b>Aniversário</b>
          {formatBrazilDate(contact.birthday)}
        </span>
        <span>
          <b>LinkedIn</b>
          {contact.linkedin_url ? (
            <a
              className="text-link"
              href={contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
              aria-label={`LinkedIn de ${contact.full_name}`}
            >
              LinkedIn
            </a>
          ) : (
            "—"
          )}
        </span>
      </div>
    </article>
  );
}

export default function ClientDetail({ id }: { id: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    fetch(`/api/clients/${id}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Não foi possível carregar o cliente.");
        if (active) {
          setClient(result);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (active)
          setError(
            reason.message || "Não foi possível carregar o cliente.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const contacts = (client?.contacts ?? []).filter(
    (contact) => contact.is_active !== false,
  );
  const subtitle =
    [client?.trade_name, client?.industry].filter(Boolean).join(" · ") ||
    "Dados cadastrais do cliente.";

  return (
    <main className="records-page">
      <Breadcrumbs items={breadcrumbs} />
      {loading ? (
        <p role="status">Carregando cliente...</p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : client ? (
        <>
          <header className="records-header client-detail-header">
            <div className="client-detail-identity">
              <div className="client-detail-logo">
                {client.logo_path ? (
                  <Image
                    src={client.logo_path}
                    alt={`Logo ${client.company_name}`}
                    width={64}
                    height={64}
                    unoptimized
                  />
                ) : (
                  <span aria-hidden="true">
                    {client.company_name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="eyebrow">CLIENTE</p>
                <div className="client-detail-heading">
                  <h1>{client.company_name}</h1>
                  {client.is_active === false && (
                    <span className="client-status-badge">Desativado</span>
                  )}
                </div>
                <p className="subheading">{subtitle}</p>
              </div>
            </div>
            <Link className="primary-button" href={`/clientes/${id}/editar`}>
              Editar cliente
            </Link>
          </header>
          <div className="client-detail-sections">
            <EventTimeline
              clientId={id}
              contacts={contacts.map((contact) => ({
                id: contact.id,
                full_name: contact.full_name,
              }))}
            />
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Dados da empresa</h2>
                  <p>Informações principais do cliente.</p>
                </div>
              </div>
              <div className="client-detail-grid">
                <DetailItem
                  label="Razão social / nome da empresa"
                  value={client.company_name}
                />
                <DetailItem label="Nome fantasia" value={client.trade_name} />
                <DetailItem
                  label="CNPJ"
                  value={formatCnpjForDisplay(client.tax_id)}
                />
                <DetailItem label="Segmento" value={client.industry} />
                <DetailItem label="Site" value={client.website} />
                <DetailItem
                  label="Telefone geral"
                  value={formatPhoneForDisplay(client.phone)}
                />
                <DetailItem label="E-mail geral" value={client.email} />
              </div>
            </section>
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Endereço</h2>
                  <p>Localização da empresa.</p>
                </div>
              </div>
              <div className="client-detail-grid">
                <DetailItem
                  label="CEP"
                  value={formatCepForDisplay(client.postal_code)}
                />
                <DetailItem label="País" value={client.country} />
                <DetailItem label="Logradouro" value={client.street} />
                <DetailItem label="Número" value={client.street_number} />
                <DetailItem label="Complemento" value={client.complement} />
                <DetailItem label="Cidade" value={client.city} />
                <DetailItem label="Estado" value={client.state} />
              </div>
            </section>
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Pessoas de contato</h2>
                  <p>Pessoas relacionadas a esta empresa.</p>
                </div>
                <Link
                  className="filter-button"
                  href={`/clientes/${id}/editar`}
                >
                  Editar contatos
                </Link>
              </div>
              {contacts.length === 0 ? (
                <p className="client-detail-empty">
                  Nenhum contato ativo cadastrado.
                </p>
              ) : (
                <div className="client-detail-contacts">
                  {contacts.map((contact) => (
                    <ContactCard contact={contact} key={contact.id} />
                  ))}
                </div>
              )}
            </section>
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Observações</h2>
                  <p>Notas internas sobre este cliente.</p>
                </div>
              </div>
              {client.notes ? (
                <p className="client-detail-notes">{client.notes}</p>
              ) : (
                <p className="client-detail-empty">
                  Nenhuma observação registrada.
                </p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
