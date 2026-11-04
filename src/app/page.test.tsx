import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserName, getGreeting, getDashboardDate, getDashboardData } =
  vi.hoisted(() => ({
    getUserName: vi.fn(),
    getGreeting: vi.fn(),
    getDashboardDate: vi.fn(),
    getDashboardData: vi.fn(),
  }));

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

vi.mock("@/lib/repositories/dashboard", () => ({ getDashboardData }));

vi.mock("@/lib/repositories/settings", () => ({ getUserName }));
vi.mock("@/lib/greeting", () => ({ getGreeting, getDashboardDate }));

import Home, { dynamic } from "./page";

beforeEach(() => {
  getUserName.mockReset();
  getDashboardData.mockReset();
  getGreeting.mockReset();
  getDashboardDate.mockReset();
  getUserName.mockResolvedValue(null);
  getDashboardData.mockResolvedValue({
    opportunities: [],
    metrics: {
      contactsCount: 0,
      opportunitiesCount: 0,
      openOpportunitiesCount: 0,
      conversionRate: 0,
      openValueByCurrency: {},
    },
  });
  getDashboardDate.mockReturnValue("SÁBADO, 1 DE FEVEREIRO");
  getGreeting.mockImplementation((_date: Date, name?: string | null) =>
    name ? `Bom dia, ${name}` : "Bom dia",
  );
});

afterEach(() => cleanup());

describe("Visão geral", () => {
  it("força renderização dinâmica para não servir snapshot do build", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("leva ao formulário de cadastro ao selecionar Novo contato", async () => {
    render(await Home());

    expect(
      screen.getByRole("link", { name: "＋ Novo contato" }),
    ).toHaveAttribute("href", "/contatos/novo");
  });

  it("saudação recebe o nome configurado e o exibe no heading", async () => {
    getUserName.mockResolvedValue("Ana");

    render(await Home());

    expect(getGreeting).toHaveBeenCalledWith(expect.any(Date), "Ana");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Bom dia, Ana",
    );
  });

  it("sem nome configurado, saúda sem sufixo e recebe null", async () => {
    getUserName.mockResolvedValue(null);

    render(await Home());

    expect(getGreeting).toHaveBeenCalledWith(expect.any(Date), null);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bom dia");
    expect(heading).not.toHaveTextContent(", Ana");
  });

  it("continua renderizando e saúda sem nome quando o repositório falha", async () => {
    getUserName.mockRejectedValue(new Error("database is locked"));

    render(await Home());

    expect(getGreeting).toHaveBeenCalledWith(expect.any(Date), null);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Bom dia",
    );
    expect(
      screen.getByRole("link", { name: "＋ Novo contato" }),
    ).toBeInTheDocument();
  });
});
