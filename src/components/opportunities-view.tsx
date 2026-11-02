"use client";
import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";
import { RowActionLink } from "@/components/row-action";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { formatBrazilDate, getBrazilDateString } from "@/lib/brazil-date";
import { matchesSearch } from "@/lib/search-match";
import { toProjectHours } from "@/lib/project-time";

type Client = {
  id: string;
  company_name: string;
  is_active: boolean;
  contacts: { id: string; full_name: string }[];
};
type Opportunity = {
  id: string;
  client_id: string;
  contact_id: string;
  name: string;
  company_name: string;
  contact_name: string;
  status: string;
  loss_reason?: string | null;
  value: string | null;
  currency: string;
  opened_at: string;
  expected_close_at: string | null;
  service_type?: string | null;
  technology?: string | null;
  resources?: string | null;
  budget?: string | null;
  budget_currency?: string | null;
  notes?: string | null;
  customer_need?: string | null;
  offered_solution?: string | null;
  project_hours?: string | null;
};
const statuses = [
  "Em andamento",
  "Desenvolvimento",
  "Proposta",
  "Aceite da proposta",
  "Ganha",
  "Perdida",
];
const reasons = ["Preço", "Prazo", "Tecnologia", "Solução"];
const currencies = ["BRL", "USD", "EUR", "PES"];
export default function OpportunitiesView({
  mode = "list",
  id,
}: {
  mode?: "list" | "form" | "edit";
  id?: string;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]),
    [items, setItems] = useState<Opportunity[]>([]),
    [record, setRecord] = useState<Opportunity | null>(null),
    [loading, setLoading] = useState(mode === "list"),
    [recordLoading, setRecordLoading] = useState(mode === "edit"),
    [error, setError] = useState(""),
    [durationUnit, setDurationUnit] = useState<
      "hours" | "days" | "weeks" | "months"
    >("hours"),
    [clientId, setClientId] = useState(""),
    [contactId, setContactId] = useState(""),
    [status, setStatus] = useState(statuses[0]),
    [search, setSearch] = useState(""),
    [filterClient, setFilterClient] = useState(""),
    [filterStatus, setFilterStatus] = useState(""),
    [openedAt, setOpenedAt] = useState("");
  async function refresh() {
    setLoading(true);
    try {
    const response = await fetch("/api/opportunities");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setItems(data);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    setOpenedAt(getBrazilDateString());
    const requests: Promise<unknown>[] = [
      fetch("/api/clients")
        .then((r) => r.json())
        .then(setClients),
    ];
    if (mode === "list") requests.push(refresh());
    Promise.all(requests).catch((e: Error) => setError(e.message));
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !id) return;

    let active = true;
    setRecordLoading(true);
    setError("");

    fetch(`/api/opportunities/${id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Não foi possível carregar a oportunidade.",
          );
        if (!active) return;
        setRecord(data);
        setClientId(data.client_id || "");
        setContactId(data.contact_id || "");
        setStatus(data.status || statuses[0]);
        setOpenedAt(String(data.opened_at || "").slice(0, 10));
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mode, id]);
  const client = clients.find((c) => c.id === clientId);
  const contactOptions = client?.contacts ?? [];
  const missingClient = Boolean(
    record && !clients.some((c) => c.id === record.client_id),
  );
  const missingContact = Boolean(
    record?.contact_id &&
      !contactOptions.some((c) => c.id === record.contact_id),
  );
  const filtered = items.filter(
    (item) =>
      matchesSearch(
        `${item.name} ${item.company_name} ${item.contact_name}`,
        search,
      ) &&
      (!filterClient || filterClient === item.client_id) &&
      (!filterStatus || item.status === filterStatus),
  );
  async function changeStatus(item: Opportunity, next: string) {
    const loss_reason =
      next === "Perdida"
        ? window.prompt("Motivo da perda: Preço, Prazo, Tecnologia ou Solução")
        : "";
    if (
      next === "Perdida" &&
      (!loss_reason || !reasons.includes(loss_reason))
    ) {
      setError("Informe um motivo válido para a perda.");
      return;
    }
    const response = await fetch(`/api/opportunities/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, loss_reason }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const data: Record<string, string> = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
    );
    data.project_hours = String(
      toProjectHours(form.get("project_time") as string, durationUnit) ?? "",
    );
    delete data.project_time;
    data.contact_id = contactId;
    if (!data.opened_at) data.opened_at = getBrazilDateString();
    if (data.status !== "Perdida") data.loss_reason = "";
    const editing = mode === "edit";
    if (editing) data.client_id = record?.client_id || clientId;
    try {
      const response = await fetch(
        editing ? `/api/opportunities/${id}` : "/api/opportunities",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(editing ? `/oportunidades/${id}` : "/oportunidades");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="records-page">
      <Breadcrumbs
        items={[
          { label: "Meu espaço", href: "/" },
          {
            label: "Oportunidades",
            href: mode === "list" ? undefined : "/oportunidades",
          },
          ...(mode === "edit" && id
            ? [
                {
                  label: "Detalhes da oportunidade",
                  href: `/oportunidades/${id}`,
                },
              ]
            : []),
          ...(mode === "form" ? [{ label: "Nova oportunidade" }] : []),
          ...(mode === "edit" ? [{ label: "Editar oportunidade" }] : []),
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">VENDAS</p>
          <h1>
            {mode === "form"
              ? "Nova oportunidade"
              : mode === "edit"
                ? "Editar oportunidade"
                : "Oportunidades"}
          </h1>
          <p className="subheading">
            {mode === "edit"
              ? "Atualize os dados do negócio."
              : "Acompanhe propostas e negócios vinculados aos clientes."}
          </p>
        </div>
        {mode === "form" || mode === "edit" ? (
          <Link
            href={
              mode === "edit" && id ? `/oportunidades/${id}` : "/oportunidades"
            }
            className="text-link"
          >
            {mode === "edit" ? "← Voltar aos detalhes" : "← Voltar às oportunidades"}
          </Link>
        ) : (
          <Link href="/oportunidades/nova" className="primary-button">
            ＋ Nova oportunidade
          </Link>
        )}
      </header>
      {mode === "edit" && recordLoading && (
        <p role="status">Carregando oportunidade...</p>
      )}
      {mode === "edit" && !recordLoading && error && !record && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {(mode === "form" || (mode === "edit" && record)) && (
        <section className="form-section">
          <div className="form-section-heading">
            <div>
              <h2>Dados da oportunidade</h2>
              <p>
                {mode === "edit"
                  ? "Atualize os dados do negócio."
                  : "Preencha os dados do novo negócio."}
              </p>
            </div>
          </div>
          <form className="client-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="form-field">
                Nome *
                <input
                  name="name"
                  required
                  defaultValue={record?.name ?? ""}
                />
              </label>
              <label className="form-field">
                Cliente *
                <select
                  name="client_id"
                  required
                  value={clientId}
                  disabled={mode === "edit"}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setContactId("");
                  }}
                >
                  <option value="">Selecione</option>
                  {missingClient && record && (
                    <option value={record.client_id}>
                      {record.company_name} (inativo)
                    </option>
                  )}
                  {clients
                    .filter((c) => c.is_active !== false)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                </select>
                {mode === "edit" && (
                  <small>O cliente não pode ser alterado.</small>
                )}
              </label>
              <label className="form-field">
                Contato *
                <select
                  name="contact_id"
                  required
                  disabled={!clientId}
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {missingContact && record && (
                    <option value={record.contact_id}>
                      {record.contact_name} (inativo)
                    </option>
                  )}
                  {contactOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Tecnologia
                <input
                  name="technology"
                  defaultValue={record?.technology ?? ""}
                />
              </label>
              <label className="form-field">
                Valor
                <input
                  name="value"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={record?.value ?? ""}
                />
              </label>
              <label className="form-field">
                Moeda do valor
                <select
                  name="currency"
                  defaultValue={record?.currency ?? "BRL"}
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Tipo do serviço
                <input
                  name="service_type"
                  placeholder="Suporte, implantação..."
                  defaultValue={record?.service_type ?? ""}
                />
              </label>
              <label className="form-field">
                Recursos
                <textarea
                  name="resources"
                  defaultValue={record?.resources ?? ""}
                />
              </label>
              <label className="form-field">
                Budget do cliente
                <input
                  name="budget"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={record?.budget ?? ""}
                />
              </label>
              <label className="form-field">
                Moeda do budget
                <select
                  name="budget_currency"
                  defaultValue={record?.budget_currency ?? ""}
                >
                  <option value="">—</option>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Tempo de projeto
                <input
                  name="project_time"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={record?.project_hours ?? ""}
                />
              </label>
              <label className="form-field">
                Unidade
                <select
                  value={durationUnit}
                  onChange={(e) =>
                    setDurationUnit(
                      e.target.value as "hours" | "days" | "weeks" | "months",
                    )
                  }
                >
                  <option value="hours">Horas</option>
                  <option value="days">Dias</option>
                  <option value="weeks">Semanas</option>
                  <option value="months">Meses</option>
                </select>
              </label>
              <label className="form-field">
                Data de abertura
                <input
                  name="opened_at"
                  type="date"
                  value={openedAt}
                  onChange={(e) => setOpenedAt(e.target.value)}
                />
              </label>
              <label className="form-field">
                Previsão de fechamento
                <input
                  name="expected_close_at"
                  type="date"
                  defaultValue={record?.expected_close_at ?? ""}
                />
              </label>
              <label className="form-field">
                Status
                <select
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {status === "Perdida" && (
                <label className="form-field">
                  Motivo da perda *
                  <select
                  name="loss_reason"
                  required
                  defaultValue={record?.loss_reason ?? ""}
                >
                    <option value="">Selecione</option>
                    {reasons.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="form-field">
                Necessidade do cliente
                <textarea
                  name="customer_need"
                  defaultValue={record?.customer_need ?? ""}
                />
              </label>
              <label className="form-field">
                Solução ofertada
                <textarea
                  name="offered_solution"
                  defaultValue={record?.offered_solution ?? ""}
                />
              </label>
              <label className="form-field">
                Observações
                <textarea
                  name="notes"
                  defaultValue={record?.notes ?? ""}
                />
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" type="submit">
              {mode === "edit"
                ? "Salvar oportunidade"
                : "Cadastrar oportunidade"}
            </button>
          </form>
        </section>
      )}
      {mode === "list" && (
        <>
          <div className="contact-filters opportunity-filters">
            <input
              aria-label="Buscar oportunidades"
              placeholder="Buscar por oportunidade, cliente ou contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label>
              <span>Cliente</span>
              <select
                aria-label="Filtrar por cliente"
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
              >
                <option value="">Todos</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                aria-label="Filtrar por status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="contact-count">
              {filtered.length} oportunidade(s)
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {loading ? <p role="status">Carregando oportunidades...</p> : !filtered.length && !error ? (
            <EmptyState
              icon="◈"
              title="Nenhuma oportunidade encontrada"
              description="Experimente ajustar a busca ou os filtros."
              action={
                <Link className="primary-button" href="/oportunidades/nova">
                  ＋ Cadastrar oportunidade
                </Link>
              }
            />
          ) : (
            <div
              className="opportunity-table"
              role="table"
              aria-label="Lista de oportunidades"
            >
              <div className="opportunity-table-header" role="row">
                <span role="columnheader">Oportunidade</span>
                <span role="columnheader">Tipo do serviço</span>
                <span role="columnheader">Tecnologia</span>
                <span role="columnheader">Cliente</span>
                <span role="columnheader">Contato</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Valor</span>
                <span role="columnheader">Abertura / previsão</span>
                <span role="columnheader">Ações</span>
              </div>
              {filtered.map((o) => (
                <article
                  className="opportunity-table-row"
                  role="row"
                  key={o.id}
                >
                  <span
                    className="opportunity-name"
                    role="cell"
                    data-label="Oportunidade"
                  >
                    <span className="contact-list-avatar">
                      {o.name.trim().slice(0, 2).toUpperCase()}
                    </span>
                    <b>{o.name}</b>
                    <Link
                      className="opportunity-row-link"
                      href={`/oportunidades/${o.id}`}
                      aria-label={`Ver detalhes de ${o.name}`}
                    />
                  </span>
                  <span role="cell" data-label="Tipo do serviço">
                    {o.service_type || "—"}
                  </span>
                  <span role="cell" data-label="Tecnologia">
                    {o.technology || "—"}
                  </span>
                  <span role="cell" data-label="Cliente">
                    {o.company_name}
                  </span>
                  <span role="cell" data-label="Contato">
                    {o.contact_name}
                  </span>
                  <label
                    className="opportunity-status"
                    role="cell"
                    data-label="Status"
                  >
                    <select
                      aria-label={`Status de ${o.name}`}
                      value={o.status}
                      onChange={(e) => changeStatus(o, e.target.value)}
                    >
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <span role="cell" data-label="Valor">
                    {o.value == null
                      ? "—"
                      : `${o.currency} ${Number(o.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                  </span>
                  <span role="cell" data-label="Abertura / previsão">
                    {formatBrazilDate(o.opened_at)} /{" "}
                    {formatBrazilDate(o.expected_close_at)}
                  </span>
                  <span
                    className="opportunity-row-actions"
                    role="cell"
                    data-label="Ações"
                  >
                    <RowActionLink
                      href={`/oportunidades/${o.id}/editar`}
                      icon="✎"
                      label={`Editar oportunidade ${o.name}`}
                    />
                  </span>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
