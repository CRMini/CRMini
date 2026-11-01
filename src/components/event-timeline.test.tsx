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

import EventTimeline from "./event-timeline";
import { getBrazilDateString } from "@/lib/brazil-date";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

const contacts = [{ id: "contact-1", full_name: "Ana Souza" }];

const baseEvent = {
  id: "event-1",
  client_id: "client-1",
  opportunity_id: null,
  contact_id: null,
  event_type: "reuniao",
  title: "Reunião inicial",
  details: "Conversa sobre o projeto",
  occurred_at: "2026-10-01",
  is_origin: false,
  company_name: "Empresa Aurora",
  opportunity_name: null,
  contact_name: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EventTimeline — lista", () => {
  it("mostra carregamento e depois o estado vazio", async () => {
    let resolveEvents!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/opportunities")) {
        return Promise.resolve(jsonResponse([]));
      }
      return new Promise<Response>((resolve) => {
        resolveEvents = resolve;
      });
    });

    render(<EventTimeline clientId="client-1" contacts={contacts} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando histórico...",
    );

    await act(async () => {
      resolveEvents(jsonResponse([]));
    });

    expect(
      await screen.findByRole("heading", {
        name: "Nenhum evento registrado",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("mostra erro quando a listagem falha", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).startsWith("/api/opportunities"))
        return jsonResponse([]);
      return jsonResponse({ error: "Falha ao carregar o histórico." }, false);
    });

    render(<EventTimeline clientId="client-1" contacts={contacts} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar o histórico.",
    );
  });

  it("lista evento com origem, oportunidade, contato e data civil", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).startsWith("/api/opportunities"))
        return jsonResponse([]);
      return jsonResponse([
        {
          ...baseEvent,
          is_origin: true,
          opportunity_id: "opp-1",
          contact_id: "contact-1",
          opportunity_name: "Projeto Aurora",
          contact_name: "Ana Souza",
        },
      ]);
    });

    render(<EventTimeline clientId="client-1" contacts={contacts} />);

    expect(await screen.findByText("Reunião inicial")).toBeInTheDocument();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Reunião")).toBeInTheDocument();
    expect(within(item).getByText("Origem da oportunidade")).toBeInTheDocument();
    expect(within(item).getByText("Contato: Ana Souza")).toBeInTheDocument();
    expect(within(item).getByText("Oportunidade: Projeto Aurora")).toBeInTheDocument();
    expect(within(item).getByText("Conversa sobre o projeto")).toBeInTheDocument();
    expect(within(item).getByText("01/10/2026")).toHaveAttribute(
      "dateTime",
      "2026-10-01",
    );
  });

  it("refaz a busca ao filtrar por tipo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (String(input).startsWith("/api/opportunities"))
          return jsonResponse([]);
        if (String(input) === "/api/events?client_id=client-1&type=email") {
          return jsonResponse([
            {
              ...baseEvent,
              id: "event-email",
              event_type: "email",
              title: "E-mail enviado",
            },
          ]);
        }
        return jsonResponse([]);
      },
    );

    render(<EventTimeline clientId="client-1" contacts={contacts} />);
    await screen.findByRole("heading", { name: "Nenhum evento registrado" });

    fireEvent.change(screen.getByLabelText("Filtrar por tipo"), {
      target: { value: "email" },
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events?client_id=client-1&type=email",
      ),
    );
    expect(await screen.findByText("E-mail enviado")).toBeInTheDocument();
  });
});

describe("EventTimeline — formulário", () => {
  it("registra o evento, envia os vínculos e recarrega a lista", async () => {
    let posted: Record<string, unknown> | null = null;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.startsWith("/api/opportunities"))
          return jsonResponse([{ id: "opp-1", name: "Projeto Aurora" }]);
        if (url === "/api/events" && init?.method === "POST") {
          posted = JSON.parse(init.body as string);
          return jsonResponse({ id: "event-new" });
        }
        return jsonResponse([]);
      },
    );

    render(<EventTimeline clientId="client-1" contacts={contacts} />);
    await screen.findByRole("heading", { name: "Nenhum evento registrado" });

    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );

    const title = screen.getByRole("textbox", { name: /Título/ });
    fireEvent.change(title, { target: { value: "Ligação de retorno" } });
    fireEvent.change(screen.getByLabelText("Detalhes"), {
      target: { value: "Cliente pediu proposta revisada." },
    });
    fireEvent.change(screen.getByLabelText(/Data/), {
      target: { value: "2026-10-05" },
    });
    fireEvent.change(screen.getByLabelText(/Tipo/), {
      target: { value: "ligacao" },
    });
    fireEvent.change(screen.getByLabelText("Oportunidade"), {
      target: { value: "opp-1" },
    });
    fireEvent.change(screen.getByLabelText("Contato"), {
      target: { value: "contact-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      client_id: "client-1",
      event_type: "ligacao",
      title: "Ligação de retorno",
      details: "Cliente pediu proposta revisada.",
      occurred_at: "2026-10-05",
      opportunity_id: "opp-1",
      contact_id: "contact-1",
    });

    await waitFor(() => expect(title).toHaveValue(""));
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).startsWith("/api/events?client_id=") && !init,
      ).length,
    ).toBeGreaterThan(1);
  });

  it("sinaliza título vazio sem limpar os demais campos", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (String(input).startsWith("/api/opportunities"))
          return jsonResponse([]);
        return jsonResponse([]);
      },
    );

    render(<EventTimeline clientId="client-1" contacts={contacts} />);
    await screen.findByRole("heading", { name: "Nenhum evento registrado" });

    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );
    fireEvent.change(screen.getByLabelText("Detalhes"), {
      target: { value: "Anotação preservada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    const title = screen.getByRole("textbox", { name: /Título/ });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe um título (até 200 caracteres).",
    );
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title.closest(".form-field")).toHaveClass("has-error");
    expect(screen.getByLabelText("Detalhes")).toHaveValue(
      "Anotação preservada",
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url) === "/api/events" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("valida a data do evento no cliente", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).startsWith("/api/opportunities")
        ? jsonResponse([])
        : jsonResponse([]),
    );

    render(<EventTimeline clientId="client-1" contacts={contacts} />);
    await screen.findByRole("heading", { name: "Nenhum evento registrado" });
    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Título/ }), {
      target: { value: "Reunião" },
    });
    fireEvent.change(screen.getByLabelText(/Data/), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    expect(screen.getByText("Informe uma data válida.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Data/), {
      target: {
        value: getBrazilDateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    expect(
      screen.getByText("A data do evento não pode ser futura."),
    ).toBeInTheDocument();
  });

  it("mostra o erro da API e preserva os campos", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("/api/opportunities"))
        return jsonResponse([]);
      if (String(input) === "/api/events" && init?.method === "POST")
        return jsonResponse({ error: "Falha ao registrar." }, false);
      return jsonResponse([]);
    });

    render(<EventTimeline clientId="client-1" contacts={contacts} />);
    await screen.findByRole("heading", { name: "Nenhum evento registrado" });
    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );
    const title = screen.getByRole("textbox", { name: /Título/ });
    fireEvent.change(title, { target: { value: "Conversa" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    expect(await screen.findByText("Falha ao registrar.")).toBeInTheDocument();
    expect(title).toHaveValue("Conversa");
  });

  it("consulta e registra eventos vinculados a uma oportunidade", async () => {
    let posted: Record<string, unknown> | null = null;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/events?opportunity_id=opp-1") return jsonResponse([]);
        if (url === "/api/events" && init?.method === "POST") {
          posted = JSON.parse(init.body as string);
          return jsonResponse({ id: "event-new" });
        }
        return jsonResponse([]);
      });

    render(
      <EventTimeline
        clientId="client-1"
        opportunityId="opp-1"
        lockOpportunity
        contacts={contacts}
      />,
    );

    await screen.findByRole("heading", { name: "Nenhum evento registrado" });
    expect(fetchMock).toHaveBeenCalledWith("/api/events?opportunity_id=opp-1");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/opportunities"),
      ),
    ).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "＋ Registrar evento" }),
    );
    expect(screen.queryByLabelText("Oportunidade")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /Título/ }), {
      target: { value: "Reunião de acompanhamento" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      client_id: "client-1",
      opportunity_id: "opp-1",
    });
  });
});
