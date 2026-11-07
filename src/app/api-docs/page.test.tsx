import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound }));

import ApiDocsPage, { dynamic } from "./page";

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  notFound.mockReset();
});

afterEach(() => {
  cleanup();
  process.env.NODE_ENV = originalNodeEnv;
});

describe("Página de documentação da API", () => {
  it("força renderização dinâmica", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("renderiza a barra e o iframe do Scalar quando habilitado", () => {
    process.env.NODE_ENV = "development";

    render(<ApiDocsPage />);

    expect(
      screen.getByText(
        "Documentação da API — disponível apenas em desenvolvimento.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver especificação" }),
    ).toHaveAttribute("href", "/api/openapi");

    const frame = screen.getByTitle("Documentação da API");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("class", "api-docs-frame");
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain('data-url="/api/openapi"');
    expect(srcDoc).toContain("@scalar/api-reference@1.77.0");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("chama notFound em produção", () => {
    process.env.NODE_ENV = "production";
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    expect(() => ApiDocsPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
