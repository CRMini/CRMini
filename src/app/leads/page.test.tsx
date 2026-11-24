import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { LeadsView } = vi.hoisted(() => ({
  LeadsView: vi.fn(() => <div data-testid="leads-view" />),
}));

vi.mock("@/components/leads-view", () => ({ default: LeadsView }));

import LeadsPage from "./page";

afterEach(() => cleanup());

describe("Página Leads", () => {
  it("renderiza a visão de leads", () => {
    render(<LeadsPage />);

    expect(LeadsView).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("leads-view")).toBeInTheDocument();
  });
});
