import { describe, expect, it } from "vitest";
import { LEAD_STATUSES, isLeadStatus } from "./lead-status";

describe("lead-status", () => {
  it("expõe os status aceitos pelo schema na ordem do enum", () => {
    expect(LEAD_STATUSES).toEqual([
      "Novo",
      "Em contato",
      "Qualificando",
      "Qualificado",
      "Reunião agendada",
      "Desqualificado",
    ]);
  });

  it("reconhece um status válido", () => {
    expect(isLeadStatus("Novo")).toBe(true);
    expect(isLeadStatus("Em contato")).toBe(true);
    expect(isLeadStatus("Desqualificado")).toBe(true);
  });

  it("rejeita um valor fora do enum", () => {
    expect(isLeadStatus("Inválido")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus("novo")).toBe(false);
  });
});
