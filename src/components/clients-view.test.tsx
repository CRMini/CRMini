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

import ClientsView from "./clients-view";

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function failed(body: unknown) {
  return { ok: false, json: async () => body } as Response;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Lista de clientes", () => {
  it("mostra carregamento sem exibir o vazio enquanto a primeira resposta está pendente", async () => {
    let resolve!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );

    render(<ClientsView />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando clientes");
    expect(
      screen.queryByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).not.toBeInTheDocument();

    resolve(ok([]));

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe os clientes retornados pela API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "client-1",
          company_name: "Empresa Alfa",
          trade_name: "Alfa",
          industry: "Tecnologia",
          is_active: true,
          contacts: [],
        },
      ]),
    );

    render(<ClientsView />);

    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
    expect(screen.getByText("1 cliente(s)")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver detalhes de Empresa Alfa" }),
    ).toHaveAttribute("href", "/clientes/client-1");
    expect(
      screen.getByRole("link", { name: "Editar cliente Empresa Alfa" }),
    ).toHaveAttribute("href", "/clientes/client-1/editar");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).not.toBeInTheDocument();
  });

  it("exibe as ações de linha com pictograma oculto e tooltip igual ao rótulo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "client-1",
          company_name: "Empresa Alfa",
          is_active: true,
          contacts: [],
        },
      ]),
    );

    render(<ClientsView />);

    const row = (await screen.findByText("Empresa Alfa")).closest(
      ".client-row",
    ) as HTMLElement;
    const editLink = within(row).getByRole("link", {
      name: "Editar cliente Empresa Alfa",
    });
    const deactivateButton = within(row).getByRole("button", {
      name: "Desativar cliente Empresa Alfa",
    });

    expect(editLink).toHaveAttribute(
      "data-tooltip",
      "Editar cliente Empresa Alfa",
    );
    expect(editLink).toHaveClass("row-action");
    expect(editLink.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "✎",
    );

    expect(deactivateButton).toHaveAttribute(
      "data-tooltip",
      "Desativar cliente Empresa Alfa",
    );
    expect(deactivateButton).toHaveAttribute(
      "class",
      "row-action row-action--danger",
    );
    expect(
      deactivateButton.querySelector('[aria-hidden="true"]'),
    ).toHaveTextContent("⊘");
    expect(editLink.closest(".client-row-actions")).not.toBeNull();
    expect(deactivateButton.closest(".client-row-actions")).not.toBeNull();
  });

  it("exibe o estado vazio quando a API responde sem clientes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([]));

    render(<ClientsView />);

    expect(
      await screen.findByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 cliente(s)")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro e não o vazio quando a requisição falha", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Falha ao carregar clientes."),
    );

    render(<ClientsView />);

    expect(await screen.findByText("Falha ao carregar clientes.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe o erro da API quando a resposta não é bem-sucedida", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      failed({ error: "Não autorizado." }),
    );

    render(<ClientsView />);

    expect(await screen.findByText("Não autorizado.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nenhum cliente cadastrado" }),
    ).not.toBeInTheDocument();
  });

  it("carrega a primeira listagem imediatamente, sem debounce", () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok([]));

    render(<ClientsView />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/clients");
  });

  it("aplica debounce nas buscas subsequentes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok([]));

    render(<ClientsView />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Buscar clientes"), {
      target: { value: "alfa" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/clients?q=alfa");
  });

  it("ignora a resposta de uma busca anterior quando uma nova busca já resolveu", async () => {
    vi.useFakeTimers();
    let resolveInitial!: (response: Response) => void;
    let resolveSearch!: (response: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveInitial = done;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveSearch = done;
          }),
      );

    render(<ClientsView />);
    fireEvent.change(screen.getByLabelText("Buscar clientes"), {
      target: { value: "beta" },
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/clients?q=beta");

    resolveSearch(
      ok([
        {
          id: "client-2",
          company_name: "Empresa Beta",
          is_active: true,
          contacts: [],
        },
      ]),
    );
    await flush();

    expect(screen.getByText("Empresa Beta")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolveInitial(
      ok([
        {
          id: "client-1",
          company_name: "Empresa Alfa",
          is_active: true,
          contacts: [],
        },
      ]),
    );
    await flush();

    expect(screen.getByText("Empresa Beta")).toBeInTheDocument();
    expect(screen.queryByText("Empresa Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("1 cliente(s)")).toBeInTheDocument();
  });
});
