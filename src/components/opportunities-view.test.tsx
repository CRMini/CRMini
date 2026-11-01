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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import OpportunitiesView from "./opportunities-view";

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function failed(body: unknown) {
  return { ok: false, json: async () => body } as Response;
}

afterEach(() => cleanup());

describe("Lista de oportunidades", () => {
  it("mostra carregamento sem exibir o vazio enquanto a primeira resposta está pendente", async () => {
    const pending: ((response: Response) => void)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((done) => {
          pending.push(done);
        }),
    );

    render(<OpportunitiesView />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando oportunidades",
    );
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma oportunidade encontrada",
      }),
    ).not.toBeInTheDocument();

    pending.forEach((resolve) => resolve(ok([])));

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma oportunidade encontrada",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe as oportunidades retornadas pela API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      return ok([
        {
          id: "opportunity-1",
          client_id: "client-1",
          name: "Projeto Exemplo",
          company_name: "Empresa Alfa",
          contact_name: "Pessoa Exemplo",
          status: "Em andamento",
          value: "1000.00",
          currency: "BRL",
          opened_at: "2026-10-01",
          expected_close_at: "2026-11-01",
          service_type: "Implantação",
          technology: "Next.js",
        },
      ]);
    });

    render(<OpportunitiesView />);

    expect(await screen.findByText("Projeto Exemplo")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Projeto Exemplo" }),
    ).toHaveAttribute("href", "/oportunidades/opportunity-1");
    expect(screen.getByText("1 oportunidade(s)")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Lista de oportunidades" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma oportunidade encontrada",
      }),
    ).not.toBeInTheDocument();
  });

  it("busca oportunidades sem exigir acentos", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      return ok([
        {
          id: "opportunity-1",
          client_id: "client-1",
          name: "Projeto Alfa",
          company_name: "Empresa José",
          contact_name: "Pessoa Exemplo",
          status: "Em andamento",
          value: "1000.00",
          currency: "BRL",
          opened_at: "2026-10-01",
          expected_close_at: "2026-11-01",
        },
        {
          id: "opportunity-2",
          client_id: "client-2",
          name: "Projeto Beta",
          company_name: "Empresa Bia",
          contact_name: "Outra Pessoa",
          status: "Proposta",
          value: "2000.00",
          currency: "BRL",
          opened_at: "2026-10-02",
          expected_close_at: "2026-11-02",
        },
      ]);
    });

    render(<OpportunitiesView />);
    await screen.findByText("Projeto Alfa");

    fireEvent.change(screen.getByLabelText("Buscar oportunidades"), {
      target: { value: "jose" },
    });

    expect(screen.getByText("Projeto Alfa")).toBeInTheDocument();
    expect(screen.queryByText("Projeto Beta")).not.toBeInTheDocument();
  });

  it("exibe o estado vazio quando a API responde sem oportunidades", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));

    render(<OpportunitiesView />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma oportunidade encontrada",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 oportunidade(s)")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro e não o vazio quando a API falha", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      return failed({ error: "Falha ao carregar oportunidades." });
    });

    render(<OpportunitiesView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar oportunidades.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma oportunidade encontrada",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
