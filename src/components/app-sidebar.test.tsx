import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
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

import AppSidebar from "./app-sidebar";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/sidebar-preference";

type DesktopBridge = NonNullable<Window["crmDesktop"]>;

/** Ponte mínima de versões anteriores do preload (sem preferência da sidebar). */
function legacyBridge(): DesktopBridge {
  return {
    getDatabasePath: vi.fn(),
    getAssetsPath: vi.fn(),
    chooseDatabase: vi.fn(),
  } as unknown as DesktopBridge;
}

function sidebar(): HTMLElement {
  const element = document.getElementById("app-sidebar");
  expect(element, "aside#app-sidebar ausente").not.toBeNull();
  return element as HTMLElement;
}

afterEach(() => {
  cleanup();
  delete window.crmDesktop;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Menu lateral", () => {
  it("exibe a marca CRMini mantendo o ícone da marca", () => {
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "CRMini" })).toBeInTheDocument();
    expect(screen.getByText("ini")).toBeInTheDocument();
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByAltText("CRMini")).toHaveAttribute(
      "src",
      expect.stringContaining("crmini-symbol.svg"),
    );
  });

  it("exibe somente os destinos principais da navegação", () => {
    pathname.current = "/";
    render(<AppSidebar />);

    const navigation = screen.getByRole("navigation", {
      name: "Navegação principal",
    });
    expect(navigation.querySelectorAll("a")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute(
      "href",
      "/clientes",
    );
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute(
      "href",
      "/leads",
    );
    expect(screen.getByRole("link", { name: "Contatos" })).toHaveAttribute(
      "href",
      "/contatos",
    );
    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "href",
      "/oportunidades",
    );
    expect(screen.getByRole("link", { name: "Tarefas" })).toHaveAttribute(
      "href",
      "/tarefas",
    );
  });

  it("indica a área atual em rotas internas sem ativar a visão geral", () => {
    pathname.current = "/oportunidades/nova";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Visão geral" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Clientes" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("indica a área de leads como ativa na rota de leads", () => {
    pathname.current = "/leads";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Clientes" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Contatos" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("posiciona Leads entre Clientes e Contatos na navegação", () => {
    pathname.current = "/";
    render(<AppSidebar />);

    const links = Array.from(
      screen
        .getByRole("navigation", { name: "Navegação principal" })
        .querySelectorAll("a"),
    ).map((link) => {
      link.querySelector('span[aria-hidden="true"]')?.remove();
      return link.textContent;
    });

    expect(links).toEqual([
      "Visão geral",
      "Clientes",
      "Leads",
      "Contatos",
      "Oportunidades",
      "Tarefas",
    ]);
  });

  it("indica somente a visão geral como ativa na página inicial", () => {
    pathname.current = "/";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Tarefas" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("mantém rótulos acessíveis e descritivos nos links com ícones", () => {
    pathname.current = "/contatos";
    render(<AppSidebar />);

    const contactsLink = screen.getByRole("link", { name: "Contatos" });
    expect(contactsLink).toHaveAttribute("title", "Contatos");
    expect(contactsLink.querySelector("span")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("não exibe Configurações quando a ponte desktop não está disponível", () => {
    render(<AppSidebar />);

    expect(
      screen.queryByRole("link", { name: "Configurações" }),
    ).not.toBeInTheDocument();
  });

  it("exibe Configurações somente no desktop e marca a rota ativa", () => {
    pathname.current = "/configuracoes";
    window.crmDesktop = legacyBridge();

    render(<AppSidebar />);

    const settingsLink = screen.getByRole("link", { name: "Configurações" });
    expect(settingsLink).toHaveAttribute("href", "/configuracoes");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
  });
});

describe("Barra lateral recolhível", () => {
  it("inicia expandida com o botão de recolher associado ao aside", async () => {
    render(<AppSidebar />);
    await act(async () => {});

    expect(sidebar()).not.toHaveClass("collapsed");

    const toggle = screen.getByRole("button", {
      name: "Recolher barra lateral",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "app-sidebar");
    expect(toggle).toHaveAttribute("title", "Recolher barra lateral");
  });

  it("recolhe ao clicar e persiste true na ponte desktop", async () => {
    const setSidebarCollapsed = vi.fn(async () => ({ ok: true }));
    window.crmDesktop = {
      ...legacyBridge(),
      setSidebarCollapsed,
    } as DesktopBridge;

    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

    expect(sidebar()).toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Expandir barra lateral" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(setSidebarCollapsed).toHaveBeenCalledWith(true);
    expect(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY),
    ).not.toBe("true");
  });

  it("expande no segundo clique e persiste false", async () => {
    const setSidebarCollapsed = vi.fn(async () => ({ ok: true }));
    window.crmDesktop = {
      ...legacyBridge(),
      setSidebarCollapsed,
    } as DesktopBridge;

    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));
    fireEvent.click(screen.getByRole("button", { name: "Expandir barra lateral" }));

    expect(sidebar()).not.toHaveClass("collapsed");
    expect(
      screen.getByRole("button", { name: "Recolher barra lateral" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(setSidebarCollapsed).toHaveBeenNthCalledWith(1, true);
    expect(setSidebarCollapsed).toHaveBeenNthCalledWith(2, false);
  });

  it("inicia recolhida quando a ponte desktop informa true", async () => {
    window.crmDesktop = {
      ...legacyBridge(),
      getSidebarCollapsed: vi.fn(async () => true),
    } as DesktopBridge;

    render(<AppSidebar />);

    expect(
      await screen.findByRole("button", { name: "Expandir barra lateral" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(sidebar()).toHaveClass("collapsed");
  });

  it("usa o localStorage quando a ponte não expõe os métodos novos", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    window.crmDesktop = legacyBridge();

    render(<AppSidebar />);

    expect(
      await screen.findByRole("button", { name: "Expandir barra lateral" }),
    ).toBeInTheDocument();
    expect(sidebar()).toHaveClass("collapsed");
  });

  it("cai para o localStorage quando a leitura pela ponte rejeita", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    window.crmDesktop = {
      ...legacyBridge(),
      getSidebarCollapsed: vi.fn(async () => {
        throw new Error("IPC indisponível");
      }),
    } as DesktopBridge;

    render(<AppSidebar />);

    expect(
      await screen.findByRole("button", { name: "Expandir barra lateral" }),
    ).toBeInTheDocument();
  });

  it("não deixa a leitura assíncrona sobrescrever um clique imediato", async () => {
    let resolveRead!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      resolveRead = resolve;
    });
    window.crmDesktop = {
      ...legacyBridge(),
      getSidebarCollapsed: vi.fn(() => pending),
      setSidebarCollapsed: vi.fn(async () => ({ ok: true })),
    } as DesktopBridge;

    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));
    expect(sidebar()).toHaveClass("collapsed");

    await act(async () => {
      resolveRead(false);
      await pending;
    });

    expect(sidebar()).toHaveClass("collapsed");
    expect(
      screen.getByRole("button", { name: "Expandir barra lateral" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("trata valor inválido no localStorage como expandida", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "sim");

    render(<AppSidebar />);
    await act(async () => {});

    expect(sidebar()).not.toHaveClass("collapsed");
    expect(
      screen.getByRole("button", { name: "Recolher barra lateral" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("alterna a interface mesmo com o storage lançando erros", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });

    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

    expect(sidebar()).toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Expandir barra lateral" }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Expandir barra lateral" }));

    expect(sidebar()).not.toHaveClass("collapsed");
  });

  it("mantém os destinos e o botão fora da navegação quando recolhida", () => {
    pathname.current = "/contatos";
    window.crmDesktop = legacyBridge();

    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

    const navigation = screen.getByRole("navigation", {
      name: "Navegação principal",
    });
    expect(navigation.querySelectorAll("a")).toHaveLength(6);

    const destinations = [
      ["Visão geral", "/"],
      ["Clientes", "/clientes"],
      ["Leads", "/leads"],
      ["Contatos", "/contatos"],
      ["Oportunidades", "/oportunidades"],
      ["Tarefas", "/tarefas"],
    ] as const;

    for (const [name, href] of destinations) {
      const link = screen.getByRole("link", { name });
      expect(link, `href perdido em ${name}`).toHaveAttribute("href", href);
      expect(link, `title perdido em ${name}`).toHaveAttribute("title", name);
    }

    const settings = screen.getByRole("link", { name: "Configurações" });
    expect(settings).toHaveAttribute("href", "/configuracoes");
    expect(settings).toHaveAttribute("title", "Configurações");

    const toggle = screen.getByRole("button", { name: "Expandir barra lateral" });
    expect(toggle).toHaveAttribute("title", "Expandir barra lateral");
    expect(navigation).not.toContainElement(toggle);
    expect(sidebar()).toContainElement(toggle);
  });
});
