import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import ContactForm from "./contact-form";
import { formatPhone } from "@/lib/phone";

const assign = vi.fn();

const clients = [
  { id: "client-1", company_name: "Aurora Tecnologia", is_active: true },
  { id: "client-2", company_name: "Empresa Inativa", is_active: false },
];

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function mockFetch(
  handler?: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (handler) return handler(url, init);
    if (url === "/api/clients") return jsonResponse(clients);
    return jsonResponse({ id: "contact-1" }, true, 201);
  });
}

function submitButton() {
  return screen.getByRole("button", { name: /Cadastrar contato|Salvando/ });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
    target: { value: "Ana Souza" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Cliente/ }), {
    target: { value: "client-1" },
  });
}

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Novo contato", () => {
  it("renderiza os campos do contato e a navegação de retorno", async () => {
    const fetchMock = mockFetch();
    const { container } = render(<ContactForm />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Novo contato" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Dados do contato" })
        .parentElement,
    ).toHaveClass("form-section");

    const name = screen.getByRole("textbox", { name: /Nome completo/ });
    expect(name).toBeRequired();
    expect(name).toHaveAttribute("maxlength", "200");

    const client = screen.getByRole("combobox", { name: /Cliente/ });
    expect(client).toBeRequired();

    const notes = screen.getByRole("textbox", { name: /Observações/ });
    expect(notes.tagName).toBe("TEXTAREA");
    expect(notes).toHaveAttribute("maxlength", "5000");

    expect(
      screen.getByRole("checkbox", { name: "Contato principal" }),
    ).toHaveAttribute("value", "true");
    expect(screen.getByRole("button", { name: "Cadastrar contato" })).toHaveAttribute(
      "type",
      "submit",
    );

    expect(
      screen.getByRole("link", { name: /Voltar aos contatos/ }),
    ).toHaveAttribute("href", "/contatos");
    const breadcrumbs = screen.getByRole("navigation", {
      name: "Navegação estrutural",
    });
    expect(within(breadcrumbs).getByRole("link", { name: "Contatos" })).toHaveAttribute(
      "href",
      "/contatos",
    );
    expect(breadcrumbs).toHaveTextContent("Novo contato");

    // Estrutura esperada pelos seletores CSS do formulário.
    const form = container.querySelector("form.client-form")!;
    expect(form).not.toBeNull();
    expect(screen.getByRole("button")).toBe(form.querySelector(":scope > button.primary-button"));
    expect(notes.closest(".form-field")?.parentElement).toHaveClass("form-grid");
    expect(
      screen.getByRole("checkbox").closest(".contact-primary-checkbox"),
    ).not.toBeNull();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/clients"));
  });

  it("carrega no seletor apenas clientes ativos", async () => {
    mockFetch();
    render(<ContactForm />);

    const active = await screen.findByRole("option", {
      name: "Aurora Tecnologia",
    });
    expect(active).toHaveValue("client-1");
    expect(screen.queryByRole("option", { name: "Empresa Inativa" })).toBeNull();

    const placeholder = screen.getByRole("option", { name: "Selecione" });
    expect(placeholder).toHaveValue("");
    expect(placeholder).toBeDisabled();
  });

  it("avisa quando não consegue carregar os clientes", async () => {
    mockFetch(() => Promise.reject(new Error("offline")));
    render(<ContactForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os clientes.",
    );
  });

  it("envia os dados, mostra o estado de salvamento e navega após o sucesso", async () => {
    let resolveSubmit!: (response: Response) => void;
    const fetchMock = mockFetch((url) => {
      if (url === "/api/clients") return jsonResponse(clients);
      return new Promise<Response>((resolve) => {
        resolveSubmit = resolve;
      });
    });
    render(<ContactForm />);
    await screen.findByRole("option", { name: "Aurora Tecnologia" });

    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Cliente/ }), {
      target: { value: "client-1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), {
      target: { value: "Prefere contato por e-mail" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Contato principal" }));
    fireEvent.click(submitButton());

    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/contacts",
    )!;
    const init = postCall[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      full_name: "Ana Souza",
      client_id: "client-1",
      notes: "Prefere contato por e-mail",
      is_primary: "true",
    });

    resolveSubmit(jsonResponse({ id: "contact-1" }, true, 201));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/contatos"));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cadastrar contato" })).toBeEnabled();
  });

  it("mascara telefone e celular ao digitar e envia os valores mascarados", async () => {
    const fetchMock = mockFetch();
    render(<ContactForm />);
    await screen.findByRole("option", { name: "Aurora Tecnologia" });

    const phone = screen.getByRole("textbox", { name: "Telefone" });
    const mobile = screen.getByRole("textbox", { name: "Celular" });

    expect(phone).toHaveAttribute("placeholder", "(11) 91234-5678");
    expect(phone).not.toHaveAttribute("maxlength");
    expect(mobile).toHaveAttribute("placeholder", "(11) 91234-5678");
    expect(mobile).not.toHaveAttribute("maxlength");

    fireEvent.change(phone, { target: { value: "1133331000" } });
    fireEvent.change(mobile, { target: { value: "11912345678" } });
    expect(phone).toHaveValue("(11) 3333-1000");
    expect(mobile).toHaveValue("(11) 91234-5678");

    fillRequiredFields();
    fireEvent.click(submitButton());

    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/contacts",
    )!;
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toMatchObject(
      {
        phone: "(11) 3333-1000",
        mobile: "(11) 91234-5678",
      },
    );
  });

  it("permite digitar telefone e celular caractere a caractere", async () => {
    const fetchMock = mockFetch();
    render(<ContactForm />);
    await screen.findByRole("option", { name: "Aurora Tecnologia" });

    const phone = screen.getByRole("textbox", { name: "Telefone" });
    const mobile = screen.getByRole("textbox", { name: "Celular" });

    let phoneMasked = "";
    for (const character of "11912345678") {
      const typed = `${phoneMasked}${character}`;
      fireEvent.change(phone, { target: { value: typed } });
      phoneMasked = formatPhone(typed);
      expect(phone).toHaveValue(phoneMasked);
    }
    expect(phone).toHaveValue("(11) 91234-5678");

    let mobileMasked = "";
    for (const character of "+5511912345678") {
      const typed = `${mobileMasked}${character}`;
      fireEvent.change(mobile, { target: { value: typed } });
      mobileMasked = formatPhone(typed);
      expect(mobile).toHaveValue(mobileMasked);
    }
    expect(mobile).toHaveValue("+55 (11) 91234-5678");

    fillRequiredFields();
    fireEvent.click(submitButton());

    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/contacts",
    )!;
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toMatchObject(
      {
        phone: "(11) 91234-5678",
        mobile: "+55 (11) 91234-5678",
      },
    );
  });

  it("exibe a mensagem da API e permanece no formulário em caso de erro", async () => {
    mockFetch((url) =>
      url === "/api/clients"
        ? jsonResponse(clients)
        : jsonResponse({ error: "Cliente não encontrado ou inativo." }, false, 404),
    );
    render(<ContactForm />);
    await screen.findByRole("option", { name: "Aurora Tecnologia" });
    fillRequiredFields();

    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cliente não encontrado ou inativo.",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cadastrar contato" })).toBeEnabled();
  });

  it("usa uma mensagem padrão quando a API não informa o erro", async () => {
    mockFetch((url) =>
      url === "/api/clients"
        ? jsonResponse(clients)
        : jsonResponse({}, false, 500),
    );
    render(<ContactForm />);
    await screen.findByRole("option", { name: "Aurora Tecnologia" });
    fillRequiredFields();

    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível cadastrar o contato.",
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("Editar contato", () => {
  const loadedContact = {
    id: "contact-1",
    client_id: "client-1",
    company_name: "Aurora Tecnologia",
    full_name: "Pessoa Exemplo",
    job_title: "Analista",
    email: "pessoa@example.com",
    phone: "1133331000",
    mobile: "11912345678",
    birthday: "1990-02-03",
    linkedin_url: "https://www.linkedin.com/in/pessoa-exemplo",
    notes: "Prefere contato por e-mail",
    is_primary: true,
  };

  function mockEditFetch(
    contactOverrides: Record<string, unknown> = {},
    saveResponse: () => Response = () => jsonResponse({ id: "contact-1" }),
  ) {
    return mockFetch((url, init) => {
      if (url === "/api/clients") return jsonResponse(clients);
      if (init?.method === "PUT") return saveResponse();
      return jsonResponse({ ...loadedContact, ...contactOverrides });
    });
  }

  async function renderLoadedContact(
    contactOverrides: Record<string, unknown> = {},
  ) {
    mockEditFetch(contactOverrides);
    render(<ContactForm id="contact-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });
  }

  const saveButton = () => screen.getByRole("button", { name: "Salvar contato" });

  it("mostra o carregamento enquanto o contato está pendente", async () => {
    let resolveContact!: (response: Response) => void;
    mockFetch((url) =>
      url === "/api/clients"
        ? jsonResponse(clients)
        : new Promise<Response>((resolve) => {
            resolveContact = resolve;
          }),
    );

    render(<ContactForm id="contact-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando contato...");
    expect(
      screen.queryByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeNull();

    resolveContact(jsonResponse(loadedContact));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeInTheDocument();
  });

  it("renderiza o cabeçalho, o breadcrumb e as ações da edição", async () => {
    await renderLoadedContact();

    expect(screen.getByText("Atualize os dados do contato.")).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute("type", "submit");
    expect(
      screen.getByRole("link", { name: /Voltar aos contatos/ }),
    ).toHaveAttribute("href", "/contatos");

    const breadcrumbs = screen.getByRole("navigation", {
      name: "Navegação estrutural",
    });
    expect(
      within(breadcrumbs).getByRole("link", { name: "Contatos" }),
    ).toHaveAttribute("href", "/contatos");
    expect(breadcrumbs).toHaveTextContent("Editar contato");
    expect(
      within(breadcrumbs).queryByRole("link", { name: "Editar contato" }),
    ).toBeNull();
  });

  it("pré-preenche os campos com os dados do contato", async () => {
    await renderLoadedContact();

    expect(
      screen.getByRole("textbox", { name: /Nome completo/ }),
    ).toHaveValue("Pessoa Exemplo");
    expect(screen.getByRole("textbox", { name: "Cargo" })).toHaveValue(
      "Analista",
    );
    expect(screen.getByRole("textbox", { name: "E-mail" })).toHaveValue(
      "pessoa@example.com",
    );
    expect(screen.getByRole("textbox", { name: "Telefone" })).toHaveValue(
      "(11) 3333-1000",
    );
    expect(screen.getByRole("textbox", { name: "Celular" })).toHaveValue(
      "(11) 91234-5678",
    );
    expect(screen.getByLabelText(/Aniversário/)).toHaveValue("1990-02-03");
    expect(screen.getByRole("textbox", { name: "LinkedIn" })).toHaveValue(
      "https://www.linkedin.com/in/pessoa-exemplo",
    );
    expect(
      screen.getByRole("textbox", { name: /Observações/ }),
    ).toHaveValue("Prefere contato por e-mail");
    expect(
      screen.getByRole("checkbox", { name: "Contato principal" }),
    ).toBeChecked();
  });

  it("desabilita o cliente, não o exige e mostra um cliente inativo atual", async () => {
    await renderLoadedContact({
      client_id: "client-2",
      company_name: "Empresa Inativa",
    });

    const client = screen.getByRole("combobox", { name: /Cliente/ });
    expect(client).toBeDisabled();
    expect(client).not.toBeRequired();
    expect(client).toHaveValue("client-2");
    expect(
      screen.getByRole("option", { name: "Empresa Inativa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("O cliente não pode ser alterado.")).toBeInTheDocument();
  });

  it("exibe o cliente atual mesmo quando ele não está na lista de ativos", async () => {
    await renderLoadedContact({
      client_id: "client-9",
      company_name: "Empresa Externa",
    });

    const client = screen.getByRole("combobox", { name: /Cliente/ });
    expect(client).toHaveValue("client-9");
    expect(
      screen.getByRole("option", { name: "Empresa Externa" }),
    ).toBeInTheDocument();
  });

  it("volta para a importação quando recebe returnTo", async () => {
    mockEditFetch();
    render(<ContactForm id="contact-1" returnTo="/contatos/importar" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    expect(
      screen.getByRole("link", { name: /Voltar à importação/ }),
    ).toHaveAttribute("href", "/contatos/importar");
  });

  it("ignora returnTo externo e mantém o retorno seguro", async () => {
    mockEditFetch();
    render(<ContactForm id="contact-1" returnTo="https://example.com" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    expect(
      screen.getByRole("link", { name: /Voltar aos contatos/ }),
    ).toHaveAttribute("href", "/contatos");
  });

  it("navega para a importação após salvar quando returnTo é interno", async () => {
    mockEditFetch();
    render(<ContactForm id="contact-1" returnTo="/contatos/importar" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/contatos/importar"),
    );
  });

  it("envia PUT sem client_id e navega para a lista após o sucesso", async () => {
    const fetchMock = mockEditFetch();
    render(<ContactForm id="contact-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Pessoa Atualizada" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Cargo" }), {
      target: { value: "Coordenadora" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), {
      target: { value: "Atualizado no teste" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/contatos"));
    expect(assign).toHaveBeenCalledTimes(1);

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/contacts/contact-1" &&
        (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const init = putCall[1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      full_name: "Pessoa Atualizada",
      job_title: "Coordenadora",
      email: "pessoa@example.com",
      phone: "(11) 3333-1000",
      mobile: "(11) 91234-5678",
      birthday: "1990-02-03",
      linkedin_url: "https://www.linkedin.com/in/pessoa-exemplo",
      notes: "Atualizado no teste",
    });
    expect(body).not.toHaveProperty("client_id");
    expect(body.is_primary).toBe("true");
  });

  it("exibe a mensagem da API e permanece no formulário em caso de erro", async () => {
    mockEditFetch({}, () =>
      jsonResponse({ error: "Contato não encontrado." }, false, 404),
    );
    render(<ContactForm id="contact-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contato não encontrado.",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("usa uma mensagem padrão quando a API não informa o erro", async () => {
    mockEditFetch({}, () => jsonResponse({}, false, 500));
    render(<ContactForm id="contact-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar contato" });

    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar o contato.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("exibe a mensagem da API quando não consegue carregar o contato", async () => {
    mockFetch((url) =>
      url === "/api/clients"
        ? jsonResponse(clients)
        : jsonResponse({ error: "Contato não encontrado." }, false, 404),
    );

    render(<ContactForm id="contact-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contato não encontrado.",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar contato" }),
    ).toBeNull();
  });

  it("mantém o formulário carregado quando os clientes falham", async () => {
    mockFetch((url) =>
      url === "/api/clients"
        ? jsonResponse({ error: "Falha interna." }, false, 500)
        : jsonResponse(loadedContact),
    );

    render(<ContactForm id="contact-1" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os clientes.",
    );
    expect(
      screen.getByRole("textbox", { name: /Nome completo/ }),
    ).toHaveValue("Pessoa Exemplo");
    expect(saveButton()).toBeEnabled();
  });
});
