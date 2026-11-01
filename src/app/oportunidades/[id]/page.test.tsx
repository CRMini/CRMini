import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { OpportunityDetail } = vi.hoisted(() => ({
  OpportunityDetail: vi.fn(() => <div data-testid="opportunity-detail" />),
}));

vi.mock("@/components/opportunity-detail", () => ({
  default: OpportunityDetail,
}));

import OpportunityDetailPage from "./page";

afterEach(() => cleanup());

describe("Página Detalhes da oportunidade", () => {
  it("aguarda os params e repassa o id ao detalhe", async () => {
    render(
      await OpportunityDetailPage({
        params: Promise.resolve({ id: "opp-1" }),
      }),
    );

    expect(OpportunityDetail).toHaveBeenCalledTimes(1);
    expect(OpportunityDetail.mock.calls[0][0]).toEqual({ id: "opp-1" });
    expect(screen.getByTestId("opportunity-detail")).toBeInTheDocument();
  });
});
