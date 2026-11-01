"use client";
import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { formatBrazilDateTime, toCivilDateTimeInput } from "@/lib/brazil-date";

type Client = {
  id: string;
  company_name: string;
  is_active: boolean;
  contacts: { id: string; full_name: string }[];
};
type Task = {
  id: string;
  contact_type: string;
  subject: string;
  description: string | null;
  scheduled_at: string;
  status: string;
  client_id: string;
  contact_id: string;
  company_name: string;
  contact_name: string;
};
const types = [
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "compromisso", label: "Compromisso" },
];
export default function TasksView({
  mode = "list",
}: {
  mode?: "list" | "form";
}) {
  const router = useRouter();
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [clientId, setClientId] = useState(""),
    [date, setDate] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (status) params.set("status", status);
    const r = await fetch(
      `/api/tasks${params.size ? `?${params.toString()}` : ""}`,
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setTasks(data);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    try {
      setDate(sessionStorage.getItem("tasks-date-filter") ?? "");
    } catch {
      // If session storage is unavailable, keep the filter empty for this mount.
    } finally {
      setFiltersReady(true);
    }
  }, []);
  useEffect(() => {
    if (!filtersReady) return;
    try {
      if (date) sessionStorage.setItem("tasks-date-filter", date);
      else sessionStorage.removeItem("tasks-date-filter");
    } catch {
      // The filter remains usable even when session storage is unavailable.
    }
  }, [date, filtersReady]);
  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients)
      .catch(() => setError("Não foi possível carregar clientes."));
  }, []);
  useEffect(() => {
    if (mode === "list" && filtersReady)
      load().catch((e: Error) => setError(e.message));
  }, [date, status, mode, filtersReady]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    data.scheduled_at = new Date(`${data.scheduled_at}-03:00`).toISOString();
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      router.push("/tarefas");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggle(task: Task) {
    const next = task.status === "Aberto" ? "Concluído" : "Aberto";
    const r = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!r.ok) {
      setError((await r.json()).error);
      return;
    }
    await load();
  }
  const client = clients.find((c) => c.id === clientId);
  return (
    <main className="records-page">
      <Breadcrumbs
        items={[
          { label: "Meu espaço", href: "/" },
          { label: "Tarefas", href: mode === "form" ? "/tarefas" : undefined },
          ...(mode === "form" ? [{ label: "Nova tarefa" }] : []),
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>{mode === "form" ? "Nova tarefa" : "Tarefas"}</h1>
          <p className="subheading">
            Organize seus acompanhamentos com clientes e contatos.
          </p>
        </div>
        {mode === "form" ? (
          <Link className="text-link" href="/tarefas">
            ← Voltar às tarefas
          </Link>
        ) : (
          <Link className="primary-button" href="/tarefas/nova">
            ＋ Nova tarefa
          </Link>
        )}
      </header>
      {mode === "form" ? (
        <section className="form-section">
          <h2>Dados da tarefa</h2>
          <form className="client-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="form-field">
                Tipo de contato *
                <select name="contact_type" required>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Assunto *<input name="subject" required maxLength={200} />
              </label>
              <label className="form-field">
                Descrição do assunto
                <textarea name="description" maxLength={5000} />
              </label>
              <label className="form-field">
                Data e hora *
                <input
                  name="scheduled_at"
                  type="datetime-local"
                  defaultValue={toCivilDateTimeInput()}
                  required
                />
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
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" type="submit">
              Criar tarefa
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="contact-filters">
            <label>
              <span>Dia</span>
              <input
                aria-label="Filtrar tarefas por dia"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                aria-label="Filtrar por status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option>Aberto</option>
                <option>Concluído</option>
              </select>
            </label>
            <span className="contact-count">{tasks.length} tarefa(s)</span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {loading ? <p role="status">Carregando tarefas...</p> : !tasks.length && !error ? (
            <EmptyState
              icon="✓"
              title="Nenhuma tarefa encontrada"
              description="Crie uma tarefa ou ajuste os filtros."
              action={
                <Link className="primary-button" href="/tarefas/nova">
                  ＋ Nova tarefa
                </Link>
              }
            />
          ) : (
            <section className="task-list-section" aria-label="Tarefas do dia">
              <header className="task-list-header">
                <span>Tarefa</span>
                <span>Cliente e contato</span>
                <span>Data e hora</span>
                <span>Status</span>
              </header>
              <div className="contact-list">
                {tasks.map((task) => (
                  <article className="contact-row task-row" key={task.id}>
                    <div
                      className="contact-list-avatar"
                      role="img"
                      aria-label={
                        types.find((t) => t.value === task.contact_type)?.label
                      }
                    >
                      {task.contact_type === "email"
                        ? "✉"
                        : task.contact_type === "telefone"
                          ? "☎"
                          : "▣"}
                    </div>
                    <div className="contact-list-person">
                      <b>{task.subject}</b>
                      {task.description && <span>{task.description}</span>}
                    </div>
                    <div className="contact-list-company">
                      <span>
                        <b>{task.company_name}</b>
                        <small>{task.contact_name}</small>
                      </span>
                    </div>
                    <time className="task-date" dateTime={task.scheduled_at}>
                      {formatBrazilDateTime(task.scheduled_at)}
                    </time>
                    <label className="task-status">
                      <select
                        aria-label="Alterar status"
                        value={task.status}
                        onChange={() => toggle(task)}
                      >
                        <option>Aberto</option>
                        <option>Concluído</option>
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
