import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
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

import LeadForm from "./lead-form";

const references = {
  industries: [{ id: "industry-tecnologia", name: "Tecnologia" }],
  segments: [{ id: "segment-enterprise", name: "Enterprise" }],
  cities: [{ id: "city-sao-paulo", name: "São Paulo" }],
  countries: [
    { id: "country-brasil", name: "Brasil" },
    { id: "country-mexico", name: "México" },
  ],
  job_titles: [{ id: "job-title-gerente-de-ti", name: "Gerente de TI" }],
  lead_sources: [{ id: "lead-source-site", name: "Site" }],
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(
  postResponse: () => Response = () => jsonResponse({ id: "lead-1" }, 201),
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references") return jsonResponse(references);
      if (url === "/api/leads" && init?.method === "POST") return postResponse();
      throw new Error(`fetch inesperado: ${url}`);
    });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

describe("Formulário de lead", () => {
  it("renderiza as três seções e o cabeçalho", async () => {
    mockFetch();
    render(<LeadForm />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Novo lead" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Informações básicas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Qualificação comercial",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Comunicação" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /voltar para leads/i }),
    ).toHaveAttribute("href", "/leads");

    await screen.findByRole("option", { name: "São Paulo" });
  });

  it("carrega as opções das listas de referência", async () => {
    mockFetch();
    render(<LeadForm />);

    expect(
      await screen.findByRole("option", { name: "Tecnologia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Gerente de TI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Site" })).toBeInTheDocument();
  });

  it("mostra o endereço do contato só quando não é o da empresa", async () => {
    mockFetch();
    render(<LeadForm />);

    await screen.findByRole("option", { name: "São Paulo" });
    expect(
      screen.queryByLabelText("Endereço do contato"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText("Endereço do contato é o mesmo da empresa"),
    );

    expect(screen.getByLabelText("Endereço do contato")).toBeInTheDocument();
    expect(
      screen.getByLabelText("CEP do contato"),
    ).toBeInTheDocument();
  });

  it("envia o lead com o status implícito e redireciona para a lista", async () => {
    const fetchMock = mockFetch();
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    fireEvent.change(screen.getByLabelText("Razão social"), {
      target: { value: "Empresa Alfa Ltda." },
    });
    fireEvent.change(screen.getByLabelText("Nome fantasia"), {
      target: { value: "Alfa" },
    });

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/leads"));

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === "/api/leads" && init?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      company_name: "Empresa Alfa Ltda.",
      trade_name: "Alfa",
      contact_same_address: 1,
    });
    expect(body).not.toHaveProperty("status");
    expect(refresh).toHaveBeenCalled();
  });

  it("mantém o formulário e exibe o erro da API", async () => {
    mockFetch(() =>
      jsonResponse({ error: "CNPJ inválido. Informe os 14 dígitos." }, 400),
    );
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    fireEvent.change(screen.getByLabelText("Razão social"), {
      target: { value: "Empresa Alfa Ltda." },
    });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("CNPJ inválido. Informe os 14 dígitos.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Razão social")).toHaveValue(
      "Empresa Alfa Ltda.",
    );
  });

  it("mostra erro quando as opções não carregam", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "Não foi possível carregar as opções." }, 400),
    );
    render(<LeadForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as opções.",
    );
  });

  it("adiciona opção de referência e já a seleciona", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/leads/references" && !init?.method)
          return jsonResponse(references);
        if (url === "/api/leads/references" && init?.method === "POST")
          return jsonResponse({ id: "industry-nova", name: "Saúde" }, 201);
        throw new Error(`fetch inesperado: ${url}`);
      });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    const field = screen
      .getByLabelText("Setor de atuação")
      .closest(".form-field") as HTMLElement;
    fireEvent.click(
      within(field).getByRole("button", { name: /adicionar opção/i }),
    );
    fireEvent.change(
      within(field).getByLabelText("Nova opção para Setor de atuação"),
      { target: { value: "Saúde" } },
    );
    fireEvent.click(within(field).getByRole("button", { name: "Salvar opção" }));

    expect(
      await within(field).findByRole("option", { name: "Saúde" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Setor de atuação")).toHaveValue(
      "industry-nova",
    );

    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/leads/references" && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      type: "industries",
      name: "Saúde",
    });
  });

  it("usa a opção existente quando a nova já foi cadastrada", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url === "/api/leads/references" && init?.method === "POST")
        return jsonResponse({ error: "Essa opção já existe." }, 409);
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    const field = screen
      .getByLabelText("Setor de atuação")
      .closest(".form-field") as HTMLElement;
    fireEvent.click(
      within(field).getByRole("button", { name: /adicionar opção/i }),
    );
    fireEvent.change(
      within(field).getByLabelText("Nova opção para Setor de atuação"),
      { target: { value: "tecnologia" } },
    );
    fireEvent.click(within(field).getByRole("button", { name: "Salvar opção" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Setor de atuação")).toHaveValue(
        "industry-tecnologia",
      ),
    );
    expect(within(field).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aplica máscara no CNPJ e aponta erro ao sair do campo", async () => {
    mockFetch();
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    const cnpj = screen.getByLabelText("CNPJ");
    fireEvent.change(cnpj, { target: { value: "11222333000181" } });
    expect(cnpj).toHaveValue("11.222.333/0001-81");

    fireEvent.change(cnpj, { target: { value: "111" } });
    fireEvent.blur(cnpj);

    expect(
      within(cnpj.closest(".form-field") as HTMLElement).getByRole("alert"),
    ).toHaveTextContent("CNPJ inválido. Informe os 14 dígitos.");
  });

  it("não envia quando há erro de formato no campo", async () => {
    const fetchMock = mockFetch();
    render(<LeadForm />);
    await screen.findByRole("option", { name: "Tecnologia" });

    fireEvent.change(screen.getByLabelText("CNPJ"), {
      target: { value: "111" },
    });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    expect(push).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url) === "/api/leads" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("consulta o ViaCEP e preenche o endereço da empresa", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/leads/references" && !init?.method)
          return jsonResponse(references);
        if (url.startsWith("/api/cep?"))
          return jsonResponse({
            postal_code: "01310-100",
            street: "Avenida Paulista",
            city: "São Paulo",
            state: "SP",
          });
        throw new Error(`fetch inesperado: ${url}`);
      });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "São Paulo" });

    const cep = screen.getByLabelText("CEP");
    fireEvent.change(cep, { target: { value: "01310100" } });
    fireEvent.blur(cep);

    await waitFor(() =>
      expect(screen.getByLabelText("Endereço")).toHaveValue(
        "Avenida Paulista",
      ),
    );
    expect(screen.getByLabelText("Cidade")).toHaveValue("city-sao-paulo");
    expect(screen.getByLabelText("Estado")).toHaveValue("SP");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/cep?cep=01310100"),
      ),
    ).toBe(true);
  });

  it("não sobrescreve o endereço já digitado ao consultar o CEP", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url.startsWith("/api/cep?"))
        return jsonResponse({
          postal_code: "01310-100",
          street: "Avenida Paulista",
          city: "São Paulo",
          state: "SP",
        });
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "São Paulo" });

    fireEvent.change(screen.getByLabelText("Endereço"), {
      target: { value: "Rua Digitada Pelo Usuário" },
    });
    const cep = screen.getByLabelText("CEP");
    fireEvent.change(cep, { target: { value: "01310100" } });
    fireEvent.blur(cep);

    await waitFor(() =>
      expect(screen.getByLabelText("Cidade")).toHaveValue("city-sao-paulo"),
    );
    expect(screen.getByLabelText("Endereço")).toHaveValue(
      "Rua Digitada Pelo Usuário",
    );
  });

  it("cadastra cidade desconhecida devolvida pelo ViaCEP", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url === "/api/leads/references" && init?.method === "POST")
        return jsonResponse({ id: "city-campinas", name: "Campinas" }, 201);
      if (url.startsWith("/api/cep?"))
        return jsonResponse({
          postal_code: "13010-111",
          street: "Rua Barão de Jaguara",
          city: "Campinas",
          state: "SP",
        });
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "São Paulo" });

    const cep = screen.getByLabelText("CEP");
    fireEvent.change(cep, { target: { value: "13010111" } });
    fireEvent.blur(cep);

    expect(
      await screen.findByRole("option", { name: "Campinas" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cidade")).toHaveValue("city-campinas");
  });

  it("não consulta o ViaCEP quando o país não é o Brasil", async () => {
    const fetchMock = mockFetch();
    render(<LeadForm />);
    await screen.findByRole("option", { name: "México" });

    fireEvent.change(screen.getByLabelText("País"), {
      target: { value: "country-mexico" },
    });
    const cep = screen.getByLabelText("CEP");
    fireEvent.change(cep, { target: { value: "01310100" } });
    fireEvent.blur(cep);

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/cep?"),
      ),
    ).toBe(false);
  });

  it("mostra o erro do CEP não encontrado sem limpar o formulário", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url.startsWith("/api/cep?"))
        return jsonResponse(
          { error: "CEP não encontrado. Confira o número informado." },
          404,
        );
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "São Paulo" });

    fireEvent.change(screen.getByLabelText("Razão social"), {
      target: { value: "Empresa Alfa Ltda." },
    });
    const cep = screen.getByLabelText("CEP");
    fireEvent.change(cep, { target: { value: "99999999" } });
    fireEvent.blur(cep);

    expect(
      await within(cep.closest(".form-field") as HTMLElement).findByRole(
        "alert",
      ),
    ).toHaveTextContent("CEP não encontrado. Confira o número informado.");
    expect(screen.getByLabelText("Razão social")).toHaveValue(
      "Empresa Alfa Ltda.",
    );
  });

  it("consulta o ViaCEP do endereço do contato", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url.startsWith("/api/cep?"))
        return jsonResponse({
          postal_code: "09000-000",
          street: "Rua do Contato",
          city: "São Paulo",
          state: "SP",
        });
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm />);
    await screen.findByRole("option", { name: "São Paulo" });

    fireEvent.click(
      screen.getByLabelText("Endereço do contato é o mesmo da empresa"),
    );
    const contactCep = screen.getByLabelText("CEP do contato");
    fireEvent.change(contactCep, { target: { value: "09000000" } });
    fireEvent.blur(contactCep);

    await waitFor(() =>
      expect(screen.getByLabelText("Endereço do contato")).toHaveValue(
        "Rua do Contato",
      ),
    );
    expect(screen.getByLabelText("Cidade do contato")).toHaveValue(
      "city-sao-paulo",
    );
    expect(screen.getByLabelText("Estado do contato")).toHaveValue("SP");
    expect(screen.getByLabelText("País do contato")).toHaveValue(
      "country-brasil",
    );
  });
});

const storedLead = {
  id: "lead-1",
  company_name: "Empresa Carregada Ltda.",
  trade_name: "Carregada",
  tax_id: "11222333000181",
  industry_id: "industry-tecnologia",
  segment_id: "segment-enterprise",
  revenue_band: "Até R$ 10 milhões",
  employee_band: "1-50",
  street: "Rua Teste",
  street_number: "100",
  neighborhood: "Centro",
  city_id: "city-sao-paulo",
  state: "SP",
  postal_code: "01000-000",
  country_id: "country-brasil",
  lead_source_id: "lead-source-site",
  contact_same_address: 1,
  status: "Novo",
  disqualification_reason: null,
};

function mockEditFetch(putHandler: () => Response = () => jsonResponse(storedLead)) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url === "/api/leads/lead-1" && !init?.method)
        return jsonResponse(storedLead);
      if (url === "/api/leads/lead-1" && init?.method === "PUT")
        return putHandler();
      throw new Error(`fetch inesperado: ${url}`);
    });
}

describe("Edição de lead", () => {
  it("carrega o lead e preenche o formulário", async () => {
    mockEditFetch();
    render(<LeadForm leadId="lead-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando lead...");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Editar lead" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Razão social")).toHaveValue(
      "Empresa Carregada Ltda.",
    );
    expect(screen.getByLabelText("Cidade")).toHaveValue("city-sao-paulo");
  });

  it("oferece apenas as transições permitidas a partir do status atual", async () => {
    mockEditFetch();
    render(<LeadForm leadId="lead-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar lead" });

    const status = screen.getByLabelText("Status do lead");
    const options = within(status)
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual([
      "Novo",
      "Em contato",
      "Qualificando",
      "Reunião agendada",
      "Desqualificado",
    ]);
    expect(options).not.toContain("Qualificado");
  });

  it("envia PUT com o status atual ao salvar", async () => {
    const fetchMock = mockEditFetch();
    render(<LeadForm leadId="lead-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar lead" });

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/leads"));
    const put = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/leads/lead-1" && init?.method === "PUT",
    );
    const body = JSON.parse(String(put?.[1]?.body));
    expect(body).toMatchObject({ status: "Novo" });
  });

  it("pede o motivo ao escolher Desqualificado", async () => {
    mockEditFetch();
    render(<LeadForm leadId="lead-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar lead" });

    fireEvent.change(screen.getByLabelText("Status do lead"), {
      target: { value: "Desqualificado" },
    });

    const reason = screen.getByLabelText("Motivo da desqualificação");
    expect(reason).toBeRequired();
    expect(
      within(reason).getAllByRole("option").map((option) => option.textContent),
    ).toContain("Prazo");
  });

  it("mostra o erro quando o lead não carrega", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url === "/api/leads/lead-1" && !init?.method)
        return jsonResponse({ error: "Lead não encontrado." }, 404);
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(<LeadForm leadId="lead-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lead não encontrado.",
    );
  });
});

describe("Conversão do lead", () => {
  it("mostra a seção de conversão em Em contato e envia a oportunidade", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/leads/references" && !init?.method)
          return jsonResponse(references);
        if (url === "/api/leads/lead-1" && !init?.method)
          return jsonResponse({ ...storedLead, status: "Em contato" });
        if (url === "/api/leads/lead-1/convert" && init?.method === "POST")
          return jsonResponse(
            {
              client_id: "client-1",
              contact_id: "contact-1",
              opportunity_id: "opp-1",
            },
            201,
          );
        throw new Error(`fetch inesperado: ${url}`);
      });
    render(<LeadForm leadId="lead-1" />);

    expect(
      await screen.findByRole("heading", { name: "Criar oportunidade" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome da oportunidade"), {
      target: { value: "Oportunidade ERP" },
    });
    fireEvent.change(screen.getByLabelText("Valor (R$)"), {
      target: { value: "250000.00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar oportunidade" }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/oportunidades"),
    );

    const call = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/leads/lead-1/convert" && init?.method === "POST",
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      name: "Oportunidade ERP",
      value: "250000.00",
      project_hours: "",
    });
  });

  it("não mostra a seção de conversão em Novo", async () => {
    mockEditFetch();
    render(<LeadForm leadId="lead-1" />);
    await screen.findByRole("heading", { level: 1, name: "Editar lead" });

    expect(
      screen.queryByRole("heading", { name: "Criar oportunidade" }),
    ).not.toBeInTheDocument();
  });

  it("exibe o erro da conversão", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/leads/references" && !init?.method)
        return jsonResponse(references);
      if (url === "/api/leads/lead-1" && !init?.method)
        return jsonResponse({ ...storedLead, status: "Qualificando" });
      if (url === "/api/leads/lead-1/convert" && init?.method === "POST")
        return jsonResponse(
          { error: "O lead não pode mais ser convertido." },
          409,
        );
      throw new Error(`fetch inesperado: ${url}`);
    });
    render(<LeadForm leadId="lead-1" />);

    await screen.findByRole("heading", { name: "Criar oportunidade" });
    fireEvent.change(screen.getByLabelText("Nome da oportunidade"), {
      target: { value: "Oportunidade" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar oportunidade" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O lead não pode mais ser convertido.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
