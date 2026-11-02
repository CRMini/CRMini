"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import EmptyState from "@/components/empty-state";
import Field from "@/components/form-field";
import { RowActionButton } from "@/components/row-action";
import { formatBrazilDate, getBrazilDateString } from "@/lib/brazil-date";
import { eventTypes, type EventType } from "@/lib/event-validation";

type ContactOption = { id: string; full_name: string };

type OpportunityOption = { id: string; name: string };

type TimelineEvent = {
  id: string;
  client_id: string;
  opportunity_id: string | null;
  contact_id: string | null;
  event_type: string;
  title: string;
  details: string | null;
  occurred_at: string;
  is_origin: boolean;
  company_name: string;
  opportunity_name: string | null;
  contact_name: string | null;
};

const typeLabels: Record<EventType, string> = {
  reuniao: "Reunião",
  ligacao: "Ligação",
  email: "E-mail",
  mensagem: "Mensagem",
  nota: "Nota",
};

const emptyForm = () => ({
  event_type: "reuniao",
  title: "",
  details: "",
  occurred_at: getBrazilDateString(),
  opportunity_id: "",
  contact_id: "",
});

export default function EventTimeline({
  clientId,
  contacts = [],
  opportunityId,
  lockOpportunity = false,
}: {
  clientId: string;
  contacts?: ContactOption[];
  opportunityId?: string;
  lockOpportunity?: boolean;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContactName, setEditingContactName] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    occurred_at?: string;
  }>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const formId = useId();

  async function load(filter = typeFilter) {
    setLoading(true);
    setError("");

    try {
      const params = opportunityId
        ? new URLSearchParams({ opportunity_id: opportunityId })
        : new URLSearchParams({ client_id: clientId });
      if (filter) params.set("type", filter);
      const response = await fetch(`/api/events?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível carregar o histórico.",
        );
      }
      setEvents(result);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar o histórico.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(typeFilter);
    // A lista é refeita quando o cliente, a oportunidade ou o filtro muda.
  }, [clientId, opportunityId, typeFilter]);

  useEffect(() => {
    if (lockOpportunity) return;

    let cancelled = false;

    fetch(`/api/opportunities?client_id=${encodeURIComponent(clientId)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!cancelled) setOpportunities(result);
      })
      .catch(() => {
        // Sem oportunidades o formulário continua útil com "sem oportunidade".
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, lockOpportunity]);

  function updateForm(key: keyof ReturnType<typeof emptyForm>, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleForm() {
    if (showForm) {
      setEditingId(null);
      setForm(emptyForm());
      setFieldErrors({});
      setFormError("");
    }
    setShowForm((current) => !current);
  }

  function startEdit(event: TimelineEvent) {
    setEditingId(event.id);
    setEditingContactName(event.contact_name ?? "");
    setForm({
      event_type: event.event_type,
      title: event.title,
      details: event.details ?? "",
      occurred_at: event.occurred_at,
      opportunity_id: event.opportunity_id ?? "",
      contact_id: event.contact_id ?? "",
    });
    setFieldErrors({});
    setFormError("");
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingContactName("");
    setForm(emptyForm());
    setFieldErrors({});
    setFormError("");
    setShowForm(false);
  }

  async function remove(event: TimelineEvent) {
    if (
      !window.confirm("Excluir este evento? O histórico será preservado.")
    ) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error || "Não foi possível excluir o evento.",
        );
      }
      if (editingId === event.id) cancelEdit();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir o evento.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: { title?: string; occurred_at?: string } = {};
    if (!form.title.trim() || form.title.trim().length > 200) {
      nextErrors.title = "Informe um título (até 200 caracteres).";
    }
    if (!form.occurred_at) {
      nextErrors.occurred_at = "Informe uma data válida.";
    } else if (form.occurred_at > getBrazilDateString()) {
      nextErrors.occurred_at = "A data do evento não pode ser futura.";
    }

    setFieldErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setSaving(true);

    const editing = Boolean(editingId);

    try {
      const response = await fetch(
        editing ? `/api/events/${editingId}` : "/api/events",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            event_type: form.event_type,
            title: form.title,
            details: form.details,
            occurred_at: form.occurred_at,
            opportunity_id: lockOpportunity
              ? opportunityId ?? null
              : form.opportunity_id || null,
            contact_id: form.contact_id || null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error ||
            (editing
              ? "Não foi possível salvar o evento."
              : "Não foi possível registrar o evento."),
        );
      }

      setForm(emptyForm());
      setFieldErrors({});
      setEditingId(null);
      setEditingContactName("");
      if (editing) setShowForm(false);
      await load();
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : editing
            ? "Não foi possível salvar o evento."
            : "Não foi possível registrar o evento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-section event-timeline-section">
      <div className="form-section-heading">
        <div>
          <h2>Histórico</h2>
          <p>
            Registre conversas e acontecimentos do relacionamento. Evento é
            passado; tarefa é futuro.
          </p>
        </div>
        <button
          type="button"
          className="filter-button"
          aria-expanded={showForm}
          aria-controls={formId}
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? "Fechar formulário" : "＋ Registrar evento"}
        </button>
      </div>

      <div className="contact-filters">
        <label>
          <span>Filtrar por tipo</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">Todos os tipos</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <span className="contact-count">
          {events.length} evento{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {showForm && (
        <form id={formId} className="event-form" onSubmit={submit} noValidate>
          <h3 className="event-form-title">
            {editingId ? "Editar evento" : "Novo evento"}
          </h3>
          <div className="form-grid">
            <Field
              label="Título *"
              value={form.title}
              required
              error={fieldErrors.title}
              onChange={(value) => updateForm("title", value)}
            />
            <label className="form-field">
              <span>Tipo *</span>
              <select
                value={form.event_type}
                required
                onChange={(event) =>
                  updateForm("event_type", event.target.value)
                }
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Detalhes</span>
              <textarea
                value={form.details}
                maxLength={5000}
                onChange={(event) =>
                  updateForm("details", event.target.value)
                }
              />
            </label>
            <Field
              label="Data *"
              type="date"
              value={form.occurred_at}
              required
              error={fieldErrors.occurred_at}
              onChange={(value) => updateForm("occurred_at", value)}
            />
            {!lockOpportunity && (
              <label className="form-field">
                <span>Oportunidade</span>
                <select
                  value={form.opportunity_id}
                  onChange={(event) =>
                    updateForm("opportunity_id", event.target.value)
                  }
                >
                  <option value="">— sem oportunidade —</option>
                  {opportunities.map((opportunity) => (
                    <option key={opportunity.id} value={opportunity.id}>
                      {opportunity.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Contato</span>
              <select
                value={form.contact_id}
                onChange={(event) =>
                  updateForm("contact_id", event.target.value)
                }
              >
                <option value="">— sem contato —</option>
                {editingId &&
                  form.contact_id &&
                  !contacts.some(
                    (contact) => contact.id === form.contact_id,
                  ) && (
                    <option value={form.contact_id}>
                      {editingContactName || "Contato atual"} (inativo)
                    </option>
                  )}
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="form-field-hint">
            Evento = passado; tarefa = futuro.
          </p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="event-form-actions">
            {editingId && (
              <button
                type="button"
                className="subtle-button"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
            )}
            <button className="primary-button" disabled={saving}>
              {saving
                ? editingId
                  ? "Salvando..."
                  : "Registrando..."
                : editingId
                  ? "Salvar evento"
                  : "Registrar evento"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p role="status">Carregando histórico...</p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : events.length === 0 ? (
        <EmptyState
          icon="🗓"
          title="Nenhum evento registrado"
          description="Quando houver uma conversa ou um fato relevante, registre aqui para manter o histórico do relacionamento."
        />
      ) : (
        <ol className="event-timeline">
          {events.map((event) => (
            <li className="event-item" key={event.id}>
              <div className="event-item-header">
                <time dateTime={event.occurred_at}>
                  {formatBrazilDate(event.occurred_at)}
                </time>
                <span className="event-type">
                  {typeLabels[event.event_type as EventType] ||
                    event.event_type}
                </span>
                {event.is_origin && (
                  <span className="event-origin">
                    Origem da oportunidade
                  </span>
                )}
              </div>
              <b className="event-item-title">{event.title}</b>
              {event.details && (
                <p className="event-item-details">{event.details}</p>
              )}
              {(event.contact_name || event.opportunity_name) && (
                <div className="event-meta">
                  {event.contact_name && (
                    <span>Contato: {event.contact_name}</span>
                  )}
                  {event.opportunity_name && (
                    <span>Oportunidade: {event.opportunity_name}</span>
                  )}
                </div>
              )}
              <div className="event-item-actions">
                <RowActionButton
                  icon="✎"
                  label="Editar evento"
                  onClick={() => startEdit(event)}
                />
                {!event.is_origin && (
                  <RowActionButton
                    icon="✕"
                    tone="danger"
                    label="Excluir evento"
                    onClick={() => void remove(event)}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
