import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

import EditContactPage from "./page";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const contact = {
  id: "contact-1",
  client_id: "client-1",
  company_name: "Empresa Alfa",
  full_name: "Pessoa Exemplo",
  job_title: "Analista",
  email: "pessoa@example.com",
  is_primary: false,
};

afterEach(() => cleanup());

describe("Página Editar contato", () => {
  it("repassa returnTo para o formulário de edição", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === "/api/clients") return jsonResponse([]);
      return jsonResponse(contact);
    });

    render(
      await EditContactPage({
        params: Promise.resolve({ id: "contact-1" }),
        searchParams: Promise.resolve({ returnTo: "/contatos/importar" }),
      }),
    );

    expect(
      await screen.findByRole("link", { name: /Voltar à importação/ }),
    ).toHaveAttribute("href", "/contatos/importar");
  });

  it("renderiza o formulário de edição do contato", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "/api/clients") return jsonResponse([]);
        return jsonResponse(contact);
      });

    render(await EditContactPage({ params: Promise.resolve({ id: "contact-1" }) }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Editar contato" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar contato" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/contacts/contact-1"),
    );
  });
});
