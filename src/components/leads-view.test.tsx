import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

import { formatBrazilDateTime } from "@/lib/brazil-date";
import LeadsView from "./leads-view";

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    company_name: "Empresa Alfa Ltda.",
    trade_name: "Alfa",
    tax_id: "12345678000190",
    contact_first_name: "João",
    contact_last_name: "Silva",
    contact_phone: null,
    contact_email: "joao@alfa.com",
    status: "Qualificando",
    lead_source: "Site",
    industry: "Tecnologia",
    segment: "Enterprise",
    city: "São Paulo",
    country: "Brasil",
    updated_at: "2026-11-20T12:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Tela de leads", () => {
  it("exibe o cabeçalho com breadcrumb, eyebrow, título e subheading", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);

    const breadcrumb = screen.getByRole("navigation", {
      name: "Navegação estrutural",
    });
    expect(breadcrumb).toHaveTextContent("Meu espaço");
    expect(breadcrumb).toHaveTextContent("Leads");
    expect(screen.getByRole("link", { name: "Meu espaço" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText("RELACIONAMENTO")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Leads" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Empresas em qualificação comercial antes de virarem clientes.",
      ),
    ).toBeInTheDocument();

    await screen.findByRole("heading", { name: "Nenhum lead cadastrado" });
  });

  it("exibe carregamento antes da primeira resposta", async () => {
    let resolve!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );

    render(<LeadsView />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando leads");
    expect(
      screen.queryByRole("heading", { name: "Nenhum lead cadastrado" }),
    ).not.toBeInTheDocument();

    resolve(ok([]));
    expect(
      await screen.findByRole("heading", { name: "Nenhum lead cadastrado" }),
    ).toBeInTheDocument();
  });

  it("renderiza as linhas com os dados retornados pela API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([lead()]));
    render(<LeadsView />);

    const row = (await screen.findByText("Empresa Alfa Ltda.")).closest(
      ".contact-row",
    ) as HTMLElement;
    expect(within(row).getByText("Alfa")).toBeInTheDocument();
    expect(within(row).getByText("João Silva")).toBeInTheDocument();
    expect(within(row).getByText("joao@alfa.com")).toBeInTheDocument();
    expect(within(row).getByText(/Qualificando/)).toBeInTheDocument();
    expect(within(row).getByText(/Site/)).toBeInTheDocument();
    expect(screen.getByText("1 lead(s)")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza o avatar com iniciais da empresa e a data de atualização", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([lead()]));
    render(<LeadsView />);

    const row = (await screen.findByText("Empresa Alfa Ltda.")).closest(
      ".contact-row",
    ) as HTMLElement;
    const avatar = row.querySelector(".contact-list-avatar") as HTMLElement;
    expect(avatar.textContent).toBe("EA");

    const details = row.querySelector(".contact-list-details") as HTMLElement;
    expect(details).toHaveTextContent("Atualizado em");
    expect(details).toHaveTextContent(
      formatBrazilDateTime("2026-11-20T12:00:00.000Z"),
    );
  });

  it("exibe estado vazio sem filtro quando não há leads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);

    const emptyState = (
      await screen.findByRole("heading", { name: "Nenhum lead cadastrado" })
    ).closest(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(emptyState?.closest(".contact-list")).toBeNull();
    expect(
      screen.getByText(
        "Quando você começar o cadastro, os leads em qualificação aparecerão aqui.",
      ),
    ).toBeInTheDocument();
  });

  it("exibe estado vazio com filtro ativo sem resultado", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);

    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "Novo" },
    });

    expect(
      await screen.findByRole("heading", { name: "Nenhum lead encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Experimente ajustar a busca ou o filtro de status."),
    ).toBeInTheDocument();
  });

  it("exibe erro com role=alert quando a API falha", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Falha ao carregar leads."),
    );
    render(<LeadsView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falha ao carregar leads.");
    expect(alert).toHaveClass("form-error");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("monta a URL com search e status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/leads");

    fireEvent.change(screen.getByLabelText("Buscar leads"), {
      target: { value: "alfa" },
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/leads?search=alfa");

    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "Novo" },
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/leads?search=alfa&status=Novo");
  });

  it("o filtro de status dispara uma nova busca", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "Desqualificado" },
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/leads?status=Desqualificado");
  });

  it("não oferece criação de lead nesta etapa", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));
    render(<LeadsView />);

    await screen.findByRole("heading", { name: "Nenhum lead cadastrado" });
    expect(document.querySelector('a[href="/leads/novo"]')).toBeNull();
    expect(
      screen.queryByRole("link", { name: /novo lead/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
