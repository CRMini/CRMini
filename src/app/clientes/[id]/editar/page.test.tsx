import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ClientForm } = vi.hoisted(() => ({
  ClientForm: vi.fn(() => <div data-testid="client-form" />),
}));

vi.mock("@/components/client-form", () => ({ default: ClientForm }));

import EditClientPage from "./page";

afterEach(() => cleanup());

describe("Página Editar cliente", () => {
  it("aguarda os params e repassa o id ao formulário", async () => {
    render(await EditClientPage({ params: Promise.resolve({ id: "client-1" }) }));

    expect(ClientForm).toHaveBeenCalledTimes(1);
    expect(ClientForm.mock.calls[0][0]).toEqual({ id: "client-1" });
    expect(screen.getByTestId("client-form")).toBeInTheDocument();
  });
});
