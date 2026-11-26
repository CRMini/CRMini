"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useEffect, useRef, useState } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import Field from "@/components/form-field";
import { isValidCep, normalizeCep, type CepAddress } from "@/lib/cep";
import { isValidCnpj } from "@/lib/cnpj";
import { isValidEmail } from "@/lib/email";
import {
  formatCep,
  formatCnpj,
  formatCurrencyFromCanonical,
  formatCurrencyInput,
  parseCurrencyInput,
} from "@/lib/masks";
import { normalizeSearch } from "@/lib/normalize-search";
import { formatPhone } from "@/lib/phone";
import {
  BANT_AUTHORITY_VALUES,
  BANT_BUDGET_VALUES,
  BANT_NEED_VALUES,
  BANT_TIMING_VALUES,
  BRAZILIAN_STATES,
  COMMUNICATION_TYPES,
  EMPLOYEE_BANDS,
  LEAD_PRIORITIES,
  LEAD_TIMEFRAMES,
  OTHER_LEAD_SOURCE_ID,
  REVENUE_BANDS,
} from "@/lib/lead-validation";
import type { LeadReference, LeadReferenceType } from "@/lib/lead-references";
import { sortLeadReferences } from "@/lib/lead-references";
import {
  LEAD_DISQUALIFICATION_REASONS,
  allowedLeadStatusTransitions,
  isLeadStatus,
  type LeadStatus,
} from "@/lib/lead-status";

type References = Record<LeadReferenceType, LeadReference[]>;

const EMPTY_REFERENCES: References = {
  industries: [],
  segments: [],
  cities: [],
  countries: [],
  job_titles: [],
  lead_sources: [],
};

const BRAZIL_COUNTRY_ID = "country-brasil";

const CEP_LOOKUP_MESSAGE =
  "Não foi possível consultar o CEP. Verifique sua conexão e tente novamente.";

type LeadFormData = {
  company_name: string;
  trade_name: string;
  tax_id: string;
  industry_id: string;
  segment_id: string;
  revenue_band: string;
  employee_band: string;
  street: string;
  street_number: string;
  complement: string;
  neighborhood: string;
  city_id: string;
  state: string;
  postal_code: string;
  country_id: string;
  website: string;
  description: string;
  lead_source_id: string;
  lead_source_other: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  contact_job_title_id: string;
  contact_street: string;
  contact_street_number: string;
  contact_complement: string;
  contact_neighborhood: string;
  contact_city_id: string;
  contact_state: string;
  contact_postal_code: string;
  contact_country_id: string;
  desired_solution: string;
  identified_pain: string;
  priority: string;
  expected_timeframe: string;
  budget: string;
  bant_budget: string;
  bant_authority: string;
  bant_authority_other: string;
  bant_need: string;
  bant_timing: string;
  contact_history: string;
  communication_type: string;
  next_interaction_date: string;
  next_interaction_time: string;
};

const EMPTY_FORM: LeadFormData = {
  company_name: "",
  trade_name: "",
  tax_id: "",
  industry_id: "",
  segment_id: "",
  revenue_band: "",
  employee_band: "",
  street: "",
  street_number: "",
  complement: "",
  neighborhood: "",
  city_id: "",
  state: "",
  postal_code: "",
  country_id: "country-brasil",
  website: "",
  description: "",
  lead_source_id: "",
  lead_source_other: "",
  contact_first_name: "",
  contact_last_name: "",
  contact_email: "",
  contact_phone: "",
  contact_job_title_id: "",
  contact_street: "",
  contact_street_number: "",
  contact_complement: "",
  contact_neighborhood: "",
  contact_city_id: "",
  contact_state: "",
  contact_postal_code: "",
  contact_country_id: "",
  desired_solution: "",
  identified_pain: "",
  priority: "",
  expected_timeframe: "",
  budget: "",
  bant_budget: "",
  bant_authority: "",
  bant_authority_other: "",
  bant_need: "",
  bant_timing: "",
  contact_history: "",
  communication_type: "",
  next_interaction_date: "",
  next_interaction_time: "",
};

function ReferenceSelect({
  label,
  type,
  value,
  onChange,
  options,
  onCreated,
  required = false,
}: {
  label: string;
  type: LeadReferenceType;
  value: string;
  onChange: (value: string) => void;
  options: LeadReference[];
  onCreated: (reference: LeadReference) => void;
  required?: boolean;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da opção.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leads/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: trimmed }),
      });
      const body = await response.json();
      if (response.status === 409) {
        const existing = options.find(
          (option) =>
            option.name.toLocaleLowerCase("pt-BR") ===
            trimmed.toLocaleLowerCase("pt-BR"),
        );
        if (existing) {
          onChange(existing.id);
          setAdding(false);
          setName("");
          return;
        }
      }
      if (!response.ok)
        throw new Error(body.error || "Não foi possível salvar a opção.");
      const created = body as LeadReference;
      onCreated(created);
      onChange(created.id);
      setAdding(false);
      setName("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Erro ao salvar a opção.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {adding ? (
        <div className="form-field-add-option">
          <input
            aria-label={`Nova opção para ${label}`}
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void create();
              }
            }}
          />
          <button
            type="button"
            className="filter-button"
            disabled={saving}
            onClick={() => void create()}
          >
            {saving ? "Salvando..." : "Salvar opção"}
          </button>
          <button
            type="button"
            className="subtle-button"
            onClick={() => {
              setAdding(false);
              setName("");
              setError("");
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="subtle-button"
          onClick={() => setAdding(true)}
        >
          + Adicionar opção
        </button>
      )}
      {error && (
        <span className="form-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ValueSelect({
  label,
  value,
  onChange,
  values,
  required = false,
  placeholder = "Selecione",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  values: readonly string[];
  required?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function toFormData(lead: Record<string, unknown>): LeadFormData {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as Array<keyof LeadFormData>) {
    const value = lead[key];
    form[key] = typeof value === "string" ? value : "";
  }
  form.budget = formatCurrencyFromCanonical(form.budget);
  return form;
}

export default function LeadForm({ leadId }: { leadId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<LeadFormData>(EMPTY_FORM);
  const [sameAddress, setSameAddress] = useState(true);
  const [references, setReferences] = useState<References>(EMPTY_REFERENCES);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cepErrors, setCepErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(leadId));
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [opportunityName, setOpportunityName] = useState("");
  const [opportunityValue, setOpportunityValue] = useState("");
  const [opportunityHours, setOpportunityHours] = useState("");
  const [converting, setConverting] = useState(false);
  const [conversionError, setConversionError] = useState("");
  const [disqualificationReason, setDisqualificationReason] = useState("");
  const cepRequestId = useRef({ company: 0, contact: 0 });

  useEffect(() => {
    let active = true;
    fetch("/api/leads/references")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Não foi possível carregar as opções.");
        if (active) setReferences(body);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!leadId) return;
    let active = true;
    fetch(`/api/leads/${leadId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Não foi possível carregar o lead.");
        if (!active) return;
        setData(toFormData(body));
        setSameAddress(Number(body.contact_same_address) === 1);
        if (typeof body.status === "string" && isLeadStatus(body.status))
          setStatus(body.status);
        setDisqualificationReason(body.disqualification_reason ?? "");
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [leadId]);

  function update<K extends keyof LeadFormData>(
    key: K,
    value: LeadFormData[K],
  ) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function addReference(type: LeadReferenceType, reference: LeadReference) {
    setReferences((current) => ({
      ...current,
      [type]: sortLeadReferences([...current[type], reference]),
    }));
  }

  function formatErrors(): Record<string, string> {
    return {
      tax_id:
        data.tax_id.trim() && !isValidCnpj(data.tax_id)
          ? "CNPJ inválido. Informe os 14 dígitos."
          : "",
      postal_code:
        data.postal_code.trim() &&
        data.postal_code.replace(/\D/g, "").length !== 8
          ? "CEP inválido. Informe os 8 dígitos."
          : "",
      contact_email:
        data.contact_email.trim() && !isValidEmail(data.contact_email)
          ? "E-mail inválido."
          : "",
    };
  }

  function checkField(key: "tax_id" | "postal_code" | "contact_email") {
    const errors = formatErrors();
    setFieldErrors((current) => ({ ...current, [key]: errors[key] ?? "" }));
  }

  /**
   * Resolve o `city_id` a partir do nome devolvido pelo ViaCEP. A lista de
   * cidades é extensível, então uma cidade desconhecida é cadastrada como nova
   * opção — o nome vem do ViaCEP, não da digitação do usuário.
   */
  async function resolveCityId(name: string): Promise<string | null> {
    const normalized = normalizeSearch(name);
    const known = references.cities.find(
      (city) => normalizeSearch(city.name) === normalized,
    );
    if (known) return known.id;

    const response = await fetch("/api/leads/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cities", name }),
    });
    const body = await response.json().catch(() => null);

    if (response.ok) {
      const created = body as LeadReference;
      addReference("cities", created);
      return created.id;
    }

    if (response.status === 409) {
      const refreshed = (await fetch("/api/leads/references")
        .then((result) => result.json())
        .catch(() => null)) as References | null;
      if (!refreshed) return null;
      setReferences(refreshed);
      return (
        refreshed.cities.find(
          (city) => normalizeSearch(city.name) === normalized,
        )?.id ?? null
      );
    }

    return null;
  }

  async function lookupCep(target: "company" | "contact", value: string) {
    const isContact = target === "contact";
    const errorKey = isContact ? "contact_postal_code" : "postal_code";
    const countryId = isContact ? data.contact_country_id : data.country_id;
    const requestId = ++cepRequestId.current[target];

    const setCepError = (message: string) =>
      setCepErrors((current) => ({ ...current, [errorKey]: message }));

    // O ViaCEP só cobre CEPs brasileiros; para outro país não há consulta.
    if (countryId && countryId !== BRAZIL_COUNTRY_ID) {
      setCepError("");
      return;
    }
    if (!value.trim()) {
      setCepError("");
      return;
    }
    if (!isValidCep(value)) {
      setCepError("CEP inválido. Informe os 8 dígitos.");
      return;
    }

    try {
      const response = await fetch(`/api/cep?cep=${normalizeCep(value)}`);
      const body = (await response.json().catch(() => null)) as
        (Partial<CepAddress> & { error?: string }) | null;

      if (requestId !== cepRequestId.current[target]) return;

      if (!response.ok) {
        setCepError(body?.error || "Não foi possível consultar o CEP.");
        return;
      }

      const cityId = body?.city ? await resolveCityId(body.city) : null;
      if (requestId !== cepRequestId.current[target]) return;

      setCepError("");
      setData((current) =>
        isContact
          ? {
              ...current,
              contact_postal_code:
                body?.postal_code ?? current.contact_postal_code,
              contact_street: current.contact_street || body?.street || "",
              contact_city_id: cityId ?? current.contact_city_id,
              contact_state: body?.state || current.contact_state,
              contact_country_id:
                current.contact_country_id || BRAZIL_COUNTRY_ID,
            }
          : {
              ...current,
              postal_code: body?.postal_code ?? current.postal_code,
              street: current.street || body?.street || "",
              city_id: cityId ?? current.city_id,
              state: body?.state || current.state,
            },
      );
    } catch {
      if (requestId !== cepRequestId.current[target]) return;
      setCepError(CEP_LOOKUP_MESSAGE);
    }
  }

  async function convert() {
    setConverting(true);
    setConversionError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opportunityName,
          value: parseCurrencyInput(opportunityValue),
          project_hours: opportunityHours,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível converter o lead.");
      router.push("/oportunidades");
      router.refresh();
    } catch (reason) {
      setConversionError(
        reason instanceof Error ? reason.message : "Erro ao converter.",
      );
    } finally {
      setConverting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors = formatErrors();
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        leadId ? `/api/leads/${leadId}` : "/api/leads",
        {
          method: leadId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            budget: parseCurrencyInput(data.budget),
            contact_same_address: sameAddress ? 1 : 0,
            ...(leadId
              ? {
                  status,
                  disqualification_reason:
                    status === "Desqualificado" ? disqualificationReason : "",
                }
              : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar o lead.");
      router.push("/leads");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const statusOptions: LeadStatus[] = isLeadStatus(status)
    ? [status, ...allowedLeadStatusTransitions(status)]
    : [];

  if (loading)
    return (
      <main className="records-page">
        <Breadcrumbs
          items={[
            { label: "Meu espaço", href: "/" },
            { label: "Leads", href: "/leads" },
            { label: "Editar lead" },
          ]}
        />
        <p role="status">Carregando lead...</p>
      </main>
    );

  return (
    <main className="records-page">
      <Breadcrumbs
        items={[
          { label: "Meu espaço", href: "/" },
          { label: "Leads", href: "/leads" },
          { label: leadId ? "Editar lead" : "Novo lead" },
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">CADASTRO</p>
          <h1>{leadId ? "Editar lead" : "Novo lead"}</h1>
          <p className="subheading">
            {leadId
              ? "Atualize os dados e o andamento da qualificação."
              : "Registre a empresa prospectada, o contato e a qualificação comercial."}
          </p>
        </div>
        <Link className="text-link" href="/leads">
          ← Voltar para leads
        </Link>
      </header>

      <form className="client-form client-form--wide" onSubmit={submit}>
        <div className="lead-form-sections">
          <section className="form-section">
            <div className="form-section-heading">
              <div>
                <h2>Informações básicas</h2>
                <p>Dados da empresa e do contato que representa o lead.</p>
              </div>
            </div>
            <div className="form-grid">
              <Field
                label="Razão social"
                required
                value={data.company_name}
                onChange={(value) => update("company_name", value)}
              />
              <Field
                label="Nome fantasia"
                required
                value={data.trade_name}
                onChange={(value) => update("trade_name", value)}
              />
              <Field
                label="CNPJ"
                required
                value={data.tax_id}
                error={fieldErrors.tax_id}
                format={formatCnpj}
                onBlur={() => checkField("tax_id")}
                onChange={(value) => update("tax_id", value)}
              />
              <ReferenceSelect
                label="Setor de atuação"
                type="industries"
                required
                value={data.industry_id}
                onChange={(value) => update("industry_id", value)}
                options={references.industries}
                onCreated={(reference) => addReference("industries", reference)}
              />
              <ReferenceSelect
                label="Segmento"
                type="segments"
                required
                value={data.segment_id}
                onChange={(value) => update("segment_id", value)}
                options={references.segments}
                onCreated={(reference) => addReference("segments", reference)}
              />
              <ValueSelect
                label="Faturamento"
                required
                value={data.revenue_band}
                onChange={(value) => update("revenue_band", value)}
                values={REVENUE_BANDS}
              />
              <ValueSelect
                label="Número de funcionários"
                required
                value={data.employee_band}
                onChange={(value) => update("employee_band", value)}
                values={EMPLOYEE_BANDS}
              />
              <ReferenceSelect
                label="Origem do lead"
                type="lead_sources"
                required
                value={data.lead_source_id}
                onChange={(value) => update("lead_source_id", value)}
                options={references.lead_sources}
                onCreated={(reference) =>
                  addReference("lead_sources", reference)
                }
              />
              {data.lead_source_id === OTHER_LEAD_SOURCE_ID && (
                <Field
                  label="Descreva a origem"
                  required
                  value={data.lead_source_other}
                  onChange={(value) => update("lead_source_other", value)}
                />
              )}
              <Field
                label="CEP"
                required
                value={data.postal_code}
                error={fieldErrors.postal_code || cepErrors.postal_code}
                format={formatCep}
                hint={
                  data.country_id === BRAZIL_COUNTRY_ID
                    ? "Preenche endereço, cidade e estado pelo ViaCEP."
                    : undefined
                }
                onBlur={() => {
                  checkField("postal_code");
                  void lookupCep("company", data.postal_code);
                }}
                onChange={(value) => update("postal_code", value)}
              />
              <Field
                label="Endereço"
                required
                value={data.street}
                onChange={(value) => update("street", value)}
              />
              <Field
                label="Número"
                required
                value={data.street_number}
                onChange={(value) => update("street_number", value)}
              />
              <Field
                label="Complemento"
                value={data.complement}
                onChange={(value) => update("complement", value)}
              />
              <Field
                label="Bairro"
                required
                value={data.neighborhood}
                onChange={(value) => update("neighborhood", value)}
              />
              <ReferenceSelect
                label="Cidade"
                type="cities"
                required
                value={data.city_id}
                onChange={(value) => update("city_id", value)}
                options={references.cities}
                onCreated={(reference) => addReference("cities", reference)}
              />
              <ValueSelect
                label="Estado"
                required
                value={data.state}
                onChange={(value) => update("state", value)}
                values={BRAZILIAN_STATES}
              />
              <ReferenceSelect
                label="País"
                type="countries"
                required
                value={data.country_id}
                onChange={(value) => update("country_id", value)}
                options={references.countries}
                onCreated={(reference) => addReference("countries", reference)}
              />
              <Field
                label="Site da empresa"
                value={data.website}
                onChange={(value) => update("website", value)}
              />
              <TextareaField
                label="Descrição da empresa"
                value={data.description}
                onChange={(value) => update("description", value)}
              />
              <Field
                label="Nome do contato"
                value={data.contact_first_name}
                onChange={(value) => update("contact_first_name", value)}
              />
              <Field
                label="Sobrenome do contato"
                value={data.contact_last_name}
                onChange={(value) => update("contact_last_name", value)}
              />
              <ReferenceSelect
                label="Cargo do contato"
                type="job_titles"
                value={data.contact_job_title_id}
                onChange={(value) => update("contact_job_title_id", value)}
                options={references.job_titles}
                onCreated={(reference) => addReference("job_titles", reference)}
              />
              <Field
                label="E-mail do contato"
                type="email"
                value={data.contact_email}
                error={fieldErrors.contact_email}
                onBlur={() => checkField("contact_email")}
                onChange={(value) => update("contact_email", value)}
              />
              <Field
                label="Telefone / WhatsApp"
                value={data.contact_phone}
                format={formatPhone}
                onChange={(value) => update("contact_phone", value)}
              />
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={sameAddress}
                  onChange={(event) => setSameAddress(event.target.checked)}
                />
                Endereço do contato é o mesmo da empresa
              </label>
              {!sameAddress && (
                <>
                  <Field
                    label="CEP do contato"
                    value={data.contact_postal_code}
                    error={cepErrors.contact_postal_code}
                    format={formatCep}
                    hint="Preenche o endereço do contato pelo ViaCEP."
                    onBlur={() =>
                      void lookupCep("contact", data.contact_postal_code)
                    }
                    onChange={(value) => update("contact_postal_code", value)}
                  />
                  <Field
                    label="Endereço do contato"
                    value={data.contact_street}
                    onChange={(value) => update("contact_street", value)}
                  />
                  <Field
                    label="Número do endereço do contato"
                    value={data.contact_street_number}
                    onChange={(value) => update("contact_street_number", value)}
                  />
                  <Field
                    label="Complemento do endereço do contato"
                    value={data.contact_complement}
                    onChange={(value) => update("contact_complement", value)}
                  />
                  <Field
                    label="Bairro do contato"
                    value={data.contact_neighborhood}
                    onChange={(value) => update("contact_neighborhood", value)}
                  />
                  <ReferenceSelect
                    label="Cidade do contato"
                    type="cities"
                    value={data.contact_city_id}
                    onChange={(value) => update("contact_city_id", value)}
                    options={references.cities}
                    onCreated={(reference) => addReference("cities", reference)}
                  />
                  <ValueSelect
                    label="Estado do contato"
                    required
                    value={data.contact_state}
                    onChange={(value) => update("contact_state", value)}
                    values={BRAZILIAN_STATES}
                  />
                  <ReferenceSelect
                    label="País do contato"
                    type="countries"
                    value={data.contact_country_id}
                    onChange={(value) => update("contact_country_id", value)}
                    options={references.countries}
                    onCreated={(reference) =>
                      addReference("countries", reference)
                    }
                  />
                </>
              )}
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-heading">
              <div>
                <h2>Qualificação comercial</h2>
                <p>Solução, prioridade e respostas de BANT.</p>
              </div>
            </div>
            <div className="form-grid">
              <TextareaField
                label="Solução desejada"
                value={data.desired_solution}
                onChange={(value) => update("desired_solution", value)}
              />
              <TextareaField
                label="Dor identificada"
                value={data.identified_pain}
                onChange={(value) => update("identified_pain", value)}
              />
              <ValueSelect
                label="Prioridade"
                value={data.priority}
                onChange={(value) => update("priority", value)}
                values={LEAD_PRIORITIES}
              />
              <ValueSelect
                label="Previsão de prazo do projeto"
                value={data.expected_timeframe}
                onChange={(value) => update("expected_timeframe", value)}
                values={LEAD_TIMEFRAMES}
              />
              <Field
                label="Budget do projeto (R$)"
                value={data.budget}
                format={formatCurrencyInput}
                onChange={(value) => update("budget", value)}
                placeholder="0,00"
              />
              <ValueSelect
                label="Possui orçamento? (Budget)"
                value={data.bant_budget}
                onChange={(value) => update("bant_budget", value)}
                values={BANT_BUDGET_VALUES}
              />
              <ValueSelect
                label="É o decisor? (Authority)"
                value={data.bant_authority}
                onChange={(value) => update("bant_authority", value)}
                values={BANT_AUTHORITY_VALUES}
              />
              {data.bant_authority === "Outro" && (
                <Field
                  label="Descreva o decisor"
                  value={data.bant_authority_other}
                  onChange={(value) => update("bant_authority_other", value)}
                />
              )}
              <ValueSelect
                label="Necessidade identificada? (Need)"
                value={data.bant_need}
                onChange={(value) => update("bant_need", value)}
                values={BANT_NEED_VALUES}
              />
              <ValueSelect
                label="Prazo para compra? (Timing)"
                value={data.bant_timing}
                onChange={(value) => update("bant_timing", value)}
                values={BANT_TIMING_VALUES}
              />
              {leadId && (
                <>
                  <div className="form-field">
                    <label htmlFor="lead-status">Status do lead</label>
                    <select
                      id="lead-status"
                      value={status}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (isLeadStatus(value)) setStatus(value);
                      }}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  {status === "Desqualificado" && (
                    <div className="form-field">
                      <label htmlFor="lead-disqualification">
                        Motivo da desqualificação
                      </label>
                      <select
                        id="lead-disqualification"
                        required
                        value={disqualificationReason}
                        onChange={(event) =>
                          setDisqualificationReason(event.target.value)
                        }
                      >
                        <option value="">Selecione</option>
                        {LEAD_DISQUALIFICATION_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-heading">
              <div>
                <h2>Comunicação</h2>
                <p>Histórico do contato e próxima interação.</p>
              </div>
            </div>
            <div className="form-grid">
              <TextareaField
                label="Histórico do contato"
                rows={6}
                value={data.contact_history}
                onChange={(value) => update("contact_history", value)}
              />
              <ValueSelect
                label="Tipo de interação"
                value={data.communication_type}
                onChange={(value) => update("communication_type", value)}
                values={COMMUNICATION_TYPES}
              />
              <Field
                label="Data da próxima interação"
                type="date"
                value={data.next_interaction_date}
                onChange={(value) => update("next_interaction_date", value)}
              />
              <Field
                label="Hora da próxima interação"
                type="time"
                value={data.next_interaction_time}
                onChange={(value) => update("next_interaction_time", value)}
              />
            </div>
          </section>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <Link className="filter-button" href="/leads">
            Cancelar
          </Link>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando..." : "Salvar lead"}
          </button>
        </div>
      </form>

      {leadId && (status === "Em contato" || status === "Qualificando") && (
        <section className="form-section lead-conversion">
          <div className="form-section-heading">
            <div>
              <h2>Criar oportunidade</h2>
              <p>
                Cria a empresa e o contato deste lead e a oportunidade
                vinculada. O lead passa para Qualificado.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="Nome da oportunidade"
              required
              value={opportunityName}
              onChange={setOpportunityName}
            />
            <Field
              label="Valor (R$)"
              value={opportunityValue}
              format={formatCurrencyInput}
              onChange={setOpportunityValue}
              placeholder="0,00"
            />
            <Field
              label="Horas de projeto"
              value={opportunityHours}
              onChange={setOpportunityHours}
              placeholder="160"
            />
          </div>
          {conversionError && (
            <p className="form-error" role="alert">
              {conversionError}
            </p>
          )}
          <div className="lead-conversion-actions">
            <button
              type="button"
              className="primary-button"
              disabled={converting || !opportunityName.trim()}
              onClick={() => void convert()}
            >
              {converting ? "Convertendo..." : "Criar oportunidade"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
