import { describe, expect, it } from "vitest";
import { getBrazilDateString } from "@/lib/brazil-date";
import { validateEvent } from "./event-validation";

const validEvent = () => ({
  client_id: "client-1",
  event_type: "reuniao",
  title: "Conversa inicial",
  details: "Detalhes da conversa",
  occurred_at: "2026-10-01",
});

describe("validateEvent", () => {
  it("aceita um evento válido", () => {
    expect(validateEvent(validEvent())).toBeNull();
  });

  it("trata tipo ausente como nota", () => {
    const { event_type, ...withoutType } = validEvent();
    expect(validateEvent(withoutType)).toBeNull();
  });

  it.each([
    ["tipo inválido", { event_type: "sms" }, "Tipo de evento inválido."],
    ["título vazio", { title: "   " }, "Informe um título (até 200 caracteres)."],
    [
      "título muito longo",
      { title: "a".repeat(201) },
      "Informe um título (até 200 caracteres).",
    ],
    ["detalhes não textuais", { details: 42 }, "Detalhes inválidos."],
    [
      "detalhes muito longos",
      { details: "a".repeat(5001) },
      "Detalhes muito longos.",
    ],
    ["cliente ausente", { client_id: undefined }, "Informe o cliente."],
    ["cliente vazio", { client_id: "   " }, "Informe o cliente."],
    ["data ausente", { occurred_at: undefined }, "Informe uma data válida."],
    ["data impossível", { occurred_at: "2026-02-30" }, "Informe uma data válida."],
    ["data em outro formato", { occurred_at: "01/10/2026" }, "Informe uma data válida."],
    ["contato não textual", { contact_id: 42 }, "Contato inválido."],
    [
      "oportunidade não textual",
      { opportunity_id: 42 },
      "Oportunidade inválida.",
    ],
  ])("rejeita %s", (_label, overrides, message) => {
    expect(validateEvent({ ...validEvent(), ...overrides })).toBe(message);
  });

  it("rejeita data futura em America/Sao_Paulo", () => {
    const tomorrow = getBrazilDateString(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    expect(validateEvent({ ...validEvent(), occurred_at: tomorrow })).toBe(
      "A data do evento não pode ser futura.",
    );
  });

  it("aceita limites e vínculos opcionais vazios", () => {
    expect(
      validateEvent({
        ...validEvent(),
        title: "a".repeat(200),
        details: "a".repeat(5000),
        contact_id: "",
        opportunity_id: "",
      }),
    ).toBeNull();
  });
});
