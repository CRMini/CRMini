"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import DetailItem from "@/components/detail-item";
import EventTimeline from "@/components/event-timeline";
import { formatBrazilDate } from "@/lib/brazil-date";

type Opportunity = {
  id: string;
  name: string;
  client_id: string;
  contact_id: string;
  company_name: string;
  contact_name: string;
  status: string;
  loss_reason?: string | null;
  value?: string | null;
  currency: string;
  service_type?: string | null;
  technology?: string | null;
  resources?: string | null;
  budget?: string | null;
  budget_currency?: string | null;
  notes?: string | null;
  customer_need?: string | null;
  offered_solution?: string | null;
  project_hours?: string | null;
  opened_at: string;
  expected_close_at?: string | null;
};

const breadcrumbs = [
  { label: "Meu espaço", href: "/" },
  { label: "Oportunidades", href: "/oportunidades" },
  { label: "Detalhes da oportunidade" },
];

function formatMoney(value?: string | null, currency?: string | null) {
  if (value == null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency ?? ""} ${value}`.trim();
  return `${currency ?? ""} ${amount
    .toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    .trim()}`.trim();
}

function formatHours(value?: string | null) {
  if (value == null || value === "") return "—";
  const hours = Number(value);
  if (!Number.isFinite(hours)) return String(value);
  return `${hours.toLocaleString("pt-BR")} h`;
}

function statusTone(status: string) {
  if (status === "Ganha") return "won";
  if (status === "Perdida") return "lost";
  return "open";
}

function statusLabel(opportunity: Opportunity) {
  return opportunity.loss_reason
    ? `${opportunity.status} — ${opportunity.loss_reason}`
    : opportunity.status;
}

export default function OpportunityDetail({ id }: { id: string }) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    fetch(`/api/opportunities/${id}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível carregar a oportunidade.",
          );
        if (active) {
          setOpportunity(result);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (active)
          setError(
            reason.message || "Não foi possível carregar a oportunidade.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <main className="records-page">
      <Breadcrumbs items={breadcrumbs} />
      {loading ? (
        <p role="status">Carregando oportunidade...</p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : opportunity ? (
        <>
          <header className="records-header opportunity-detail-header">
            <div>
              <p className="eyebrow">OPORTUNIDADE</p>
              <div className="opportunity-detail-heading">
                <h1>{opportunity.name}</h1>
                <span
                  className={`opportunity-status-badge opportunity-status-badge--${statusTone(opportunity.status)}`}
                >
                  {statusLabel(opportunity)}
                </span>
              </div>
              <p className="subheading">
                {opportunity.company_name} · {opportunity.contact_name}
              </p>
            </div>
            <div className="opportunity-detail-actions">
              <Link className="text-link" href="/oportunidades">
                ← Voltar
              </Link>
              <Link
                className="primary-button"
                href={`/oportunidades/${id}/editar`}
              >
                Editar oportunidade
              </Link>
            </div>
          </header>
          <div className="detail-sections">
            <EventTimeline
              clientId={opportunity.client_id}
              opportunityId={opportunity.id}
              lockOpportunity
              contacts={[
                {
                  id: opportunity.contact_id,
                  full_name: opportunity.contact_name,
                },
              ]}
            />
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Dados da oportunidade</h2>
                  <p>Informações comerciais e datas do negócio.</p>
                </div>
              </div>
              <div className="detail-grid">
                <DetailItem label="Status" value={statusLabel(opportunity)} />
                <DetailItem
                  label="Valor"
                  value={formatMoney(opportunity.value, opportunity.currency)}
                />
                <DetailItem
                  label="Budget do cliente"
                  value={formatMoney(
                    opportunity.budget,
                    opportunity.budget_currency,
                  )}
                />
                <DetailItem
                  label="Tipo do serviço"
                  value={opportunity.service_type}
                />
                <DetailItem label="Tecnologia" value={opportunity.technology} />
                <DetailItem
                  label="Tempo de projeto"
                  value={formatHours(opportunity.project_hours)}
                />
                <DetailItem
                  label="Abertura"
                  value={formatBrazilDate(opportunity.opened_at)}
                />
                <DetailItem
                  label="Previsão de fechamento"
                  value={formatBrazilDate(opportunity.expected_close_at)}
                />
                <DetailItem label="Cliente" value={opportunity.company_name} />
                <DetailItem label="Contato" value={opportunity.contact_name} />
                {opportunity.status === "Perdida" && (
                  <DetailItem
                    label="Motivo da perda"
                    value={opportunity.loss_reason}
                  />
                )}
              </div>
            </section>
            <section className="form-section">
              <div className="form-section-heading">
                <div>
                  <h2>Detalhes</h2>
                  <p>Necessidade, solução e anotações do negócio.</p>
                </div>
              </div>
              <div className="detail-text-grid">
                <div className="detail-text">
                  <b>Necessidade do cliente</b>
                  <p>{opportunity.customer_need || "—"}</p>
                </div>
                <div className="detail-text">
                  <b>Solução ofertada</b>
                  <p>{opportunity.offered_solution || "—"}</p>
                </div>
                <div className="detail-text">
                  <b>Recursos</b>
                  <p>{opportunity.resources || "—"}</p>
                </div>
                <div className="detail-text">
                  <b>Observações</b>
                  <p>{opportunity.notes || "—"}</p>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
