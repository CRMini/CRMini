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
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // Mock mínimo que expõe src/alt para os testes da prévia do logo.
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

import ClientForm from "./client-form";
import { formatCep, formatCnpj } from "@/lib/masks";
import { formatPhone } from "@/lib/phone";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function mockFetch(
  handler?: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      if (handler) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        return handler(url, init);
      }
      return jsonResponse({ id: "client-1" }, true, 201);
    });
}

function savedClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    company_name: "Aurora Tecnologia",
    website: "example.com",
    contacts: [{ id: "contact-1", full_name: "Ana Souza", is_primary: true }],
    ...overrides,
  };
}

function siteField() {
  return screen.getByRole("textbox", { name: "Site" });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClientForm — campo Site", () => {
  it.each(["example.com", "https://example.com", "http://example.com"])(
    "mantém %s como texto válido, sem validação de URL do navegador",
    (website) => {
      render(<ClientForm />);
      const site = siteField();

      fireEvent.change(site, { target: { value: website } });

      expect(site).toHaveValue(website);
      expect(site).toBeValid();
      expect(site).not.toHaveAttribute("type", "url");
    },
  );

  it("envia o site sem protocolo ao salvar um novo cliente", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.website).toBe("example.com");
  });

  it("carrega site sem protocolo na edição e preserva o valor no PUT", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(savedClient()),
    );
    render(<ClientForm id="client-1" />);

    await waitFor(() => expect(siteField()).toHaveValue("example.com"));
    expect(siteField()).toBeValid();
    expect(siteField()).not.toHaveAttribute("type", "url");

    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.website).toBe("example.com");
  });

  it("salva o cliente sem exigir contato", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.company_name).toBe("Aurora Tecnologia");
    expect(body.contacts).toEqual([]);
  });

  it("não marca o nome do contato como obrigatório", () => {
    render(<ClientForm />);

    expect(
      screen.getByRole("textbox", { name: "Nome completo" }),
    ).not.toBeRequired();
    expect(
      screen.queryByRole("textbox", { name: /Nome completo \*/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Opcional: adicione pessoas de contato/),
    ).toBeInTheDocument();
  });

  it("aceita site vazio como campo opcional e o envia ao salvar", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const site = siteField();

    expect(site).toHaveValue("");
    expect(site).toBeValid();
    expect(site).not.toBeRequired();
    expect(site).not.toHaveAttribute("type", "url");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.website).toBe("");
  });
});

describe("ClientForm — máscara de telefone", () => {
  it("mascara o telefone geral ao digitar e envia o valor mascarado", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const phone = screen.getByRole("textbox", { name: "Telefone geral" });

    expect(phone).toHaveAttribute("placeholder", "(11) 91234-5678");
    expect(phone).not.toHaveAttribute("maxlength");

    fireEvent.change(phone, { target: { value: "11912345678" } });
    expect(phone).toHaveValue("(11) 91234-5678");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.phone).toBe("(11) 91234-5678");
  });

  it("mascara telefone e celular do contato e envia os valores mascarados", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const contactPhone = screen.getByRole("textbox", { name: "Telefone" });
    const contactMobile = screen.getByRole("textbox", { name: "Celular" });

    expect(contactPhone).toHaveAttribute("placeholder", "(11) 91234-5678");
    expect(contactPhone).not.toHaveAttribute("maxlength");
    expect(contactMobile).toHaveAttribute("placeholder", "(11) 91234-5678");
    expect(contactMobile).not.toHaveAttribute("maxlength");

    fireEvent.change(contactPhone, { target: { value: "1133331000" } });
    fireEvent.change(contactMobile, { target: { value: "11912345678" } });
    expect(contactPhone).toHaveValue("(11) 3333-1000");
    expect(contactMobile).toHaveValue("(11) 91234-5678");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.contacts[0]).toMatchObject({
      phone: "(11) 3333-1000",
      mobile: "(11) 91234-5678",
    });
  });

  it("carrega telefones mascarados na edição e preserva os valores no PUT", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              phone: "+55 11 3333-1000",
              contacts: [
                {
                  id: "contact-1",
                  full_name: "Ana Souza",
                  phone: "+55 11 3333-1000",
                  mobile: "11912345678",
                  is_primary: true,
                },
              ],
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    const phone = screen.getByRole("textbox", { name: "Telefone geral" });
    const contactPhone = screen.getByRole("textbox", { name: "Telefone" });
    const contactMobile = screen.getByRole("textbox", { name: "Celular" });

    await waitFor(() => expect(phone).toHaveValue("+55 (11) 3333-1000"));
    expect(contactPhone).toHaveValue("+55 (11) 3333-1000");
    expect(contactMobile).toHaveValue("(11) 91234-5678");

    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.phone).toBe("+55 (11) 3333-1000");
    expect(body.contacts[0]).toMatchObject({
      phone: "+55 (11) 3333-1000",
      mobile: "(11) 91234-5678",
    });
  });

  it("permite digitar o telefone geral caractere a caractere", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const phone = screen.getByRole("textbox", { name: "Telefone geral" });

    let masked = "";
    for (const character of "11912345678") {
      const typed = `${masked}${character}`;
      fireEvent.change(phone, { target: { value: typed } });
      masked = formatPhone(typed);
      expect(phone).toHaveValue(masked);
    }
    expect(phone).toHaveValue("(11) 91234-5678");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.phone).toBe("(11) 91234-5678");
  });

  it("permite digitar o prefixo +55 caractere a caractere", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const contactPhone = screen.getByRole("textbox", { name: "Telefone" });

    let masked = "";
    for (const character of "+5511912345678") {
      const typed = `${masked}${character}`;
      fireEvent.change(contactPhone, { target: { value: typed } });
      masked = formatPhone(typed);
      expect(contactPhone).toHaveValue(masked);
    }
    expect(contactPhone).toHaveValue("+55 (11) 91234-5678");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.contacts[0].phone).toBe("+55 (11) 91234-5678");
  });

  it("mantém o contato persistido quando a remoção é cancelada", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              contacts: [
                { id: "contact-1", full_name: "Ana Souza", is_primary: true },
                { id: "contact-2", full_name: "Bruno Lima", is_primary: false },
              ],
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Ana Souza")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      "Desativar este contato? O histórico será preservado.",
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Ana Souza")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bruno Lima")).toBeInTheDocument();
  });

  it("remove o contato persistido após confirmação sem enviar is_active", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              contacts: [
                { id: "contact-1", full_name: "Ana Souza", is_primary: true },
                { id: "contact-2", full_name: "Bruno Lima", is_primary: false },
              ],
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Ana Souza")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(screen.queryByDisplayValue("Ana Souza")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Bruno Lima")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0]).toMatchObject({
      id: "contact-2",
      full_name: "Bruno Lima",
    });
    expect(body.contacts[0]).not.toHaveProperty("is_active");
  });

  it("remove contato novo sem confirmação", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch();
    render(<ClientForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "＋ Adicionar contato" }),
    );
    expect(screen.getAllByRole("button", { name: "Remover" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[1]);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("button", { name: "Remover" })).toHaveLength(
      0,
    );
  });

  it("preserva telefones legados não editados ao salvar outro campo", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              phone: "3333-1000",
              contacts: [
                {
                  id: "contact-1",
                  full_name: "Ana Souza",
                  phone: "+1 (555) 123-4567 ramal 9",
                  mobile: "0800 123 4567",
                  is_primary: true,
                },
              ],
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    const phone = screen.getByRole("textbox", { name: "Telefone geral" });
    const contactPhone = screen.getByRole("textbox", { name: "Telefone" });
    const contactMobile = screen.getByRole("textbox", { name: "Celular" });

    await waitFor(() => expect(phone).toHaveValue("3333-1000"));
    expect(contactPhone).toHaveValue("+1 (555) 123-4567 ramal 9");
    expect(contactMobile).toHaveValue("0800 123 4567");

    fireEvent.change(siteField(), { target: { value: "example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.phone).toBe("3333-1000");
    expect(body.contacts[0]).toMatchObject({
      phone: "+1 (555) 123-4567 ramal 9",
      mobile: "0800 123 4567",
    });
  });
});

describe("ClientForm — autocomplete de CEP", () => {
  function field(label: string) {
    return screen.getByRole("textbox", { name: label });
  }

  it("consulta o CEP ao sair do campo e preenche o endereço", async () => {
    const fetchMock = mockFetch((url) =>
      url.startsWith("/api/cep")
        ? jsonResponse({
            postal_code: "01310-100",
            street: "Avenida Paulista",
            city: "São Paulo",
            state: "SP",
          })
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);

    fireEvent.change(field("País"), { target: { value: "" } });
    fireEvent.change(field("Número"), { target: { value: "1000" } });
    fireEvent.change(field("Complemento"), { target: { value: "Apto 5" } });
    const postalCode = field("CEP");
    fireEvent.change(postalCode, { target: { value: "01310100" } });

    expect(postalCode).toHaveValue("01310-100");
    fireEvent.blur(postalCode);

    await waitFor(() =>
      expect(field("Logradouro")).toHaveValue("Avenida Paulista"),
    );
    expect(field("Cidade")).toHaveValue("São Paulo");
    expect(field("Estado")).toHaveValue("SP");
    expect(field("País")).toHaveValue("Brasil");
    expect(field("Número")).toHaveValue("1000");
    expect(field("Complemento")).toHaveValue("Apto 5");
    expect(fetchMock).toHaveBeenCalledWith("/api/cep?cep=01310100");
    expect(postalCode).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sinaliza CEP inválido e não altera os demais campos do endereço", () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    fireEvent.change(field("Logradouro"), {
      target: { value: "Rua Existente" },
    });
    fireEvent.change(field("Cidade"), { target: { value: "Campinas" } });
    fireEvent.change(field("Estado"), { target: { value: "SP" } });
    fireEvent.change(field("Número"), { target: { value: "42" } });

    const postalCode = field("CEP");
    fireEvent.change(postalCode, { target: { value: "123" } });
    fireEvent.blur(postalCode);

    expect(
      screen.getByText("CEP inválido. Informe os 8 dígitos."),
    ).toHaveAttribute("role", "alert");
    expect(postalCode).toHaveAttribute("aria-invalid", "true");
    expect(postalCode.closest(".form-field")).toHaveClass("has-error");
    expect(postalCode).toHaveAccessibleDescription(
      "CEP inválido. Informe os 8 dígitos.",
    );
    expect(field("Logradouro")).toHaveValue("Rua Existente");
    expect(field("Cidade")).toHaveValue("Campinas");
    expect(field("Estado")).toHaveValue("SP");
    expect(field("Número")).toHaveValue("42");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mostra o erro devolvido pela consulta e preserva o endereço", async () => {
    mockFetch((url) =>
      url.startsWith("/api/cep")
        ? jsonResponse(
            { error: "CEP não encontrado. Confira o número informado." },
            false,
            404,
          )
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);

    fireEvent.change(field("Logradouro"), {
      target: { value: "Rua Existente" },
    });
    fireEvent.change(field("Cidade"), { target: { value: "Campinas" } });

    const postalCode = field("CEP");
    fireEvent.change(postalCode, { target: { value: "99999999" } });
    fireEvent.blur(postalCode);

    await waitFor(() =>
      expect(
        screen.getByText("CEP não encontrado. Confira o número informado."),
      ).toBeInTheDocument(),
    );
    expect(postalCode.closest(".form-field")).toHaveClass("has-error");
    expect(field("Logradouro")).toHaveValue("Rua Existente");
    expect(field("Cidade")).toHaveValue("Campinas");
  });

  it("informa falha de conexão e preserva o endereço", async () => {
    mockFetch(() => Promise.reject(new Error("offline")));
    render(<ClientForm />);

    fireEvent.change(field("Estado"), { target: { value: "SP" } });
    const postalCode = field("CEP");
    fireEvent.change(postalCode, { target: { value: "01310100" } });
    fireEvent.blur(postalCode);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Não foi possível consultar o CEP. Verifique sua conexão e tente novamente.",
        ),
      ).toBeInTheDocument(),
    );
    expect(postalCode.closest(".form-field")).toHaveClass("has-error");
    expect(field("Estado")).toHaveValue("SP");
  });

  it("não consulta nem sinaliza erro quando o CEP está vazio", () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    fireEvent.blur(field("CEP"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field("CEP").closest(".form-field")).not.toHaveClass("has-error");
  });
});

describe("ClientForm — máscaras de CNPJ e CEP", () => {
  it("mascara CNPJ e CEP ao digitar e envia os valores mascarados", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    const taxId = screen.getByRole("textbox", { name: "CNPJ" });
    const postalCode = screen.getByRole("textbox", { name: "CEP" });

    expect(taxId).toHaveAttribute("placeholder", "00.000.000/0000-00");
    expect(postalCode).toHaveAttribute("placeholder", "00000-000");

    let maskedTaxId = "";
    for (const character of "12345678000199") {
      const typed = `${maskedTaxId}${character}`;
      fireEvent.change(taxId, { target: { value: typed } });
      maskedTaxId = formatCnpj(typed);
      expect(taxId).toHaveValue(maskedTaxId);
    }
    expect(taxId).toHaveValue("12.345.678/0001-99");

    let maskedPostalCode = "";
    for (const character of "01310100") {
      const typed = `${maskedPostalCode}${character}`;
      fireEvent.change(postalCode, { target: { value: typed } });
      maskedPostalCode = formatCep(typed);
      expect(postalCode).toHaveValue(maskedPostalCode);
    }
    expect(postalCode).toHaveValue("01310-100");

    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.tax_id).toBe("12.345.678/0001-99");
    expect(body.postal_code).toBe("01310-100");
  });

  it("carrega CNPJ e CEP sem máscara na edição, exibe mascarados e preserva no PUT", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              tax_id: "12345678000199",
              postal_code: "01310100",
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    const taxId = screen.getByRole("textbox", { name: "CNPJ" });
    const postalCode = screen.getByRole("textbox", { name: "CEP" });

    await waitFor(() => expect(taxId).toHaveValue("12.345.678/0001-99"));
    expect(postalCode).toHaveValue("01310-100");

    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.tax_id).toBe("12.345.678/0001-99");
    expect(body.postal_code).toBe("01310-100");
  });

  it("preserva CNPJ e CEP legados não editados ao salvar outro campo", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              tax_id: "CNPJ pendente",
              postal_code: "01310",
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    const taxId = screen.getByRole("textbox", { name: "CNPJ" });
    const postalCode = screen.getByRole("textbox", { name: "CEP" });

    await waitFor(() => expect(taxId).toHaveValue("CNPJ pendente"));
    expect(postalCode).toHaveValue("01310");

    fireEvent.change(siteField(), { target: { value: "example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.tax_id).toBe("CNPJ pendente");
    expect(body.postal_code).toBe("01310");
  });

  it("preserva CNPJ e CEP legados com texto descritivo no PUT", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(
            savedClient({
              tax_id: "CNPJ: 12345678000199",
              postal_code: "CEP: 01310-100",
            }),
          ),
    );
    render(<ClientForm id="client-1" />);

    const taxId = screen.getByRole("textbox", { name: "CNPJ" });
    const postalCode = screen.getByRole("textbox", { name: "CEP" });

    await waitFor(() => expect(taxId).toHaveValue("CNPJ: 12345678000199"));
    expect(postalCode).toHaveValue("CEP: 01310-100");

    fireEvent.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clients/client-1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(body.tax_id).toBe("CNPJ: 12345678000199");
    expect(body.postal_code).toBe("CEP: 01310-100");
  });
});

describe("ClientForm — buscar logo do site", () => {
  function logoPreview() {
    return screen.queryByRole("img", { name: "Prévia do logo" });
  }

  function searchButton() {
    return screen.getByRole("button", { name: "Buscar logo do site" });
  }

  it("mantém 'Buscar logo do site' desabilitado sem site preenchido", () => {
    mockFetch();
    render(<ClientForm />);

    expect(searchButton()).toBeDisabled();

    fireEvent.change(siteField(), { target: { value: "   " } });
    expect(searchButton()).toBeDisabled();

    fireEvent.change(siteField(), { target: { value: "example.com" } });
    expect(searchButton()).toBeEnabled();
  });

  it("mostra 'Buscando...' e envia o site em JSON", async () => {
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = mockFetch((url) =>
      url === "/api/logo/from-site"
        ? pending
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Buscando..." }),
      ).toBeDisabled(),
    );

    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/logo/from-site",
    )!;
    expect(call[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      website: "example.com",
    });

    release(jsonResponse({ logo_path: "/api/logo/do-site.png" }));

    await waitFor(() => expect(searchButton()).toBeEnabled());
  });

  it("atualiza a prévia do logo quando a busca retorna sucesso", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? jsonResponse({ logo_path: "/api/logo/do-site.png" })
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });
    expect(logoPreview()).not.toBeInTheDocument();

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(logoPreview()).toHaveAttribute("src", "/api/logo/do-site.png"),
    );
    expect(
      screen.getByRole("button", { name: "Remover logo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField().closest(".form-field")).not.toHaveClass("has-error");
  });

  it("mostra o erro da API no campo Site sem marcar os demais campos", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? jsonResponse({ error: "Nenhum logo encontrado no site." }, false, 404)
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
      target: { value: "Ana Souza" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nenhum logo encontrado no site.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(siteField()).toHaveAttribute("aria-invalid", "true");
    expect(siteField()).toHaveAccessibleDescription(
      "Nenhum logo encontrado no site.",
    );
    expect(siteField().closest(".form-field")).toHaveClass("has-error");
    expect(
      screen
        .getByRole("textbox", { name: /Razão social/ })
        .closest(".form-field"),
    ).not.toHaveClass("has-error");
    expect(
      screen
        .getByRole("textbox", { name: /Nome completo/ })
        .closest(".form-field"),
    ).not.toHaveClass("has-error");
    expect(
      screen
        .getByRole("textbox", { name: "Telefone geral" })
        .closest(".form-field"),
    ).not.toHaveClass("has-error");
    expect(logoPreview()).not.toBeInTheDocument();
  });

  it("mostra falha 5xx sem detalhes no erro geral do formulário", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? jsonResponse({}, false, 500)
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    const message = await screen.findByText(
      "Não foi possível buscar o logo do site.",
    );
    expect(message).toHaveClass("form-error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("mostra a mensagem da API em falha 5xx no erro geral, não no campo Site", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? jsonResponse(
            {
              error:
                "Não foi possível salvar a imagem. Verifique se a pasta do banco está disponível e gravável.",
            },
            false,
            500,
          )
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /Razão social/ }), {
      target: { value: "Aurora Tecnologia" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    const message = await screen.findByText(
      "Não foi possível salvar a imagem. Verifique se a pasta do banco está disponível e gravável.",
    );
    expect(message).toHaveClass("form-error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField()).not.toHaveAttribute("aria-invalid");
    expect(siteField().closest(".form-field")).not.toHaveClass("has-error");
    expect(
      screen
        .getByRole("textbox", { name: /Razão social/ })
        .closest(".form-field"),
    ).not.toHaveClass("has-error");
    expect(logoPreview()).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("ignora a resposta atrasada da busca anterior sem sobrescrever a nova", async () => {
    const pending: Array<(response: Response) => void> = [];
    mockFetch((url) => {
      if (url !== "/api/logo/from-site")
        return jsonResponse({ id: "client-1" }, true, 201);
      return new Promise<Response>((resolve) => pending.push(resolve));
    });
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    const button = searchButton();
    // Duas buscas disparadas antes do re-render que desabilita o botão: a
    // segunda incrementa o contador de requisições e vira a busca "atual".
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1](jsonResponse({ logo_path: "/api/logo/segunda.png" }));
    });
    await waitFor(() =>
      expect(logoPreview()).toHaveAttribute("src", "/api/logo/segunda.png"),
    );

    // A primeira busca resolve depois: a resposta precisa ser descartada.
    await act(async () => {
      pending[0](jsonResponse({ logo_path: "/api/logo/primeira.png" }));
    });

    expect(logoPreview()).toHaveAttribute("src", "/api/logo/segunda.png");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField()).not.toHaveAttribute("aria-invalid");
    expect(searchButton()).toBeEnabled();
  });

  it("usa mensagem genérica quando a conexão falha", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? Promise.reject(new TypeError("failed to fetch"))
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível buscar o logo do site.",
      ),
    );
    expect(searchButton()).toBeEnabled();
  });

  it("pede confirmação antes de substituir o logo e não busca quando cancelado", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ id: "client-1" })
        : jsonResponse(savedClient({ logo_path: "/api/logo/atual.png" })),
    );
    render(<ClientForm id="client-1" />);

    await waitFor(() =>
      expect(logoPreview()).toHaveAttribute("src", "/api/logo/atual.png"),
    );

    fireEvent.click(searchButton());

    expect(confirmSpy).toHaveBeenCalledWith("Substituir o logo atual?");
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/logo/from-site"),
    ).toBe(false);
    expect(logoPreview()).toHaveAttribute("src", "/api/logo/atual.png");
    expect(searchButton()).toBeEnabled();
  });

  it("busca o novo logo quando a substituição é confirmada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch((url, init) => {
      if (init?.method === "PUT") return jsonResponse({ id: "client-1" });
      if (url === "/api/logo/from-site")
        return jsonResponse({ logo_path: "/api/logo/novo.png" });
      return jsonResponse(savedClient({ logo_path: "/api/logo/atual.png" }));
    });
    render(<ClientForm id="client-1" />);

    await waitFor(() =>
      expect(logoPreview()).toHaveAttribute("src", "/api/logo/atual.png"),
    );

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(logoPreview()).toHaveAttribute("src", "/api/logo/novo.png"),
    );
  });

  it("limpa o erro do Site ao editar o campo", async () => {
    mockFetch((url) =>
      url === "/api/logo/from-site"
        ? jsonResponse({ error: "Nenhum logo encontrado no site." }, false, 404)
        : jsonResponse({ id: "client-1" }, true, 201),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });
    fireEvent.click(searchButton());
    await screen.findByRole("alert");

    fireEvent.change(siteField(), { target: { value: "example.org" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField()).not.toHaveAttribute("aria-invalid");
    expect(siteField().closest(".form-field")).not.toHaveClass("has-error");
    expect(siteField()).toHaveValue("example.org");
  });
});

describe("ClientForm — buscar dados do site", () => {
  const profileUrl = "/api/company/from-site";

  function searchButton() {
    return screen.getByRole("button", { name: "Buscar dados do site" });
  }

  function panel() {
    return screen.getByRole("region", { name: "Dados encontrados no site" });
  }

  function profileCheckbox(label: string) {
    return within(panel()).getByRole("checkbox", { name: new RegExp(label) });
  }

  function fieldResult(
    value: string,
    source:
      "json-ld" | "opengraph" | "microdata" | "links" | "text" = "json-ld",
  ) {
    return { value, source, confidence: "high" as const };
  }

  function profileResponse(fields: Record<string, unknown>) {
    return { source_url: "https://example.com/", fields, missing: [] };
  }

  function companyField() {
    return screen.getByRole("textbox", { name: /Razão social/ });
  }

  function mockProfile(
    handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  ) {
    return mockFetch((url, init) =>
      url === profileUrl ? handler(url, init) : jsonResponse(savedClient()),
    );
  }

  const siteHint = "Endereço usado para buscar o logo e os dados cadastrais.";

  function companySection() {
    return screen
      .getByRole("heading", { name: "Dados da empresa" })
      .closest("section")!;
  }

  it("descreve o gatilho 'Buscar dados do site' com os campos que serão preenchidos", () => {
    render(<ClientForm />);

    expect(searchButton()).toHaveAccessibleDescription(
      "Preenche nome, CNPJ, telefone, e-mail e endereço",
    );
    expect(
      screen.getByText("Preenche nome, CNPJ, telefone, e-mail e endereço"),
    ).toBeVisible();
  });

  it("associa a dica do campo Site ao input enquanto não há erro", () => {
    render(<ClientForm />);

    expect(screen.getByText(siteHint)).toBeVisible();
    expect(siteField()).toHaveAccessibleDescription(siteHint);
    expect(siteField()).toHaveAttribute(
      "aria-describedby",
      screen.getByText(siteHint).id,
    );
  });

  it("troca a descrição do campo Site para o erro e mantém a dica visível", async () => {
    render(<ClientForm />);

    fireEvent.click(searchButton());

    await waitFor(() => expect(siteField()).toHaveFocus());
    const site = siteField();
    expect(site).toHaveAttribute("aria-invalid", "true");
    expect(site).toHaveAccessibleDescription("Informe o site da empresa.");
    expect(site).toHaveAttribute(
      "aria-describedby",
      screen.getByRole("alert").id,
    );
    expect(screen.getByText(siteHint)).toBeVisible();
  });

  it("mantém o gatilho na seção 'Dados da empresa' e busca o perfil a partir dela", async () => {
    const fetchMock = mockProfile(() =>
      jsonResponse(profileResponse({ city: fieldResult("São Paulo") })),
    );
    render(<ClientForm />);

    expect(
      within(companySection()).getByRole("button", {
        name: "Buscar dados do site",
      }),
    ).toBe(searchButton());

    fireEvent.change(siteField(), { target: { value: "example.com" } });
    fireEvent.click(
      within(companySection()).getByRole("button", {
        name: "Buscar dados do site",
      }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        profileUrl,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      within(
        await screen.findByRole("region", {
          name: "Dados encontrados no site",
        }),
      ).getByRole("checkbox", { name: /Cidade/ }),
    ).toBeChecked();
  });

  it("mantém 'Buscar dados do site' habilitado sem site, com espaços e com site preenchido", () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    expect(searchButton()).toBeEnabled();
    expect(searchButton()).toHaveTextContent("Buscar dados do site");

    fireEvent.change(siteField(), { target: { value: "   " } });
    expect(searchButton()).toBeEnabled();

    fireEvent.change(siteField(), { target: { value: "example.com" } });
    expect(searchButton()).toBeEnabled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sinaliza, foca o campo Site e não busca quando o site está vazio", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);

    fireEvent.click(searchButton());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(siteField().closest(".form-field")).toHaveClass("has-error");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe o site da empresa.",
    );
    expect(siteField()).toHaveAttribute("aria-invalid", "true");
    expect(siteField()).toHaveAccessibleDescription(
      "Informe o site da empresa.",
    );
    await waitFor(() => expect(siteField()).toHaveFocus());
    expect(searchButton()).toBeEnabled();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("sinaliza, foca o campo Site e não busca quando o site tem apenas espaços", async () => {
    const fetchMock = mockFetch();
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "   " } });

    fireEvent.click(searchButton());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(siteField().closest(".form-field")).toHaveClass("has-error");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe o site da empresa.",
    );
    expect(siteField()).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(siteField()).toHaveFocus());
    expect(searchButton()).toBeEnabled();
  });

  it("limpa o erro ao digitar o site e volta a buscar no novo clique", async () => {
    const fetchMock = mockProfile(() =>
      jsonResponse(profileResponse({ city: fieldResult("São Paulo") })),
    );
    render(<ClientForm />);

    fireEvent.click(searchButton());
    await waitFor(() => expect(siteField()).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe o site da empresa.",
    );

    fireEvent.change(siteField(), { target: { value: "example.com" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField()).not.toHaveAttribute("aria-invalid");
    expect(siteField().closest(".form-field")).not.toHaveClass("has-error");
    expect(searchButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(searchButton());

    await screen.findByRole("region", { name: "Dados encontrados no site" });
    const call = fetchMock.mock.calls.find(([url]) => url === profileUrl)!;
    expect(call[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      website: "example.com",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra 'Buscando...' e desabilita o botão enquanto a busca está pendente", async () => {
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    mockProfile(() => pending);
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Buscando..." }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByRole("button", { name: "Buscar dados do site" }),
    ).not.toBeInTheDocument();

    release(jsonResponse(profileResponse({})));

    await waitFor(() => expect(searchButton()).toBeEnabled());
    expect(searchButton()).toHaveTextContent("Buscar dados do site");
  });

  it("envia POST /api/company/from-site com { website } em JSON", async () => {
    let release: (response: Response) => void = () => {};
    const fetchMock = mockProfile(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === profileUrl)).toBe(
        true,
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === profileUrl)!;
    expect(call[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      website: "example.com",
    });

    release(jsonResponse(profileResponse({})));
    await waitFor(() => expect(searchButton()).toBeEnabled());
  });

  it("renderiza o painel com valores, origens e um checkbox por campo", async () => {
    mockProfile(() =>
      jsonResponse(
        profileResponse({
          company_name: fieldResult("Aurora Tecnologia", "json-ld"),
          city: fieldResult("São Paulo", "text"),
        }),
      ),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    const region = await screen.findByRole("region", {
      name: "Dados encontrados no site",
    });
    expect(region).toHaveAttribute("aria-label", "Dados encontrados no site");
    expect(
      within(region).getByRole("heading", {
        level: 3,
        name: "Dados encontrados no site",
      }),
    ).toBeInTheDocument();
    expect(within(region).getByText("Aurora Tecnologia")).toBeInTheDocument();
    expect(within(region).getByText("São Paulo")).toBeInTheDocument();
    expect(within(region).getByText("JSON-LD")).toBeInTheDocument();
    expect(within(region).getByText("Texto do site")).toBeInTheDocument();
    expect(within(region).getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.queryByText("Dados do site aplicados."),
    ).not.toBeInTheDocument();
  });

  it("pré-seleciona apenas campos vazios: País e campos preenchidos ficam desmarcados", async () => {
    mockProfile(() =>
      jsonResponse(
        profileResponse({
          company_name: fieldResult("Aurora Tecnologia"),
          trade_name: fieldResult("Aurora"),
          city: fieldResult("São Paulo"),
          country: fieldResult("Brasil"),
        }),
      ),
    );
    render(<ClientForm />);
    fireEvent.change(companyField(), {
      target: { value: "Empresa Já Cadastrada" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await screen.findByRole("region", { name: "Dados encontrados no site" });
    expect(profileCheckbox("Razão social")).not.toBeChecked();
    expect(profileCheckbox("Nome fantasia")).toBeChecked();
    expect(profileCheckbox("Cidade")).toBeChecked();
    expect(profileCheckbox("País")).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "País" })).toHaveValue("Brasil");
    expect(companyField()).toHaveValue("Empresa Já Cadastrada");
  });

  it("não sobrescreve campo preenchido quando o checkbox fica desmarcado", async () => {
    mockProfile(() =>
      jsonResponse(
        profileResponse({
          company_name: fieldResult("Aurora Nova"),
          trade_name: fieldResult("Aurora Tech", "text"),
        }),
      ),
    );
    render(<ClientForm />);
    fireEvent.change(companyField(), {
      target: { value: "Aurora Antiga" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await screen.findByRole("region", { name: "Dados encontrados no site" });
    expect(profileCheckbox("Razão social")).not.toBeChecked();
    expect(profileCheckbox("Nome fantasia")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar dados" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(companyField()).toHaveValue("Aurora Antiga");
    expect(screen.getByRole("textbox", { name: "Nome fantasia" })).toHaveValue(
      "Aurora Tech",
    );
  });

  it("aplica somente os campos marcados e confirma o resultado", async () => {
    mockProfile(() =>
      jsonResponse(
        profileResponse({
          company_name: fieldResult("Aurora Nova"),
          trade_name: fieldResult("Aurora Tech", "text"),
        }),
      ),
    );
    render(<ClientForm />);
    fireEvent.change(companyField(), {
      target: { value: "Aurora Antiga" },
    });
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await screen.findByRole("region", { name: "Dados encontrados no site" });
    fireEvent.click(profileCheckbox("Razão social"));
    fireEvent.click(profileCheckbox("Nome fantasia"));
    expect(profileCheckbox("Razão social")).toBeChecked();
    expect(profileCheckbox("Nome fantasia")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar dados" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(companyField()).toHaveValue("Aurora Nova");
    expect(screen.getByRole("textbox", { name: "Nome fantasia" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Dados do site aplicados.",
    );
  });

  it("cancela sem alterar campos e permite reabrir o painel", async () => {
    mockProfile(() =>
      jsonResponse(profileResponse({ city: fieldResult("São Paulo") })),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());
    await screen.findByRole("region", { name: "Dados encontrados no site" });

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Cidade" })).toHaveValue("");
    expect(searchButton()).toBeEnabled();

    fireEvent.click(searchButton());
    expect(
      await screen.findByRole("region", {
        name: "Dados encontrados no site",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    [404, "Nenhum dado cadastral encontrado no site."],
    [400, "Site inválido. Informe um endereço público."],
  ])(
    "mostra o erro %i no campo Site sem marcar os demais campos",
    async (status, message) => {
      mockProfile(() => jsonResponse({ error: message }, false, status));
      render(<ClientForm />);
      fireEvent.change(companyField(), {
        target: { value: "Aurora Tecnologia" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: /Nome completo/ }), {
        target: { value: "Ana Souza" },
      });
      fireEvent.change(siteField(), { target: { value: "example.com" } });

      fireEvent.click(searchButton());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(siteField()).toHaveAttribute("aria-invalid", "true");
      expect(siteField()).toHaveAccessibleDescription(message);
      expect(siteField().closest(".form-field")).toHaveClass("has-error");
      expect(companyField().closest(".form-field")).not.toHaveClass(
        "has-error",
      );
      expect(
        screen
          .getByRole("textbox", { name: /Nome completo/ })
          .closest(".form-field"),
      ).not.toHaveClass("has-error");
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    },
  );

  it("mostra a falha 5xx no erro geral, sem erro no campo Site", async () => {
    mockProfile(() =>
      jsonResponse({ error: "Não foi possível analisar o site." }, false, 500),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    const message = await screen.findByText(
      "Não foi possível analisar o site.",
    );
    expect(message).toHaveClass("form-error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(siteField()).not.toHaveAttribute("aria-invalid");
    expect(siteField().closest(".form-field")).not.toHaveClass("has-error");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("sinaliza falha de rede no campo Site", async () => {
    mockProfile(() => Promise.reject(new TypeError("failed to fetch")));
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível buscar os dados do site.",
      ),
    );
    expect(siteField().closest(".form-field")).toHaveClass("has-error");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("mantém o resultado da última busca quando as respostas chegam fora de ordem", async () => {
    const pending: Array<(response: Response) => void> = [];
    mockProfile(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(resolve);
        }),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    const button = searchButton();
    // Duas buscas antes do re-render que desabilita o botão: a segunda vira a atual.
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1](
        jsonResponse(profileResponse({ city: fieldResult("Santos", "text") })),
      );
    });
    await waitFor(() =>
      expect(within(panel()).getByText("Santos")).toBeInTheDocument(),
    );

    await act(async () => {
      pending[0](
        jsonResponse(
          profileResponse({ city: fieldResult("Campinas", "text") }),
        ),
      );
    });

    expect(within(panel()).getByText("Santos")).toBeInTheDocument();
    expect(within(panel()).queryByText("Campinas")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("não dispara lookup de CEP ao aplicar o postal_code", async () => {
    const fetchMock = mockProfile(() =>
      jsonResponse(profileResponse({ postal_code: fieldResult("01310-100") })),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());
    await screen.findByRole("region", { name: "Dados encontrados no site" });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar dados" }));

    expect(screen.getByRole("textbox", { name: "CEP" })).toHaveValue(
      "01310-100",
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/cep")),
    ).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === profileUrl)).toBe(true);
  });

  it("não salva o cliente ao aplicar a prévia", async () => {
    const fetchMock = mockProfile(() =>
      jsonResponse(profileResponse({ company_name: fieldResult("Aurora") })),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());
    await screen.findByRole("region", { name: "Dados encontrados no site" });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar dados" }));

    const saveCalls = fetchMock.mock.calls.filter(([url, init]) => {
      const method = (init as RequestInit | undefined)?.method;
      return (
        String(url).startsWith("/api/clients") &&
        (method === "POST" || method === "PUT")
      );
    });
    expect(saveCalls).toHaveLength(0);
    expect(companyField()).toHaveValue("Aurora");
  });

  it("expõe nome acessível nos checkboxes e move o foco para o título", async () => {
    mockProfile(() =>
      jsonResponse(
        profileResponse({
          company_name: fieldResult("Aurora Tecnologia"),
          postal_code: fieldResult("01310-100"),
          country: fieldResult("Brasil"),
        }),
      ),
    );
    render(<ClientForm />);
    fireEvent.change(siteField(), { target: { value: "example.com" } });

    fireEvent.click(searchButton());

    await screen.findByRole("region", { name: "Dados encontrados no site" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: "Dados encontrados no site",
        }),
      ).toHaveFocus(),
    );
    expect(profileCheckbox("Razão social")).toBeInTheDocument();
    expect(profileCheckbox("CEP")).toBeInTheDocument();
    expect(profileCheckbox("País")).toBeInTheDocument();
    expect(within(panel()).getAllByRole("checkbox")).toHaveLength(3);
  });
});
