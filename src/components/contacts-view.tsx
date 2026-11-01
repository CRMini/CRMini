"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import Image from "next/image";
import { useEffect, useState } from "react";
import { formatBrazilDate } from "@/lib/project-time";
import { CLIENT_SEGMENTS } from "@/lib/segments";

type Contact = {
  id: string;
  full_name: string;
  job_title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  birthday?: string;
  linkedin_url?: string;
  is_primary: boolean;
  is_active: boolean;
  client_id: string;
  company_name: string;
  trade_name?: string;
  industry?: string;
  logo_path?: string;
};

export default function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (segment) params.set("segment", segment);
      if (includeInactive) params.set("include_inactive", "1");
      fetch(`/api/contacts${params.size ? `?${params}` : ""}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Falha ao carregar contatos.");
          if (active) { setContacts(data); setError(""); setActionError(""); }
        })
        .catch((reason: Error) => { if (active) setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    };
    if (!query && !segment) load();
    else { const timer = setTimeout(load, 200); return () => { active = false; clearTimeout(timer); }; }
    return () => { active = false; };
  }, [query, segment, includeInactive]);

  async function changeActive(contact: Contact) {
    if (contact.is_active && !window.confirm("Desativar este contato? O histórico será preservado.")) return;
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !contact.is_active }) });
      let updated: { is_active: boolean } | undefined;
      try { updated = await response.json(); } catch { updated = undefined; }
      if (!response.ok) { setActionError(updated && "error" in updated ? String((updated as { error: string }).error) : "Não foi possível atualizar o contato."); return; }
      if (!updated) throw new Error("Não foi possível atualizar o contato.");
      setActionError("");
      setContacts((current) => includeInactive ? current.map((item) => item.id === contact.id ? { ...item, is_active: updated!.is_active } : item) : current.filter((item) => item.id !== contact.id));
    } catch {
      setActionError("Não foi possível atualizar o contato.");
    }
  }

  return (
    <main className="records-page">
      <Breadcrumbs
        items={[{ label: "Meu espaço", href: "/" }, { label: "Contatos" }]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Contatos</h1>
          <p className="subheading">
            Pessoas e informações de contato dos seus clientes.
          </p>
        </div>
        <div className="records-header-actions">
          <Link className="filter-button" href="/contatos/importar">
            Importar do LinkedIn
          </Link>
          <Link className="primary-button" href="/contatos/novo">
            ＋ Novo contato
          </Link>
        </div>
      </header>
      <div className="contact-filters">
        <input
          aria-label="Buscar contatos"
          placeholder="Buscar por nome, empresa, e-mail ou telefone..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          <span>Segmento</span>
          <select
            aria-label="Filtrar por segmento"
            value={segment}
            onChange={(event) => setSegment(event.target.value)}
          >
            <option value="">Todos</option>
            {CLIENT_SEGMENTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="contact-filter-meta">
          <span className="contact-count">{contacts.length} contato(s)</span>
          <label className="contact-filter-toggle"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} /><span>Mostrar desativados</span></label>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {loading ? <p role="status">Carregando contatos...</p> : error ? null : !contacts.length ? (
        <div className="empty-state">
          <span>♙</span>
          <h2>Nenhum contato encontrado</h2>
          <p>Experimente ajustar a busca ou o filtro de segmento.</p>
          <Link className="text-link" href="/clientes">
            Ver clientes →
          </Link>
        </div>
      ) : (
        <div className="contact-list">
          {contacts.map((contact) => (
            <article className="contact-row" key={contact.id}>
              <div className="contact-list-avatar">
                {contact.full_name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="contact-list-person">
                <div className="contact-name-line">
                  <b>{contact.full_name}{!contact.is_active && " (Desativado)"}</b>
                  {contact.is_primary && (
                    <span className="primary-badge">Principal</span>
                  )}
                </div>
                <small>{contact.job_title || "Cargo não informado"}</small>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                ) : (
                  <span>E-mail não informado</span>
                )}
              </div>
              <div className="contact-list-company">
                {contact.logo_path ? (
                  <Image
                    src={contact.logo_path}
                    alt=""
                    width={30}
                    height={30}
                    unoptimized
                  />
                ) : (
                  <span className="company-mini-mark">
                    {contact.company_name.slice(0, 1)}
                  </span>
                )}
                <span>
                  <Link href={`/clientes/${contact.client_id}`}>
                    {contact.trade_name || contact.company_name}
                  </Link>
                  <small>{contact.industry || "Segmento não informado"}</small>
                </span>
              </div>
              <div className="contact-list-details">
                <span>
                  <b>Telefone</b>
                  {contact.mobile || contact.phone || "—"}
                </span>
                <span>
                  <b>Aniversário</b>
                  {formatBrazilDate(contact.birthday)}
                </span>
              </div>
              {contact.linkedin_url ? (
                <a
                  className="linkedin-link"
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`LinkedIn de ${contact.full_name}`}
                >
                  in
                </a>
              ) : (
                <span className="linkedin-placeholder" aria-hidden="true">
                  in
                </span>
              )}
               <span className="contact-row-actions"><Link className="text-link" href={`/contatos/${contact.id}`} aria-label={`Editar contato ${contact.full_name}`}>Editar →</Link> <button className="filter-button" type="button" aria-label={`${contact.is_active ? "Desativar" : "Reativar"} contato ${contact.full_name}`} onClick={() => void changeActive(contact)}>{contact.is_active ? "Desativar" : "Reativar"}</button></span>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
