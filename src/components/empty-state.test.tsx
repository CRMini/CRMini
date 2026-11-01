import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import EmptyState from "./empty-state";

afterEach(() => cleanup());

describe("EmptyState", () => {
  it("renderiza ícone, título, descrição e ação", () => {
    render(
      <EmptyState
        icon="◎"
        title="Nenhum cliente cadastrado"
        description="Comece adicionando uma empresa."
        action={<button type="button">Cadastrar</button>}
      />,
    );

    expect(screen.getByText("◎")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Comece adicionando uma empresa."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cadastrar" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".empty-state")).toBeInTheDocument();
  });

  it("omite a ação quando não é informada", () => {
    render(
      <EmptyState
        icon="◈"
        title="Nenhuma oportunidade"
        description="Ajuste os filtros."
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nenhuma oportunidade" }),
    ).toBeInTheDocument();
  });
});
