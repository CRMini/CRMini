import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ClientDetail } = vi.hoisted(() => ({
  ClientDetail: vi.fn(() => <div data-testid="client-detail" />),
}));

vi.mock("@/components/client-detail", () => ({ default: ClientDetail }));

import ClientDetailPage from "./page";

afterEach(() => cleanup());

describe("Página Detalhes do cliente", () => {
  it("aguarda os params e repassa o id ao detalhe", async () => {
    render(
      await ClientDetailPage({ params: Promise.resolve({ id: "client-1" }) }),
    );

    expect(ClientDetail).toHaveBeenCalledTimes(1);
    expect(ClientDetail.mock.calls[0][0]).toEqual({ id: "client-1" });
    expect(screen.getByTestId("client-detail")).toBeInTheDocument();
  });
});
