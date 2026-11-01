import { cleanup, render, screen } from "@testing-library/react";
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
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

import ClientDetail from "./client-detail";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function savedClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    company_name: "Aurora Tecnologia",
    trade_name: "Aurora",
    tax_id: "12345678000190",
    industry: "Tecnologia da Informação",
    website: "https://aurora.example.com",
    phone: "551133331000",
    email: "contato@aurora.example.com",
    postal_code: "04538132",
    street: "Av. Faria Lima",
    street_number: "3477",
    complement: "10º andar",
    city: "São Paulo",
    state: "SP",
    country: "Brasil",
    notes: "Cliente estratégico.",
    logo_path: null,
    is_active: true,
    contacts: [
      {
        id: "contact-1",
        full_name: "Ana Souza",
        job_title: "Diretora de Operações",
        email: "ana@aurora.example.com",
        phone: "5511999910001",
        mobile: null,
        birthday: "1987-08-04",
        linkedin_url: "https://www.linkedin.com/in/ana",
        is_primary: true,
        is_active: true,
      },
    ],
    ...overrides,
  };
}

function mockFetch(handler: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/events")) return jsonResponse([]);
    if (url.startsWith("/api/opportunities")) return jsonResponse([]);
    return handler();
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClientDetail", () => {
  it("mostra carregamento e depois resumo, contatos e histórico", async () => {
    mockFetch(() => jsonResponse(savedClient()));

    render(<ClientDetail id="client-1" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando cliente...",
    );

    expect(
      await screen.findByRole("heading", { name: "Aurora Tecnologia" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Histórico" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Nenhum evento registrado" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("04/08/1987")).toBeInTheDocument();
    expect(screen.getByText("ana@aurora.example.com")).toBeInTheDocument();
    expect(screen.getByText("Cliente estratégico.")).toBeInTheDocument();
    expect(screen.getByText("12.345.678/0001-90")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Editar cliente" })).toHaveAttribute(
      "href",
      "/clientes/client-1/editar",
    );
    expect(screen.getByRole("link", { name: "Editar contatos" })).toHaveAttribute(
      "href",
      "/clientes/client-1/editar",
    );
  });

  it("mostra o erro retornado pela API", async () => {
    mockFetch(() => jsonResponse({ error: "Cliente não encontrado." }, false));

    render(<ClientDetail id="client-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cliente não encontrado.",
    );
  });

  it("sinaliza cliente desativado", async () => {
    mockFetch(() => jsonResponse(savedClient({ is_active: false })));

    render(<ClientDetail id="client-1" />);

    expect(await screen.findByText("Desativado")).toBeInTheDocument();
  });

  it("mostra mensagem quando não há contatos ativos", async () => {
    mockFetch(() => jsonResponse(savedClient({ contacts: [] })));

    render(<ClientDetail id="client-1" />);

    expect(
      await screen.findByText("Nenhum contato ativo cadastrado."),
    ).toBeInTheDocument();
  });
});
