import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LINKEDIN_CSV_LIMITS } from "@/lib/linkedin-connections";
import { LINKEDIN_IMPORT_DRAFT_KEY } from "@/lib/linkedin-import-draft";
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
import LinkedInImportView from "./linkedin-import-view";

const client = {
  id: "client-a",
  company_name: "Empresa Alfa",
  is_active: true,
};
const header =
  "First Name,Last Name,Company,Position,Email Address,URL,Connected On\n";
const csv =
  header +
  "Ana,Exemplo,Empresa Alfa,Gestora,ana@example.test,https://www.linkedin.com/in/ana-exemplo,31 Oct 2026\nBia,Teste,Empresa Nova,Analista,,,\nCaio,Teste,Empresa Nova,,,,\nDavi,Teste,,,,,";
const ok = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;
let contacts: unknown[];
let clients: (typeof client)[];
let importFails: boolean;
let contactsFail: boolean;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  sessionStorage.clear();
  contacts = [];
  clients = [client];
  importFails = false;
  contactsFail = false;
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      if (String(url) === "/api/contacts/import")
        return importFails
          ? ({
              ok: false,
              json: async () => ({ error: "Falha ao importar" }),
            } as Response)
          : ok({
              counts: { imported: 1, skipped: 0 },
              items: [
                { rowId: 1, status: "imported", contactId: "contact-imported" },
              ],
            });
      if (init?.method === "POST")
        return ok({
          id: "client-new",
          company_name: "Empresa Nova",
          is_active: true,
        });
      if (String(url).startsWith("/api/clients")) return ok(clients);
      if (contactsFail) throw new Error("offline");
      return ok(contacts);
    });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
async function upload(text = csv, size?: number) {
  const input = screen.getByLabelText("Selecionar arquivo CSV");
  await waitFor(() => expect(input).toBeEnabled());
  const file = new File([text], "Connections.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", {
    value: vi.fn().mockResolvedValue(text),
  });
  if (size) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(input, { target: { files: [file] } });
}
async function setup() {
  render(<LinkedInImportView />);
  await upload();
  await screen.findByText("Ana Exemplo");
  expect(screen.getByText("Connections.csv")).toBeInTheDocument();
}
const ana = () =>
  screen.getByRole("checkbox", { name: /^Selecionar Ana Exemplo/ });

it("mostra estado inicial e carrega dados em paralelo", async () => {
  render(<LinkedInImportView />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Carregando clientes e contatos",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Selecionar arquivo CSV")).toBeEnabled(),
  );
  expect(screen.getByText("Selecione suas conexões")).toBeInTheDocument();
  expect(screen.getByText("Nenhum arquivo selecionado")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/clients?compact=1&include_inactive=1",
    undefined,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/contacts?include_inactive=1",
    undefined,
  );
});
it.each([
  ["inválido", undefined],
  [csv, LINKEDIN_CSV_LIMITS.maxBytes + 1],
])("rejeita arquivo inválido ou excessivo", async (text, size) => {
  render(<LinkedInImportView />);
  await upload(text, size);
  expect(await screen.findByRole("alert")).toHaveClass("form-field-error");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Selecionar arquivo CSV")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
it("lista datas civis, seleciona explicitamente, filtra sem acentos e limpa filtros", async () => {
  await setup();
  expect(screen.getByText("31/10/2026")).toBeInTheDocument();
  expect(ana()).not.toBeChecked();
  fireEvent.click(ana());
  expect(
    screen.getByText(/4 lidas · 1 selecionadas · 0 inválidas/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Somente selecionadas"));
  expect(screen.queryByText("Bia Teste")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar conexões"), {
    target: { value: "GESTÓRA" },
  });
  expect(screen.getByText("Ana Exemplo")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar conexões"), {
    target: { value: "ana   exemplo" },
  });
  expect(screen.getByText("Ana Exemplo")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar conexões"), {
    target: { value: "ausente" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByText("Bia Teste")).toBeInTheDocument();
});
it("bloqueia empresa ausente e permite vínculo manual", async () => {
  await setup();
  expect(
    screen.getByRole("checkbox", { name: /Selecionar Davi/ }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Empresa de Davi Teste"), {
    target: { value: client.id },
  });
  expect(
    screen.getByRole("checkbox", { name: /Selecionar Davi/ }),
  ).toBeEnabled();
});
it("cadastra empresa inline, valida nome e atribui todas as linhas preservando seleção", async () => {
  await setup();
  fireEvent.click(ana());
  fireEvent.click(
    screen.getAllByRole("button", { name: "Cadastrar empresa" })[0],
  );
  const card = screen.getByRole("region", {
    name: "Cadastrar empresa para Bia Teste",
  });
  expect(card).toHaveFocus();
  expect(
    screen.getAllByRole("button", { name: "Fechar cadastro" })[0],
  ).toHaveAttribute("aria-expanded", "true");
  fireEvent.change(screen.getByLabelText("Empresa *"), {
    target: { value: " " },
  });
  fireEvent.click(
    within(card).getByRole("button", { name: "Cadastrar empresa" }),
  );
  expect(screen.getByText("Informe o nome da empresa.")).toHaveClass(
    "form-field-error",
  );
  fireEvent.change(screen.getByLabelText(/Empresa \*/), {
    target: { value: "Empresa Nova" },
  });
  fireEvent.click(
    within(card).getByRole("button", { name: "Cadastrar empresa" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: /Cadastrar empresa para/ }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("checkbox", { name: "Selecionar Bia Teste" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("checkbox", { name: "Selecionar Caio Teste" }),
  ).toBeEnabled();
  expect(ana()).toBeChecked();
});
it("oferece empresa existente sem criar outra", async () => {
  await setup();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Cadastrar empresa" })[0],
  );
  fireEvent.change(screen.getByLabelText("Empresa *"), {
    target: { value: "Empresa Alfa" },
  });
  fireEvent.click(screen.getByRole("button", { name: "usar esta" }));
  expect(
    screen.getByRole("checkbox", { name: "Selecionar Bia Teste" }),
  ).toBeEnabled();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});
it("envia somente selecionadas e mostra resumo", async () => {
  await setup();
  fireEvent.click(ana());
  fireEvent.click(screen.getByRole("button", { name: "Importar 1 contatos" }));
  expect(
    await screen.findByText("1 importados · 0 ignorados"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver contatos" })).toHaveAttribute(
    "href",
    "/contatos",
  );
  expect(screen.getByRole("link", { name: "Ver contato →" })).toHaveAttribute(
    "href",
    "/contatos/contact-imported?returnTo=%2Fcontatos%2Fimportar",
  );
  const call = fetchMock.mock.calls.find(
    ([url]) => url === "/api/contacts/import",
  )!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    dryRun: false,
    items: [
      {
        rowId: 1,
        clientId: "client-a",
        fullName: "Ana Exemplo",
        jobTitle: "Gestora",
        email: "ana@example.test",
        linkedinUrl: "https://www.linkedin.com/in/ana-exemplo",
      },
    ],
  });
  expect(ana()).toBeDisabled();
});
it("preserva seleção após erro de importação", async () => {
  importFails = true;
  await setup();
  fireEvent.click(ana());
  fireEvent.click(screen.getByRole("button", { name: "Importar 1 contatos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha ao importar",
  );
  expect(ana()).toBeChecked();
});
it.each(["url", "email"])("bloqueia duplicata forte por %s", async (key) => {
  contacts = [
    {
      id: "existing",
      client_id: client.id,
      company_name: "Empresa Alfa",
      is_active: true,
      ...(key === "url"
        ? { linkedin_url: "https://www.linkedin.com/in/ana-exemplo/" }
        : { email: "ANA@example.test" }),
    },
  ];
  await setup();
  expect(ana()).toBeDisabled();
  expect(
    screen.getByRole("link", { name: "Já cadastrada em Empresa Alfa" }),
  ).toHaveAttribute(
    "href",
    "/contatos/existing?returnTo=%2Fcontatos%2Fimportar",
  );
});
it("avisa sobre contato inativo sem bloquear", async () => {
  contacts = [
    {
      id: "inactive",
      client_id: client.id,
      company_name: client.company_name,
      is_active: false,
      email: "ana@example.test",
    },
  ];
  await setup();
  expect(ana()).toBeEnabled();
  expect(
    screen.getByText("Existe contato desativado com este perfil"),
  ).toBeInTheDocument();
});
it("avisa quando a consulta de contatos falha e permite continuar", async () => {
  contactsFail = true;
  await setup();
  expect(
    screen.getByText(/A verificação será feita ao importar/),
  ).toBeInTheDocument();
  expect(ana()).toBeEnabled();
});
it("identifica empresa desativada", async () => {
  clients = [
    client,
    { id: "inactive", company_name: "Empresa Nova", is_active: false },
  ];
  await setup();
  expect(screen.getAllByText("Cliente desativado")).toHaveLength(2);
});
it("restaura rascunho, seleção e rolagem ao voltar do detalhe do contato", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  sessionStorage.setItem(
    LINKEDIN_IMPORT_DRAFT_KEY,
    JSON.stringify({
      savedAt: Date.now(),
      fileName: "Connections.csv",
      parsed: {
        connections: [
          {
            rowId: 1,
            fullName: "Ana Exemplo",
            company: "Empresa Alfa",
            jobTitle: "Gestora",
            email: "ana@example.test",
            linkedinUrl: "https://www.linkedin.com/in/ana-exemplo",
            connectedOn: "2026-10-31",
            issues: [],
          },
        ],
        rowsRead: 1,
        invalidCount: 0,
        delimiter: ",",
      },
      selected: [1],
      assignments: {},
      query: "",
      onlySelected: false,
      onlyMissing: false,
      page: 0,
      scrollY: 240,
      processed: [],
      importedContacts: {},
      result: null,
    }),
  );

  render(<LinkedInImportView />);

  await waitFor(() => expect(ana()).toBeChecked());
  expect(screen.getByText("Connections.csv")).toBeInTheDocument();
  expect(screen.getByText(/O progresso fica salvo nesta aba/)).toBeInTheDocument();
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 240));
});

it("pagina 50 linhas e reseta arquivo, seleção e filtros ao descartar", async () => {
  render(<LinkedInImportView />);
  await upload(
    header +
      Array.from({ length: 51 }, (_, i) => `Pessoa,${i},Empresa Alfa,,,,`).join(
        "\n",
      ),
  );
  expect(await screen.findByText("1–50 de 51")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  expect(screen.getByText("51–51 de 51")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Selecionar Pessoa 50" }),
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Descartar arquivo" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Descartar arquivo" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
