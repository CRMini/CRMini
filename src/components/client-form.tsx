"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import Field from "@/components/form-field";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { CLIENT_SEGMENTS } from "@/lib/segments";
import { type CepAddress, isValidCep, normalizeCep } from "@/lib/cep";
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
type ProfileFieldKey =
  | "company_name"
  | "trade_name"
  | "tax_id"
  | "phone"
  | "email"
  | "postal_code"
  | "street"
  | "street_number"
  | "city"
  | "state"
  | "country";
type CompanyFieldResult = {
  value: string;
  source: "json-ld" | "opengraph" | "microdata" | "links" | "text";
  confidence: "high" | "medium" | "low";
};
type CompanyProfileResponse = {
  source_url: string;
  fields: Partial<Record<ProfileFieldKey, CompanyFieldResult>>;
  missing: string[];
};
type ProfileStatus = "idle" | "ready" | "applied";

// Ordem fixa do formulário; evita importar o parser de `company-profile.ts` no cliente.
const profileFields: readonly { key: ProfileFieldKey; label: string }[] = [
  { key: "company_name", label: "Razão social / nome da empresa" },
  { key: "trade_name", label: "Nome fantasia" },
  { key: "tax_id", label: "CNPJ" },
  { key: "phone", label: "Telefone geral" },
  { key: "email", label: "E-mail geral" },
  { key: "postal_code", label: "CEP" },
  { key: "street", label: "Logradouro" },
  { key: "street_number", label: "Número" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "country", label: "País" },
];
const profileSourceLabels: Record<CompanyFieldResult["source"], string> = {
  "json-ld": "JSON-LD",
  opengraph: "OpenGraph",
  microdata: "Microdata",
  links: "Link do site",
  text: "Texto do site",
};

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
  const [postalCodeError, setPostalCodeError] = useState("");
  const [siteError, setSiteError] = useState("");
  const [searchingLogo, setSearchingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchingProfile, setSearchingProfile] = useState(false);
  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null);
  const [profileSelection, setProfileSelection] = useState<ProfileFieldKey[]>(
    [],
  );
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const cepRequestId = useRef(0);
  const logoRequestId = useRef(0);
  const profileRequestId = useRef(0);
  const siteInputRef = useRef<HTMLInputElement>(null);
  const profileHeadingRef = useRef<HTMLHeadingElement>(null);
  const profileHintId = useId();
  useEffect(() => {
    if (profileStatus === "ready") profileHeadingRef.current?.focus();
  }, [profileStatus]);
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
  async function lookupPostalCode(value: string) {
    const requestId = ++cepRequestId.current;

    if (!value.trim()) {
      setPostalCodeError("");
      return;
    }

    if (!isValidCep(value)) {
      setPostalCodeError("CEP inválido. Informe os 8 dígitos.");
      return;
    }

    try {
      const response = await fetch(`/api/cep?cep=${normalizeCep(value)}`);
      const result = (await response.json().catch(() => null)) as
        (Partial<CepAddress> & { error?: string }) | null;

      if (requestId !== cepRequestId.current) return;

      if (!response.ok) {
        setPostalCodeError(
          result?.error || "Não foi possível consultar o CEP. Tente novamente.",
        );
        return;
      }

      setPostalCodeError("");
      setData((current) => ({
        ...current,
        ...(result?.street ? { street: result.street } : {}),
        ...(result?.city ? { city: result.city } : {}),
        ...(result?.state ? { state: result.state } : {}),
        ...(current.country ? {} : { country: "Brasil" }),
      }));
    } catch {
      if (requestId !== cepRequestId.current) return;
      setPostalCodeError(
        "Não foi possível consultar o CEP. Verifique sua conexão e tente novamente.",
      );
    }
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
  async function searchSiteLogo() {
    if (!data.website.trim() || searchingLogo) return;
    if (data.logo_path && !window.confirm("Substituir o logo atual?")) return;

    const requestId = ++logoRequestId.current;

    setSearchingLogo(true);
    setSiteError("");

    try {
      const response = await fetch("/api/logo/from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: data.website }),
      });
      const result = (await response.json().catch(() => null)) as {
        logo_path?: string;
        error?: string;
      } | null;

      if (requestId !== logoRequestId.current) return;

      if (response.status >= 500) {
        setError(result?.error || "Não foi possível buscar o logo do site.");
        return;
      }

      if (!response.ok || !result?.logo_path) {
        setSiteError(
          result?.error || "Não foi possível buscar o logo do site.",
        );
        return;
      }

      update("logo_path", result.logo_path);
    } catch {
      if (requestId !== logoRequestId.current) return;
      setSiteError("Não foi possível buscar o logo do site.");
    } finally {
      if (requestId === logoRequestId.current) setSearchingLogo(false);
    }
  }
  async function searchSiteProfile() {
    if (searchingProfile) return;

    if (!data.website.trim()) {
      setSiteError("Informe o site da empresa.");
      siteInputRef.current?.focus();
      setProfile(null);
      setProfileSelection([]);
      setProfileStatus("idle");
      return;
    }

    const requestId = ++profileRequestId.current;

    setSearchingProfile(true);
    setSiteError("");
    setProfile(null);
    setProfileSelection([]);
    setProfileStatus("idle");

    try {
      const response = await fetch("/api/company/from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: data.website }),
      });
      const result = (await response.json().catch(() => null)) as
        (CompanyProfileResponse & { error?: string }) | null;

      if (requestId !== profileRequestId.current) return;

      if (response.status >= 500) {
        setError(result?.error || "Não foi possível buscar os dados do site.");
        return;
      }

      if (!response.ok || !result) {
        setSiteError(
          result?.error || "Não foi possível buscar os dados do site.",
        );
        return;
      }

      // Pré-seleciona apenas campos vazios: nada preenchido é substituído sem marcação.
      setProfileSelection(
        profileFields
          .map(({ key }) => key)
          .filter((key) => result.fields[key] && data[key].trim() === ""),
      );
      setProfile(result);
      setProfileStatus("ready");
    } catch {
      if (requestId !== profileRequestId.current) return;
      setSiteError("Não foi possível buscar os dados do site.");
    } finally {
      if (requestId === profileRequestId.current) setSearchingProfile(false);
    }
  }
  function toggleProfileField(key: ProfileFieldKey) {
    setProfileSelection((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  function applyProfile() {
    if (!profile) return;

    setData((current) => {
      const next = { ...current };
      for (const key of profileSelection) {
        const field = profile.fields[key];
        if (field) next[key] = field.value;
      }
      return next;
    });
    if (profileSelection.includes("postal_code")) setPostalCodeError("");
    setProfile(null);
    setProfileSelection([]);
    setProfileStatus("applied");
  }
  function cancelProfile() {
    setProfile(null);
    setProfileSelection([]);
    setProfileStatus("idle");
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
          ...(id ? [{ label: "Cliente", href: `/clientes/${id}` }] : []),
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
      <form className="client-form client-form--wide" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Dados da empresa</h2>
              <p>Informações principais do cliente.</p>
            </div>
            <div className="company-profile-trigger">
              <button
                type="button"
                className="filter-button"
                disabled={searchingProfile}
                onClick={searchSiteProfile}
                aria-describedby={profileHintId}
              >
                {searchingProfile ? "Buscando..." : "Buscar dados do site"}
              </button>
              <small
                id={profileHintId}
                className="company-profile-trigger-hint"
              >
                Preenche nome, CNPJ, telefone, e-mail e endereço
              </small>
              {profileStatus === "applied" && (
                <span className="company-profile-status" role="status">
                  Dados do site aplicados.
                </span>
              )}
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
              <button
                type="button"
                className="subtle-button"
                disabled={!data.website.trim() || searchingLogo}
                onClick={searchSiteLogo}
              >
                {searchingLogo ? "Buscando..." : "Buscar logo do site"}
              </button>
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
              onChange={(v) => {
                update("website", v);
                if (siteError) setSiteError("");
                profileRequestId.current += 1;
                setSearchingProfile(false);
                if (profile) setProfile(null);
                if (profileSelection.length) setProfileSelection([]);
                if (profileStatus !== "idle") setProfileStatus("idle");
              }}
              error={siteError}
              hint="Endereço usado para buscar o logo e os dados cadastrais."
              inputRef={siteInputRef}
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
          {profile && (
            <section
              className="company-profile-panel"
              role="region"
              aria-label="Dados encontrados no site"
            >
              <h3
                className="company-profile-heading"
                ref={profileHeadingRef}
                tabIndex={-1}
              >
                Dados encontrados no site
              </h3>
              <div aria-live="polite">
                <div className="company-profile-list">
                  {profileFields
                    .filter(({ key }) => profile.fields[key])
                    .map(({ key, label }) => {
                      const field = profile.fields[key];
                      if (!field) return null;
                      const checked = profileSelection.includes(key);
                      const replacesValue = checked && data[key].trim() !== "";

                      return (
                        <label className="company-profile-row" key={key}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProfileField(key)}
                          />
                          <span className="company-profile-label">{label}</span>
                          <span className="company-profile-value">
                            {field.value}
                          </span>
                          <span className="company-profile-origin">
                            {profileSourceLabels[field.source]}
                          </span>
                          {replacesValue && (
                            <span className="company-profile-note">
                              (substitui o valor atual)
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
              <div className="company-profile-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={profileSelection.length === 0}
                  onClick={applyProfile}
                >
                  Aplicar dados
                </button>
                <button
                  type="button"
                  className="subtle-button"
                  onClick={cancelProfile}
                >
                  Cancelar
                </button>
              </div>
            </section>
          )}
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
              onChange={(v) => {
                update("postal_code", v);
                if (postalCodeError) setPostalCodeError("");
              }}
              onBlur={() => lookupPostalCode(data.postal_code)}
              error={postalCodeError}
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
                      if (
                        contact.id &&
                        !window.confirm(
                          "Desativar este contato? O histórico será preservado.",
                        )
                      )
                        return;
                      update(
                        "contacts",
                        data.contacts.filter((_, i) => i !== index),
                      );
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
