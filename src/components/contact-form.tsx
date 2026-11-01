"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import { formatPhone, formatPhoneForDisplay } from "@/lib/phone";

type Client = { id: string; company_name: string; is_active?: boolean };

export default function ContactForm({
  id,
  returnTo,
}: {
  id?: string;
  returnTo?: string;
}) {
  const safeReturnTo =
    returnTo === "/contatos/importar" ? returnTo : "/contatos";
  const backLabel =
    safeReturnTo === "/contatos/importar"
      ? "← Voltar à importação"
      : "← Voltar aos contatos";
  const [clients, setClients] = useState<Client[]>([]);
  const [contact, setContact] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const loadClients = fetch("/api/clients").then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar os clientes.");
      return response.json() as Promise<Client[]>;
    });
    const loadContact = id
      ? (async () => {
          let response: Response;
          try {
            response = await fetch(`/api/contacts/${id}`);
          } catch {
            throw new Error("Não foi possível carregar o contato.");
          }
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Não foi possível carregar o contato.");
          return result;
        })()
      : Promise.resolve(null);
    Promise.allSettled([loadClients, loadContact]).then(([clientsResult, contactResult]) => {
      if (clientsResult.status === "fulfilled") setClients(clientsResult.value);
      else setError("Não foi possível carregar os clientes.");
      if (contactResult.status === "fulfilled" && contactResult.value) {
        setContact(contactResult.value);
        setClients((current) => current.some((client) => client.id === contactResult.value.client_id)
          ? current
          : [...current, { id: contactResult.value.client_id, company_name: contactResult.value.company_name }]);
      } else if (contactResult.status === "rejected") {
        setError(contactResult.reason instanceof Error ? contactResult.reason.message : "Não foi possível carregar o contato.");
      }
    }).finally(() => setLoading(false));
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(id ? `/api/contacts/${id}` : "/api/contacts", {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (id ? "Não foi possível atualizar o contato." : "Não foi possível cadastrar o contato."));
      window.location.assign(safeReturnTo);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="records-page"><p role="status">Carregando contato...</p></main>;
  const edit = Boolean(id);
  if (id && error && !contact) return <main className="records-page">
    <Breadcrumbs items={[{ label: "Meu espaço", href: "/" }, { label: "Contatos", href: "/contatos" }, { label: "Editar contato" }]} />
    <header className="records-header"><div><p className="eyebrow">RELACIONAMENTO</p><h1>Editar contato</h1><p className="subheading">Atualize os dados do contato.</p></div><Link className="text-link" href={safeReturnTo}>{backLabel}</Link></header>
    <p className="form-error" role="alert">{error || "Não foi possível carregar o contato."}</p>
  </main>;
  return <main className="records-page">
    <Breadcrumbs items={[{ label: "Meu espaço", href: "/" }, { label: "Contatos", href: "/contatos" }, { label: edit ? "Editar contato" : "Novo contato" }]} />
    <header className="records-header"><div><p className="eyebrow">RELACIONAMENTO</p><h1>{edit ? "Editar contato" : "Novo contato"}</h1><p className="subheading">{edit ? "Atualize os dados do contato." : "Cadastre uma pessoa vinculada a um cliente."}</p></div><Link className="text-link" href={safeReturnTo}>{backLabel}</Link></header>
    <section className="form-section"><h2>Dados do contato</h2>
      <form key={contact?.id || "new"} className="client-form" onSubmit={submit}><div className="form-grid">
        <label className="form-field">Nome completo *<input name="full_name" required maxLength={200} defaultValue={contact?.full_name || ""} /></label>
        <label className="form-field">Cliente *<select name="client_id" required={!edit} defaultValue={contact?.client_id || ""} disabled={edit}><option value="" disabled>Selecione</option>{clients.filter((c) => c.is_active !== false || c.id === contact?.client_id).map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select>{edit && <small>O cliente não pode ser alterado.</small>}</label>
        <label className="form-field">Cargo<input name="job_title" maxLength={200} defaultValue={contact?.job_title || ""} /></label>
        <label className="form-field">E-mail<input name="email" type="email" maxLength={254} defaultValue={contact?.email || ""} /></label>
        <label className="form-field">Telefone<input name="phone" type="tel" defaultValue={formatPhoneForDisplay(contact?.phone)} placeholder="(11) 91234-5678" onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label>
        <label className="form-field">Celular<input name="mobile" type="tel" defaultValue={formatPhoneForDisplay(contact?.mobile)} placeholder="(11) 91234-5678" onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label>
        <label className="form-field">Aniversário<input name="birthday" type="date" defaultValue={contact?.birthday?.slice(0, 10) || ""} /></label>
        <label className="form-field">LinkedIn<input name="linkedin_url" type="url" maxLength={500} defaultValue={contact?.linkedin_url || ""} /></label>
        <label className="form-field">Observações<textarea name="notes" maxLength={5000} defaultValue={contact?.notes || ""} /></label>
        <label className="form-field"><span className="contact-primary-checkbox"><input name="is_primary" type="checkbox" value="true" defaultChecked={contact?.is_primary} /> Contato principal</span></label>
      </div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando…" : edit ? "Salvar contato" : "Cadastrar contato"}</button></form>
    </section>
  </main>;
}
