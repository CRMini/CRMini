import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import TasksView from "./tasks-view";

describe("TasksView date filter", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with no date filter and remembers a selected date in the session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const { unmount } = render(<TasksView />);

    expect(screen.getByLabelText("Filtrar tarefas por dia")).toHaveValue("");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tasks"));
    fireEvent.change(screen.getByLabelText("Filtrar tarefas por dia"), {
      target: { value: "2026-10-14" },
    });
    await waitFor(() =>
      expect(sessionStorage.getItem("tasks-date-filter")).toBe("2026-10-14"),
    );
    unmount();

    render(<TasksView />);
    await waitFor(() =>
      expect(screen.getByLabelText("Filtrar tarefas por dia")).toHaveValue(
        "2026-10-14",
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks?date=2026-10-14"),
    );
  });

  it("clears the saved date filter when the date is cleared", async () => {
    sessionStorage.setItem("tasks-date-filter", "2026-10-14");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    render(<TasksView />);
    const input = await screen.findByLabelText("Filtrar tarefas por dia");
    await waitFor(() => expect(input).toHaveValue("2026-10-14"));
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() =>
      expect(sessionStorage.getItem("tasks-date-filter")).toBeNull(),
    );
  });
});

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("Lista de tarefas", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("mostra carregamento sem exibir o vazio enquanto a primeira resposta está pendente", async () => {
    let resolveTasks!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input) === "/api/clients") {
        return Promise.resolve(ok([]));
      }
      return new Promise((done) => {
        resolveTasks = done;
      });
    });

    render(<TasksView />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando tarefas");
    expect(
      screen.queryByRole("heading", { name: "Nenhuma tarefa encontrada" }),
    ).not.toBeInTheDocument();

    resolveTasks(ok([]));

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma tarefa encontrada",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe as tarefas retornadas pela API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      return ok([
        {
          id: "task-1",
          contact_type: "email",
          subject: "Retornar contato",
          description: null,
          scheduled_at: "2026-10-26T12:00:00.000Z",
          status: "Aberto",
          client_id: "client-1",
          contact_id: "contact-1",
          company_name: "Empresa Alfa",
          contact_name: "Pessoa Exemplo",
        },
      ]);
    });

    render(<TasksView />);

    expect(await screen.findByText("Retornar contato")).toBeInTheDocument();
    expect(screen.getByText("1 tarefa(s)")).toBeInTheDocument();
    expect(screen.getByText("26/10/2026, 09:00")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nenhuma tarefa encontrada" }),
    ).not.toBeInTheDocument();
  });

  it("exibe o estado vazio quando a API responde sem tarefas", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      return ok([]);
    });

    render(<TasksView />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma tarefa encontrada",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 tarefa(s)")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro e não o vazio quando a API falha", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/clients") return ok([]);
      throw new Error("Falha ao carregar tarefas.");
    });

    render(<TasksView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar tarefas.",
    );
    expect(
      screen.queryByRole("heading", { name: "Nenhuma tarefa encontrada" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
