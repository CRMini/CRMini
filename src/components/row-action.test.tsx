import {
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

import { RowActionButton, RowActionLink } from "./row-action";

afterEach(() => {
  cleanup();
});

function pictogram(element: HTMLElement) {
  return element.querySelector('[aria-hidden="true"]');
}

describe("RowActionLink", () => {
  it("renderiza pictograma oculto, rótulo acessível e tooltip iguais", () => {
    render(
      <RowActionLink
        href="/clientes/client-1/editar"
        icon="✎"
        label="Editar cliente Empresa Alfa"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Editar cliente Empresa Alfa",
    });

    expect(link).toHaveAttribute("href", "/clientes/client-1/editar");
    expect(link).toHaveClass("row-action");
    expect(link).not.toHaveClass("row-action--danger");
    expect(link).toHaveAttribute("data-tooltip", "Editar cliente Empresa Alfa");
    expect(link).toHaveTextContent("✎");

    const icon = pictogram(link);
    expect(icon).not.toBeNull();
    expect(icon).toHaveTextContent("✎");
  });

  it("usa a variação de perigo quando tone é danger", () => {
    render(
      <RowActionLink
        href="/clientes/client-1/desativar"
        icon="⊘"
        label="Desativar cliente Empresa Alfa"
        tone="danger"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Desativar cliente Empresa Alfa",
    });

    expect(link).toHaveAttribute("class", "row-action row-action--danger");
    expect(link).toHaveAttribute(
      "data-tooltip",
      "Desativar cliente Empresa Alfa",
    );
    expect(pictogram(link)).toHaveTextContent("⊘");
  });
});

describe("RowActionButton", () => {
  it("dispara onClick ao ser acionado e expõe tooltip igual ao rótulo", () => {
    const onClick = vi.fn();

    render(
      <RowActionButton
        icon="✕"
        label="Excluir evento"
        onClick={onClick}
        tone="danger"
      />,
    );

    const button = screen.getByRole("button", { name: "Excluir evento" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("class", "row-action row-action--danger");
    expect(button).toHaveAttribute("data-tooltip", "Excluir evento");
    expect(button).not.toBeDisabled();
    expect(pictogram(button)).toHaveTextContent("✕");

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("mantém a classe base quando tone não é informado", () => {
    render(
      <RowActionButton icon="✎" label="Editar evento" onClick={vi.fn()} />,
    );

    const button = screen.getByRole("button", { name: "Editar evento" });

    expect(button).toHaveAttribute("class", "row-action");
    expect(pictogram(button)).toHaveTextContent("✎");
  });

  it("não dispara onClick enquanto estiver desabilitado", () => {
    const onClick = vi.fn();

    render(
      <RowActionButton
        icon="⊘"
        label="Desativar contato Pessoa Exemplo"
        onClick={onClick}
        disabled
      />,
    );

    const button = screen.getByRole("button", {
      name: "Desativar contato Pessoa Exemplo",
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "data-tooltip",
      "Desativar contato Pessoa Exemplo",
    );

    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("expõe o estado de expansão do painel que controla", () => {    const { rerender } = render(
      <RowActionButton
        icon="＋"
        label="Cadastrar empresa para Bia Teste"
        onClick={vi.fn()}
        ariaExpanded={false}
        ariaControls="linkedin-company-editor-1"
      />,
    );

    const button = screen.getByRole("button", {
      name: "Cadastrar empresa para Bia Teste",
    });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "linkedin-company-editor-1");

    rerender(
      <RowActionButton
        icon="▴"
        label="Fechar cadastro de empresa para Bia Teste"
        onClick={vi.fn()}
        ariaExpanded
      />,
    );

    const opened = screen.getByRole("button", {
      name: "Fechar cadastro de empresa para Bia Teste",
    });

    expect(opened).toHaveAttribute("aria-expanded", "true");
    expect(opened).not.toHaveAttribute("aria-controls");
  });
});

describe("RowActionLink com clique", () => {
  it("repassa onClick para preservar o rascunho antes de navegar", () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) =>
      event.preventDefault(),
    );

    render(
      <RowActionLink
        href="/contatos/contact-1"
        icon="↗"
        label="Ver contato importado"
        onClick={onClick}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "Ver contato importado" }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("RowAction com texto curto", () => {
  it("mostra o texto visível quando o pictograma sozinho é ambíguo", () => {
    render(
      <RowActionButton
        icon="＋"
        text="Empresa"
        label="Cadastrar empresa para Bia Teste"
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Cadastrar empresa para Bia Teste",
    });

    expect(button).toHaveClass("row-action");
    expect(button).toHaveClass("row-action--labeled");
    expect(
      within(button).getByText("Empresa", { selector: ".row-action-text" }),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute(
      "data-tooltip",
      "Cadastrar empresa para Bia Teste",
    );
    expect(pictogram(button)).toHaveTextContent("＋");
  });

  it("permite o texto curto no link também", () => {
    render(
      <RowActionLink
        href="/contatos/contact-1"
        icon="↗"
        text="Contato"
        label="Ver contato importado"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Ver contato importado",
    });

    expect(link).toHaveClass("row-action--labeled");
    expect(
      within(link).getByText("Contato", { selector: ".row-action-text" }),
    ).toBeInTheDocument();
  });
});
