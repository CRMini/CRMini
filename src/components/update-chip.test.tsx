import fs from "node:fs";
import path from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UpdateChip from "./update-chip";

type UpdatesBridge = NonNullable<NonNullable<Window["crmDesktop"]>["updates"]>;
type ActionResult = Awaited<ReturnType<UpdatesBridge["download"]>>;

/** Snapshot canônico do processo principal (defaults: atualização disponível). */
function state(overrides: Partial<UpdateSnapshot> = {}): UpdateSnapshot {
  return {
    enabled: true,
    status: "available",
    currentVersion: "0.1.0",
    targetVersion: "0.2.0",
    ...overrides,
  };
}

function progress(percent: number) {
  return { percent, transferred: 0, total: 1000, bytesPerSecond: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Instala um `window.crmDesktop.updates` controlável e devolve os mocks, a
 * ordem das chamadas de assinatura/estado e um emissor de snapshots.
 */
function mountBridge(initial: UpdateSnapshot) {
  const order: string[] = [];
  let listener: ((next: UpdateSnapshot) => void) | null = null;
  const unsubscribe = vi.fn();

  const updates = {
    onState: vi.fn((nextListener: (next: UpdateSnapshot) => void) => {
      order.push("onState");
      listener = nextListener;
      return unsubscribe;
    }),
    getState: vi.fn(() => {
      order.push("getState");
      return Promise.resolve(initial);
    }),
    check: vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      snapshot: state(),
    })),
    download: vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      snapshot: state(),
    })),
    install: vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      snapshot: state(),
    })),
  };

  window.crmDesktop = {
    getDatabasePath: vi.fn(),
    getAssetsPath: vi.fn(),
    chooseDatabase: vi.fn(),
    updates,
  };

  return {
    updates,
    order,
    unsubscribe,
    /** Emite um snapshot pelo evento `onState` dentro de `act`. */
    emit(next: UpdateSnapshot) {
      act(() => listener?.(next));
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  delete window.crmDesktop;
});

describe("Chip de atualização", () => {
  it("não renderiza nada sem a ponte desktop, nem lança erro", () => {
    const { container } = render(<UpdateChip />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("não renderiza nada quando a ponte existe mas sem `updates`", async () => {
    window.crmDesktop = {
      getDatabasePath: vi.fn(),
      getAssetsPath: vi.fn(),
      chooseDatabase: vi.fn(),
    };

    const { container } = render(<UpdateChip />);
    await settle();

    expect(container).toBeEmptyDOMElement();
  });

  it.each(["development", "portable", "opt-out"] as const)(
    "não renderiza nada com enabled:false (reason: %s)",
    async (reason) => {
      mountBridge(
        state({
          enabled: false,
          reason,
          status: "error",
          error: { phase: "download", message: "ignorada", visible: true },
        }),
      );

      const { container } = render(<UpdateChip />);
      await settle();

      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it.each(["idle", "checking"] as const)(
    "não renderiza nada no status %s",
    async (status) => {
      mountBridge(state({ status }));

      const { container } = render(<UpdateChip />);
      await settle();

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("oferece a atualização para a versão alvo e baixa uma única vez", async () => {
    const bridge = mountBridge(state());
    const pending = deferred<ActionResult>();
    bridge.updates.download.mockReturnValue(pending.promise);

    render(<UpdateChip />);
    await settle();

    const button = screen.getByRole("button", {
      name: "Atualizar para 0.2.0",
    });

    // Duplo clique antes da promessa resolver: o botão já está `pending`.
    fireEvent.click(button);
    fireEvent.click(button);

    expect(bridge.updates.download).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    pending.resolve({ ok: true, snapshot: state() });
    await settle();

    expect(button).toBeEnabled();
  });

  it("usa o rótulo curto quando não há versão alvo", async () => {
    mountBridge(state({ targetVersion: undefined }));

    render(<UpdateChip />);
    await settle();

    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Atualização disponível.",
    );
  });

  it("mostra percentual e barra de progresso sem ação de cancelar", async () => {
    mountBridge(state({ status: "downloading", progress: progress(42.4) }));

    render(<UpdateChip />);
    await settle();

    expect(screen.getByText(/42%/)).toHaveTextContent(
      "Baixando atualização… 42%",
    );

    const bar = screen.getByRole("progressbar", {
      name: "Download da atualização",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");

    const fill = bar.querySelector("span");
    expect(fill, "barra de progresso sem preenchimento").not.toBeNull();
    expect(
      (fill as HTMLElement).style.getPropertyValue("--update-progress"),
    ).toBe("42%");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("normaliza o percentual para a faixa 0–100", async () => {
    const bridge = mountBridge(
      state({ status: "downloading", progress: progress(42) }),
    );

    render(<UpdateChip />);
    await settle();

    const cases: Array<[number, string]> = [
      [137.6, "100"],
      [55.5, "56"],
      [-5, "0"],
      [Number.NaN, "0"],
    ];

    for (const [percent, expected] of cases) {
      bridge.emit(
        state({ status: "downloading", progress: progress(percent) }),
      );
      expect(
        screen.getByRole("progressbar"),
        `percentual ${percent}`,
      ).toHaveAttribute("aria-valuenow", expected);
    }

    bridge.emit(state({ status: "downloading", progress: undefined }));
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("pede reinício quando o download terminou", async () => {
    const bridge = mountBridge(state({ status: "downloaded" }));

    render(<UpdateChip />);
    await settle();

    fireEvent.click(
      screen.getByRole("button", { name: "Reiniciar para atualizar" }),
    );

    expect(bridge.updates.install).toHaveBeenCalledTimes(1);
    expect(bridge.updates.download).not.toHaveBeenCalled();
    expect(bridge.updates.check).not.toHaveBeenCalled();
  });

  it("desabilita a ação durante a reinicialização", async () => {
    const bridge = mountBridge(state({ status: "installing" }));

    render(<UpdateChip />);
    await settle();

    const button = screen.getByRole("button", {
      name: "Reiniciando para atualizar…",
    });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(bridge.updates.install).not.toHaveBeenCalled();
    expect(bridge.updates.download).not.toHaveBeenCalled();
  });

  it("não mostra falha silenciosa de verificação", async () => {
    mountBridge(
      state({
        status: "error",
        error: { phase: "check", message: "sem rede", visible: false },
      }),
    );

    const { container } = render(<UpdateChip />);
    await settle();

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra erro visível de download e tenta baixar de novo", async () => {
    const bridge = mountBridge(
      state({
        status: "error",
        error: { phase: "download", message: "sem rede", visible: true },
      }),
    );
    const pending = deferred<ActionResult>();
    bridge.updates.download.mockReturnValue(pending.promise);

    render(<UpdateChip />);
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar.",
    );

    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retry).toHaveTextContent("Tentar novamente");
    fireEvent.click(retry);

    expect(bridge.updates.download).toHaveBeenCalledTimes(1);
    expect(bridge.updates.install).not.toHaveBeenCalled();
    expect(bridge.updates.check).not.toHaveBeenCalled();
    expect(retry).toBeDisabled();

    pending.resolve({ ok: true, snapshot: state() });
    await settle();
    expect(retry).toBeEnabled();
  });

  it("repete a verificação quando a falha veio de check", async () => {
    const bridge = mountBridge(
      state({
        status: "error",
        error: { phase: "check", message: "sem rede", visible: true },
      }),
    );

    render(<UpdateChip />);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(bridge.updates.check).toHaveBeenCalledTimes(1);
    expect(bridge.updates.download).not.toHaveBeenCalled();
  });

  it("repete a instalação quando a falha foi de instalação e há versão alvo", async () => {
    const bridge = mountBridge(
      state({
        status: "error",
        error: { phase: "install", message: "reinício falhou", visible: true },
      }),
    );
    const pending = deferred<ActionResult>();
    bridge.updates.install.mockReturnValue(pending.promise);

    render(<UpdateChip />);
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar.",
    );

    // O arquivo já está baixado: rebaixar de novo seria desperdício de rede.
    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retry).toHaveTextContent("Tentar novamente");

    fireEvent.click(retry);

    expect(bridge.updates.install).toHaveBeenCalledTimes(1);
    expect(bridge.updates.download).not.toHaveBeenCalled();
    expect(bridge.updates.check).not.toHaveBeenCalled();
    expect(retry).toBeDisabled();

    pending.resolve({ ok: true, snapshot: state() });
    await settle();

    expect(retry).toBeEnabled();
  });

  it("volta a baixar quando a falha de instalação não tem versão alvo", async () => {
    const bridge = mountBridge(
      state({
        status: "error",
        targetVersion: undefined,
        error: { phase: "install", message: "arquivo ausente", visible: true },
      }),
    );

    render(<UpdateChip />);
    await settle();

    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retry).toHaveTextContent("Tentar novamente");

    fireEvent.click(retry);
    await settle();

    expect(bridge.updates.download).toHaveBeenCalledTimes(1);
    expect(bridge.updates.install).not.toHaveBeenCalled();
    expect(bridge.updates.check).not.toHaveBeenCalled();
  });

  it("assina antes de buscar o estado e atualiza pela região viva", async () => {
    const bridge = mountBridge(
      state({ status: "downloading", progress: progress(10) }),
    );

    const { unmount } = render(<UpdateChip />);

    expect(bridge.order).toEqual(["onState", "getState"]);

    await settle();

    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("aria-atomic", "true");
    expect(live).toHaveTextContent("Baixando atualização.");

    bridge.emit(state({ status: "downloaded" }));
    expect(live).toHaveTextContent(
      "Atualização pronta. Reinicie para aplicar.",
    );

    bridge.emit(state({ status: "installing" }));
    expect(live).toHaveTextContent("Reiniciando para atualizar.");

    bridge.emit(state({ status: "available" }));
    expect(live).toHaveTextContent("Atualização 0.2.0 disponível.");

    unmount();
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("não inventa mensagem quando getState falha", async () => {
    const bridge = mountBridge(state());
    bridge.updates.getState.mockRejectedValue(new Error("ipc indisponível"));

    const { container } = render(<UpdateChip />);
    await settle();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mantém o estado do main quando a ação é rejeitada", async () => {
    const bridge = mountBridge(state());
    bridge.updates.download.mockRejectedValue(new Error("ipc caiu"));

    render(<UpdateChip />);
    await settle();

    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar para 0.2.0" }),
    );
    await settle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Atualizar para 0.2.0" }),
    ).toBeEnabled();
  });

  it("adota o snapshot devolvido quando a ação falha", async () => {
    const bridge = mountBridge(state());
    bridge.updates.download.mockResolvedValue({
      ok: false,
      error: "sem rede",
      snapshot: state({
        status: "error",
        error: { phase: "download", message: "sem rede", visible: true },
      }),
    });

    render(<UpdateChip />);
    await settle();

    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar para 0.2.0" }),
    );
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível atualizar.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Atualizar para 0.2.0" }),
    ).not.toBeInTheDocument();
  });
});

const css = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function ruleBlock(selector: string, from = 0) {
  const selectorIndex = css.indexOf(selector, from);
  expect(
    selectorIndex,
    `seletor CSS ausente: ${selector}`,
  ).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", selectorIndex);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

// Só as regras do chip entram na varredura de cores: o arquivo tem outros blocos
// depois dele, e o teste não deve acusar cor de outra tela.
function chipDeclarations() {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css))) {
    if (match[1].includes(".update-chip")) blocks.push(match[2]);
  }
  return blocks.join("\n");
}

describe("Estilos do chip de atualização", () => {
  it("fixa o chip no canto superior direito", () => {
    const chip = ruleBlock(".update-chip {");

    expect(chip).toContain("position: fixed");
    expect(chip).toContain("top: 12px");
    expect(chip).toContain("right: 16px");
    expect(chip).toContain("border: 1px solid var(--line)");
  });

  it("mantém o anel de foco no padrão do produto", () => {
    const focus = ruleBlock(".update-chip-action:focus-visible");

    expect(focus).toContain("outline: 0");
    expect(focus).toContain("box-shadow: 0 0 0 3px #3986531c");
  });

  it("liga o preenchimento da barra à variável `--update-progress`", () => {
    const fill = ruleBlock(".update-chip-progress > span");

    expect(fill).toContain("width: var(--update-progress, 0%)");
    expect(fill).toContain("background: var(--accent)");
  });

  it("não introduz cores fora dos tokens e hex consagrados", () => {
    const block = chipDeclarations();
    const consagradas = new Set([
      "#fff",
      "#3986531c",
      "#fff2f2",
      "#f0d0d0",
      "#a33",
      "#18241608",
    ]);

    const cores = block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(cores.length).toBeGreaterThan(0);

    const inesperadas = cores.filter(
      (cor) => !consagradas.has(cor.toLowerCase()),
    );
    expect(inesperadas).toEqual([]);
  });
});
