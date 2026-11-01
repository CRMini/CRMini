import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import OpportunityDetail from "./opportunity-detail";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    name: "Projeto Aurora",
    client_id: "client-1",
    contact_id: "contact-1",
    company_name: "Aurora Tecnologia",
    contact_name: "Ana Souza",
    status: "Proposta",
    loss_reason: null,
    value: "48000.50",
    currency: "BRL",
    service_type: "Implantação",
    technology: "Next.js",
    resources: "Equipe de 3 pessoas",
    budget: "55000",
    budget_currency: "BRL",
    notes: "Cliente pediu proposta revisada.",
    customer_need: "Integrar o ERP ao CRM",
    offered_solution: "API intermediária",
    project_hours: "320",
    opened_at: "2026-10-01",
    expected_close_at: "2026-12-15",
    ...overrides,
  };
}

function mockFetch(handler: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/opportunities/opp-1") return handler();
    return jsonResponse([]);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OpportunityDetail", () => {
  it("mostra carregamento e depois os dados da oportunidade e o histórico", async () => {
    mockFetch(() => jsonResponse(opportunity()));

    render(<OpportunityDetail id="opp-1" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando oportunidade...",
    );

    expect(
      await screen.findByRole("heading", { name: "Projeto Aurora" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aurora Tecnologia · Ana Souza"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Proposta", { selector: ".opportunity-status-badge" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BRL 48.000,50")).toBeInTheDocument();
    expect(screen.getByText("BRL 55.000,00")).toBeInTheDocument();
    expect(screen.getByText("320 h")).toBeInTheDocument();
    expect(screen.getByText("01/10/2026")).toBeInTheDocument();
    expect(screen.getByText("15/12/2026")).toBeInTheDocument();
    expect(screen.getByText("Integrar o ERP ao CRM")).toBeInTheDocument();
    expect(screen.getByText("API intermediária")).toBeInTheDocument();
    expect(screen.getByText("Equipe de 3 pessoas")).toBeInTheDocument();
    expect(
      screen.getByText("Cliente pediu proposta revisada."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Histórico" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Nenhum evento registrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← Voltar às oportunidades" }),
    ).toHaveAttribute("href", "/oportunidades");

    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );
    expect(screen.queryByLabelText("Oportunidade")).not.toBeInTheDocument();
  });

  it("mostra o motivo da perda no status", async () => {
    mockFetch(() =>
      jsonResponse(opportunity({ status: "Perdida", loss_reason: "Preço" })),
    );

    render(<OpportunityDetail id="opp-1" />);

    expect(
      await screen.findByText("Perdida — Preço", {
        selector: ".opportunity-status-badge",
      }),
    ).toBeInTheDocument();
  });

  it("mostra o erro retornado pela API", async () => {
    mockFetch(() =>
      jsonResponse({ error: "Oportunidade não encontrada." }, false),
    );

    render(<OpportunityDetail id="opp-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Oportunidade não encontrada.",
    );
  });
});
