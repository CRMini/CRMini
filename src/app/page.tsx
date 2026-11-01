import Breadcrumbs from "@/components/breadcrumbs";
import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  getRecentOpportunities,
  type RecentOpportunity,
} from "@/lib/recent-opportunities";
import {
  getDashboardMetrics,
  type DashboardMetricRow,
} from "@/lib/dashboard-metrics";
import { getDashboardDate, getGreeting } from "@/lib/greeting";
import { formatBrazilDateMedium } from "@/lib/brazil-date";
import { getUserName } from "@/lib/repositories/settings";

const avatarColors = ["peach", "blue", "green", "lilac"];

// O dashboard lê o banco a cada requisição: sem isso o build pré-renderiza a
// página e o app empacotado serviria um snapshot estático dos dados.
export const dynamic = "force-dynamic";

export default async function Home() {
  let opportunities: RecentOpportunity[] = [];
  let userName: string | null = null;
  let stats = {
    contactsCount: 0,
    opportunitiesCount: 0,
    openOpportunitiesCount: 0,
    conversionRate: 0,
    openValueByCurrency: {} as Record<string, string | number>,
  };
  try {
    const db = getDb();
    [opportunities, stats, userName] = await Promise.all([
      getRecentOpportunities((sql) => ({
        rows: db.prepare(sql).all() as RecentOpportunity[],
      })),
      getDashboardMetrics((sql) => ({
        rows: [db.prepare(sql).get() as DashboardMetricRow],
      })),
      getUserName(),
    ]);
  } catch {
    // A página permanece acessível se o banco estiver temporariamente indisponível.
  }
  return (
    <>
      <main className="records-page" id="inicio">
        <Breadcrumbs
          items={[{ label: "Meu espaço", href: "/" }, { label: "Visão geral" }]}
        />
        <header className="records-header">
          <div>
            <p className="eyebrow">{getDashboardDate()}</p>
            <h1>
              {getGreeting(new Date(), userName)} <span>✳</span>
            </h1>
            <p className="subheading">
              Aqui está o resumo do que acontece no seu espaço.
            </p>
          </div>
          <Link className="primary-button" href="/contatos/novo">
            <span>＋</span> Novo contato
          </Link>
        </header>
        <div className="dashboard-content">
          <div className="metric-grid">
            <Link className="metric-card" href="/contatos">
              <div className="metric-top">
                <span>Contatos</span>
                <span className="metric-icon">◎</span>
              </div>
              <div className="metric-value">{stats.contactsCount}</div>
              <div className="metric-change">Ver contatos →</div>
            </Link>
            <Link className="metric-card" href="/oportunidades">
              <div className="metric-top">
                <span>Oportunidades</span>
                <span className="metric-icon">↗</span>
              </div>
              <div className="metric-value">{stats.opportunitiesCount}</div>
              <div className="metric-change">
                {stats.openOpportunitiesCount} em aberto
              </div>
            </Link>
            <Link className="metric-card" href="/oportunidades">
              <div className="metric-top">
                <span>Conversão</span>
                <span className="metric-icon">◌</span>
              </div>
              <div className="metric-value">{stats.conversionRate}%</div>
              <div className="metric-change">
                Ganhos sobre oportunidades concluídas
              </div>
            </Link>
            <Link className="metric-card" href="/oportunidades">
              <div className="metric-top">
                <span>Valor em aberto</span>
                <span className="metric-icon">R$</span>
              </div>
              <div className="metric-value metric-currency">
                {Object.entries(stats.openValueByCurrency).length
                  ? Object.entries(stats.openValueByCurrency)
                      .map(
                        ([currency, value]) =>
                          `${currency} ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                      )
                      .join(" · ")
                  : "—"}
              </div>
              <div className="metric-change">
                Total por moeda, sem converter
              </div>
            </Link>
          </div>
          <div className="section-heading">
            <div>
              <h2>Oportunidades recentes</h2>
              <p>Acompanhe seus negócios mais recentes.</p>
            </div>
            <Link className="text-link" href="/oportunidades">
              Ver todas <span>→</span>
            </Link>
          </div>
          <section className="table-card" id="oportunidades">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>OPORTUNIDADE</th>
                    <th>ETAPA</th>
                    <th>VALOR</th>
                    <th>ATUALIZADO</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opportunity, index) => (
                    <tr key={opportunity.id}>
                      <td>
                        <div className="contact-cell">
                          <span
                            className={`contact-avatar ${avatarColors[index % avatarColors.length]}`}
                          >
                            {opportunity.contact_name
                              .trim()
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>
                            <b>{opportunity.name}</b>
                            <small>
                              {opportunity.company_name} ·{" "}
                              {opportunity.contact_name}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`stage stage-${avatarColors[index % avatarColors.length]}`}
                        >
                          <i />
                          {opportunity.status}
                        </span>
                      </td>
                      <td className="amount">
                        {opportunity.value == null
                          ? "—"
                          : `${opportunity.currency} ${Number(opportunity.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="date">
                        {formatBrazilDateMedium(opportunity.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              {opportunities.length ? (
                <>
                  Mostrando <b>{opportunities.length}</b> oportunidades recentes
                </>
              ) : (
                "Nenhuma oportunidade cadastrada ainda."
              )}
              <Link className="text-link" href="/oportunidades/nova">
                ＋ Nova oportunidade
              </Link>
            </div>
          </section>
          <footer className="page-footer">
            Feito para relações que fazem sentido <span>✳</span>
          </footer>
        </div>
      </main>
    </>
  );
}
