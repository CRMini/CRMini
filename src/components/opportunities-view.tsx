"use client";
import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";
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
  name: string;
  company_name: string;
  contact_name: string;
  status: string;
  value: string | null;
  currency: string;
  opened_at: string;
  expected_close_at: string | null;
  service_type?: string;
  technology?: string;
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
}: {
  mode?: "list" | "form";
}) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]),
    [items, setItems] = useState<Opportunity[]>([]),
    [loading, setLoading] = useState(mode === "list"),
    [error, setError] = useState(""),
    [durationUnit, setDurationUnit] = useState<
      "hours" | "days" | "weeks" | "months"
    >("hours"),
    [clientId, setClientId] = useState(""),
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
    Promise.all([
      fetch("/api/clients")
        .then((r) => r.json())
        .then(setClients),
      refresh(),
    ]).catch((e: Error) => setError(e.message));
  }, []);
  const client = clients.find((c) => c.id === clientId);
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
    if (!data.opened_at) data.opened_at = getBrazilDateString();
    if (data.status !== "Perdida") data.loss_reason = "";
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push("/oportunidades");
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
            href: mode === "form" ? "/oportunidades" : undefined,
          },
          ...(mode === "form" ? [{ label: "Nova oportunidade" }] : []),
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">VENDAS</p>
          <h1>{mode === "form" ? "Nova oportunidade" : "Oportunidades"}</h1>
          <p className="subheading">
            Acompanhe propostas e negócios vinculados aos clientes.
          </p>
        </div>
        {mode === "form" ? (
          <Link href="/oportunidades" className="text-link">
            ← Voltar às oportunidades
          </Link>
        ) : (
          <Link href="/oportunidades/nova" className="primary-button">
            ＋ Nova oportunidade
          </Link>
        )}
      </header>
      {mode === "form" && (
        <section className="form-section">
          <h2>Dados da oportunidade</h2>
          <form className="client-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="form-field">
                Nome *<input name="name" required />
              </label>
              <label className="form-field">
                Cliente *
                <select
                  name="client_id"
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {clients
                    .filter((c) => c.is_active !== false)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field">
                Contato *
                <select name="contact_id" required disabled={!clientId}>
                  <option value="">Selecione</option>
                  {client?.contacts?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Tecnologia
                <input name="technology" />
              </label>
              <label className="form-field">
                Valor
                <input name="value" type="number" min="0" step="0.01" />
              </label>
              <label className="form-field">
                Moeda do valor
                <select name="currency">
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
                />
              </label>
              <label className="form-field">
                Recursos
                <textarea name="resources" />
              </label>
              <label className="form-field">
                Budget do cliente
                <input name="budget" type="number" min="0" step="0.01" />
              </label>
              <label className="form-field">
                Moeda do budget
                <select name="budget_currency">
                  <option value="">—</option>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Tempo de projeto
                <input name="project_time" type="number" min="0" step="0.01" />
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
                <input name="expected_close_at" type="date" />
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
                  <select name="loss_reason" required>
                    <option value="">Selecione</option>
                    {reasons.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="form-field">
                Necessidade do cliente
                <textarea name="customer_need" />
              </label>
              <label className="form-field">
                Solução ofertada
                <textarea name="offered_solution" />
              </label>
              <label className="form-field">
                Observações
                <textarea name="notes" />
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" type="submit">
              Cadastrar oportunidade
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
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
