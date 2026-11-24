import { cleanup, render, screen } from "@testing-library/react";
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

import LeadsView from "./leads-view";

afterEach(() => cleanup());

describe("Tela de leads", () => {
  it("exibe o cabeçalho da página com breadcrumb, eyebrow, título e subheading", () => {
    render(<LeadsView />);

    const breadcrumb = screen.getByRole("navigation", {
      name: "Navegação estrutural",
    });
    expect(breadcrumb).toHaveTextContent("Meu espaço");
    expect(breadcrumb).toHaveTextContent("Leads");
    expect(
      screen.getByRole("link", { name: "Meu espaço" }),
    ).toHaveAttribute("href", "/");

    expect(screen.getByText("RELACIONAMENTO")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Leads" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Empresas em qualificação comercial antes de virarem clientes.",
      ),
    ).toBeInTheDocument();
  });

  it("exibe o estado vazio sem duplicar a moldura da listagem", () => {
    render(<LeadsView />);

    const emptyState = screen
      .getByRole("heading", { level: 2, name: "Nenhum lead cadastrado" })
      .closest(".empty-state");

    expect(emptyState).not.toBeNull();
    expect(emptyState?.closest("main.records-page")).not.toBeNull();
    expect(emptyState?.closest(".contact-list")).toBeNull();
    expect(
      screen.getByText(
        "Quando você começar o cadastro, os leads em qualificação aparecerão aqui.",
      ),
    ).toBeInTheDocument();
  });

  it("não oferece criação de lead nesta etapa", () => {
    render(<LeadsView />);

    expect(document.querySelector('a[href="/leads/novo"]')).toBeNull();
    expect(
      screen.queryByRole("link", { name: /novo lead/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
