import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

import ContactsView from "./contacts-view";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Lista de contatos", () => {
  it("exibe carregamento e não vazio enquanto a primeira resposta está pendente", async () => {
    let resolve!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ContactsView />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando contatos");
    expect(screen.queryByRole("heading", { name: "Nenhum contato encontrado" })).not.toBeInTheDocument();
    resolve({ ok: true, json: async () => [] } as Response);
    expect(await screen.findByRole("heading", { name: "Nenhum contato encontrado" })).toBeInTheDocument();
  });

  it("apresenta erro após falha ao carregar", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Falha ao carregar contatos."));
    render(<ContactsView />);
    expect(await screen.findByText("Falha ao carregar contatos.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nenhum contato encontrado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe os contatos retornados pela API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "contact-1",
          full_name: "Pessoa Exemplo",
          job_title: "Analista",
          email: "pessoa@example.com",
          is_primary: true,
          is_active: true,
          client_id: "client-1",
          company_name: "Empresa Alfa",
          industry: "Tecnologia",
        },
      ]),
    );

    render(<ContactsView />);

    expect(await screen.findByText("Pessoa Exemplo")).toBeInTheDocument();
    expect(screen.getByText("1 contato(s)")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nenhum contato encontrado" }),
    ).not.toBeInTheDocument();
  });

  it("carrega a primeira listagem imediatamente, sem debounce", () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok([]));

    render(<ContactsView />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/contacts");
  });

  it("aplica debounce nas buscas subsequentes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok([]));

    render(<ContactsView />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Buscar contatos"), {
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
    expect(fetchMock).toHaveBeenLastCalledWith("/api/contacts?q=alfa");
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

    render(<ContactsView />);
    fireEvent.change(screen.getByLabelText("Buscar contatos"), {
      target: { value: "beta" },
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/contacts?q=beta");

    resolveSearch(
      ok([
        {
          id: "contact-2",
          full_name: "Pessoa Beta",
          is_primary: false,
          is_active: true,
          client_id: "client-2",
          company_name: "Empresa Beta",
        },
      ]),
    );
    await flush();

    expect(screen.getByText("Pessoa Beta")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolveInitial(
      ok([
        {
          id: "contact-1",
          full_name: "Pessoa Alfa",
          is_primary: false,
          is_active: true,
          client_id: "client-1",
          company_name: "Empresa Alfa",
        },
      ]),
    );
    await flush();

    expect(screen.getByText("Pessoa Beta")).toBeInTheDocument();
    expect(screen.queryByText("Pessoa Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("1 contato(s)")).toBeInTheDocument();
  });

  it("exibe o link de edição em cada linha apontando para o contato", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "contact-1",
          full_name: "Pessoa Exemplo",
          is_primary: true,
          is_active: true,
          client_id: "client-1",
          company_name: "Empresa Alfa",
        },
        {
          id: "contact-2",
          full_name: "Pessoa Beta",
          is_primary: false,
          is_active: true,
          client_id: "client-2",
          company_name: "Empresa Beta",
        },
      ]),
    );

    render(<ContactsView />);

    const firstRow = (await screen.findByText("Pessoa Exemplo")).closest(
      ".contact-row",
    )!;
    const secondRow = screen.getByText("Pessoa Beta").closest(".contact-row")!;
    const firstEditLink = within(firstRow).getByRole("link", { name: "Editar contato Pessoa Exemplo" });
    const secondEditLink = within(secondRow).getByRole("link", { name: "Editar contato Pessoa Beta" });

    expect(firstEditLink).toHaveAttribute(
      "href",
      "/contatos/contact-1",
    );
    expect(secondEditLink).toHaveAttribute(
      "href",
      "/contatos/contact-2",
    );
    expect(screen.getAllByRole("link", { name: "Editar contato Pessoa Exemplo" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Editar contato Pessoa Beta" })).toHaveLength(1);
    expect(firstEditLink.closest(".contact-row")).toBe(firstRow);
    expect(firstEditLink.closest(".contact-name-line")).toBeNull();
    expect(secondEditLink.closest(".contact-row")).toBe(secondRow);
    expect(secondEditLink.closest(".contact-name-line")).toBeNull();
  });

  it("usa botões de pictograma com tooltip nas ações da linha", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "contact-1",
          full_name: "Pessoa Exemplo",
          is_primary: true,
          is_active: true,
          client_id: "client-1",
          company_name: "Empresa Alfa",
        },
      ]),
    );

    render(<ContactsView />);

    const row = (await screen.findByText("Pessoa Exemplo")).closest(
      ".contact-row",
    ) as HTMLElement;
    const editLink = within(row).getByRole("link", {
      name: "Editar contato Pessoa Exemplo",
    });
    const deactivateButton = within(row).getByRole("button", {
      name: "Desativar contato Pessoa Exemplo",
    });

    expect(editLink).toHaveClass("row-action");
    expect(editLink).toHaveAttribute(
      "data-tooltip",
      "Editar contato Pessoa Exemplo",
    );
    expect(editLink.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "✎",
    );

    expect(deactivateButton).toHaveAttribute(
      "class",
      "row-action row-action--danger",
    );
    expect(deactivateButton).toHaveAttribute(
      "data-tooltip",
      "Desativar contato Pessoa Exemplo",
    );
    expect(
      deactivateButton.querySelector('[aria-hidden="true"]'),
    ).toHaveTextContent("⊘");
    expect(editLink.closest(".contact-row-actions")).not.toBeNull();
    expect(deactivateButton.closest(".contact-row-actions")).not.toBeNull();
  });

  it("leva ao formulário de novo contato a partir do cabeçalho", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<ContactsView />);

    expect(
      screen.getByRole("link", { name: "Importar do LinkedIn" }),
    ).toHaveAttribute("href", "/contatos/importar");

    expect(
      screen.getByRole("link", { name: "＋ Novo contato" }),
    ).toHaveAttribute("href", "/contatos/novo");
    expect(
      await screen.findByRole("heading", {
        name: "Nenhum contato encontrado",
      }),
    ).toBeInTheDocument();
  });

  it("consulta desativados ao marcar Mostrar desativados e exibe o marcador", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok([
        {
          id: "contact-1",
          full_name: "Pessoa Ativa",
          is_primary: true,
          is_active: true,
          client_id: "client-1",
          company_name: "Empresa Alfa",
        },
        {
          id: "contact-2",
          full_name: "Pessoa Inativa",
          is_primary: false,
          is_active: false,
          client_id: "client-1",
          company_name: "Empresa Alfa",
        },
      ]),
    );

    render(<ContactsView />);
    expect(await screen.findByText("Pessoa Ativa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar desativados" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/contacts?include_inactive=1",
      ),
    );
    expect(await screen.findByText(/Pessoa Inativa/)).toHaveTextContent(
      "Pessoa Inativa (Desativado)",
    );
  });

  it("desativa o contato após confirmação e remove a linha da listagem padrão", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) => {
        if (init?.method === "PATCH")
          return ok({ id: "contact-1", full_name: "Pessoa Exemplo", is_active: false });
        return ok([
          {
            id: "contact-1",
            full_name: "Pessoa Exemplo",
            is_primary: true,
            is_active: true,
            client_id: "client-1",
            company_name: "Empresa Alfa",
          },
        ]);
      });

    render(<ContactsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Desativar contato Pessoa Exemplo" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/contact-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Pessoa Exemplo")).not.toBeInTheDocument(),
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      "Desativar este contato? O histórico será preservado.",
    );
    expect(screen.getByText("0 contato(s)")).toBeInTheDocument();
  });

  it("reativa o contato via PATCH e atualiza o marcador na linha", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (init?.method === "PATCH")
          return ok({ id: "contact-2", full_name: "Pessoa Inativa", is_active: true });
        if (String(input).includes("include_inactive=1"))
          return ok([
            {
              id: "contact-2",
              full_name: "Pessoa Inativa",
              is_primary: false,
              is_active: false,
              client_id: "client-1",
              company_name: "Empresa Alfa",
            },
          ]);
        return ok([]);
      });

    render(<ContactsView />);
    expect(
      await screen.findByRole("heading", { name: "Nenhum contato encontrado" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar desativados" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reativar contato Pessoa Inativa" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/contact-2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_active: true }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/Pessoa Inativa/)).not.toHaveTextContent(
        "(Desativado)",
      ),
    );
    expect(screen.getByText("Pessoa Inativa")).toBeInTheDocument();
  });

  it("mantém a linha quando a desativação é cancelada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        ok([
          {
            id: "contact-1",
            full_name: "Pessoa Exemplo",
            is_primary: true,
            is_active: true,
            client_id: "client-1",
            company_name: "Empresa Alfa",
          },
        ]),
      );

    render(<ContactsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Desativar contato Pessoa Exemplo" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Pessoa Exemplo")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
  });
});
