import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { OpportunitiesView } = vi.hoisted(() => ({
  OpportunitiesView: vi.fn(() => <div data-testid="opportunities-view" />),
}));

vi.mock("@/components/opportunities-view", () => ({
  default: OpportunitiesView,
}));

import EditOpportunityPage from "./page";

afterEach(() => cleanup());

describe("Página Editar oportunidade", () => {
  it("aguarda os params e repassa o id no modo de edição", async () => {
    render(
      await EditOpportunityPage({
        params: Promise.resolve({ id: "opp-1" }),
      }),
    );

    expect(OpportunitiesView).toHaveBeenCalledTimes(1);
    expect(OpportunitiesView.mock.calls[0][0]).toEqual({
      mode: "edit",
      id: "opp-1",
    });
    expect(screen.getByTestId("opportunities-view")).toBeInTheDocument();
  });
});
