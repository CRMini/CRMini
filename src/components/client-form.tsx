"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { CLIENT_SEGMENTS } from "@/lib/segments";
import { formatPhone, formatPhoneForDisplay } from "@/lib/phone";
import {
  formatCep,
  formatCepForDisplay,
  formatCnpj,
  formatCnpjForDisplay,
} from "@/lib/masks";

type Contact = {
  id?: string;
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  mobile: string;
  birthday: string;
  linkedin_url: string;
  notes: string;
  is_primary: boolean;
};
type FormData = {
  company_name: string;
  trade_name: string;
  tax_id: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  postal_code: string;
  street: string;
  street_number: string;
  complement: string;
  city: string;
  state: string;
  country: string;
  notes: string;
  logo_path: string;
  contacts: Contact[];
};
const emptyContact = (): Contact => ({
  full_name: "",
  job_title: "",
  email: "",
  phone: "",
  mobile: "",
  birthday: "",
  linkedin_url: "",
  notes: "",
  is_primary: false,
});
const initial: FormData = {
  company_name: "",
  trade_name: "",
  tax_id: "",
  industry: "",
  website: "",
  phone: "",
  email: "",
  postal_code: "",
  street: "",
  street_number: "",
  complement: "",
  city: "",
  state: "",
  country: "Brasil",
  notes: "",
  logo_path: "",
  contacts: [emptyContact()],
};

export default function ClientForm({ id }: { id?: string }) {
  const router = useRouter();
  const [data, setData] = useState<FormData>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (id)
      fetch(`/api/clients/${id}`)
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setData({
            ...initial,
            ...result,
            tax_id: formatCnpjForDisplay(result.tax_id),
            postal_code: formatCepForDisplay(result.postal_code),
            phone: formatPhoneForDisplay(result.phone),
            contacts: result.contacts?.length
              ? result.contacts.map((contact: Contact) => ({
                  ...emptyContact(),
                  ...contact,
                  phone: formatPhoneForDisplay(contact.phone),
                  mobile: formatPhoneForDisplay(contact.mobile),
                  birthday: contact.birthday?.slice(0, 10) || "",
                }))
              : [emptyContact()],
          });
        })
        .catch((reason: Error) => setError(reason.message));
  }, [id]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }
  function updateContact(
    index: number,
    key: keyof Contact,
    value: string | boolean,
  ) {
    setData((current) => ({
      ...current,
      contacts: current.contacts.map((contact, i) =>
        key === "is_primary"
          ? { ...contact, is_primary: i === index && value === true }
          : i === index
            ? { ...contact, [key]: value }
            : contact,
      ),
    }));
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/logo", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    update("logo_path", result.logo_path);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(id ? `/api/clients/${id}` : "/api/clients", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          contacts: data.contacts.filter((contact) => contact.full_name.trim()),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      router.push("/clientes");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="records-page">
      <Breadcrumbs
        items={[
          { label: "Meu espaço", href: "/" },
          { label: "Clientes", href: "/clientes" },
          { label: id ? "Editar cliente" : "Novo cliente" },
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">CADASTRO</p>
          <h1>{id ? "Editar cliente" : "Novo cliente"}</h1>
          <p className="subheading">
            Cadastre os dados da empresa e seus contatos.
          </p>
        </div>
      </header>
      <form className="client-form" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Dados da empresa</h2>
              <p>Informações principais do cliente.</p>
            </div>
          </div>
          <div className="logo-upload">
            <div className="logo-preview">
              {data.logo_path ? (
                <Image
                  src={data.logo_path}
                  alt="Prévia do logo"
                  width={64}
                  height={64}
                  unoptimized
                />
              ) : (
                <span>
                  {data.company_name
                    ? data.company_name.slice(0, 2).toUpperCase()
                    : "＋"}
                </span>
              )}
            </div>
            <div>
              <b>Logo da empresa</b>
              <small>PNG, JPG ou WebP. Máximo de 2 MB.</small>
              <label className="upload-button">
                Escolher imagem
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    uploadLogo(event.target.files?.[0]).catch((reason: Error) =>
                      setError(reason.message),
                    )
                  }
                />
              </label>
              {data.logo_path && (
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => update("logo_path", "")}
                >
                  Remover logo
                </button>
              )}
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="Razão social / nome da empresa *"
              value={data.company_name}
              required
              onChange={(v) => update("company_name", v)}
            />
            <Field
              label="Nome fantasia"
              value={data.trade_name}
              onChange={(v) => update("trade_name", v)}
            />
            <Field
              label="CNPJ"
              value={data.tax_id}
              onChange={(v) => update("tax_id", v)}
              format={formatCnpj}
              placeholder="00.000.000/0000-00"
            />
            <label className="form-field">
              <span>Segmento</span>
              <select
                value={data.industry}
                onChange={(event) => update("industry", event.target.value)}
              >
                <option value="">Selecione um segmento</option>
                {CLIENT_SEGMENTS.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Site"
              value={data.website}
              onChange={(v) => update("website", v)}
            />
            <Field
              label="Telefone geral"
              type="tel"
              value={data.phone}
              onChange={(v) => update("phone", v)}
              format={formatPhone}
              placeholder="(11) 91234-5678"
            />
            <Field
              label="E-mail geral"
              type="email"
              value={data.email}
              onChange={(v) => update("email", v)}
            />
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Endereço</h2>
              <p>Localização da empresa.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="CEP"
              value={data.postal_code}
              onChange={(v) => update("postal_code", v)}
              format={formatCep}
              placeholder="00000-000"
            />
            <Field
              label="País"
              value={data.country}
              onChange={(v) => update("country", v)}
            />
            <Field
              label="Logradouro"
              value={data.street}
              onChange={(v) => update("street", v)}
            />
            <Field
              label="Número"
              value={data.street_number}
              onChange={(v) => update("street_number", v)}
            />
            <Field
              label="Complemento"
              value={data.complement}
              onChange={(v) => update("complement", v)}
            />
            <Field
              label="Cidade"
              value={data.city}
              onChange={(v) => update("city", v)}
            />
            <Field
              label="Estado"
              value={data.state}
              onChange={(v) => update("state", v)}
            />
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Pessoas de contato</h2>
              <p>Adicione uma ou mais pessoas relacionadas a esta empresa.</p>
            </div>
            <button
              type="button"
              className="filter-button"
              onClick={() =>
                update("contacts", [...data.contacts, emptyContact()])
              }
            >
              ＋ Adicionar contato
            </button>
          </div>
          {data.contacts.map((contact, index) => (
            <div className="contact-form-card" key={index}>
              <div className="contact-form-title">
                <b>Contato {index + 1}</b>
                {data.contacts.length > 1 && (
                  <button
                    type="button"
                    className="subtle-button danger-link"
                    onClick={() => {
                      if (contact.id && !window.confirm("Desativar este contato? O histórico será preservado.")) return;
                      update("contacts", data.contacts.filter((_, i) => i !== index));
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="form-grid">
                <Field
                  label="Nome completo *"
                  value={contact.full_name}
                  required={index === 0}
                  onChange={(v) => updateContact(index, "full_name", v)}
                />
                <Field
                  label="Cargo"
                  value={contact.job_title}
                  onChange={(v) => updateContact(index, "job_title", v)}
                />
                <Field
                  label="E-mail"
                  type="email"
                  value={contact.email}
                  onChange={(v) => updateContact(index, "email", v)}
                />
                <Field
                  label="Telefone"
                  type="tel"
                  value={contact.phone}
                  onChange={(v) => updateContact(index, "phone", v)}
                  format={formatPhone}
                  placeholder="(11) 91234-5678"
                />
                <Field
                  label="Celular"
                  type="tel"
                  value={contact.mobile}
                  onChange={(v) => updateContact(index, "mobile", v)}
                  format={formatPhone}
                  placeholder="(11) 91234-5678"
                />
                <Field
                  label="Data de aniversário (opcional)"
                  type="date"
                  value={contact.birthday}
                  onChange={(v) => updateContact(index, "birthday", v)}
                />
                <Field
                  label="Perfil do LinkedIn"
                  type="url"
                  placeholder="https://www.linkedin.com/in/..."
                  value={contact.linkedin_url}
                  onChange={(v) => updateContact(index, "linkedin_url", v)}
                />
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={contact.is_primary}
                    onChange={(event) =>
                      updateContact(index, "is_primary", event.target.checked)
                    }
                  />{" "}
                  Contato principal
                </label>
              </div>
            </div>
          ))}
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Observações</h2>
              <p>Notas internas sobre este cliente.</p>
            </div>
          </div>
          <textarea
            className="notes-input"
            value={data.notes}
            onChange={(event) => update("notes", event.target.value)}
            rows={4}
          />
        </section>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <Link className="filter-button" href="/clientes">
            Cancelar
          </Link>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando..." : "Salvar cliente"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
  format,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  format?: (value: string) => string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={value || ""}
        required={required}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(format ? format(event.target.value) : event.target.value)
        }
      />
    </label>
  );
}
