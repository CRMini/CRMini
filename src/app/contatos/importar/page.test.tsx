import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/linkedin-import-view", () => ({
  default: () => <div>Importação de teste</div>,
}));
import Page from "./page";
afterEach(cleanup);
it("renderiza a tela de importação", () => {
  render(<Page />);
  expect(screen.getByText("Importação de teste")).toBeInTheDocument();
});
