import { describe, expect, it } from "vitest";
import {
  LEAD_DISQUALIFICATION_REASONS,
  LEAD_STATUSES,
  allowedLeadStatusTransitions,
  canTransitionLeadStatus,
  isLeadDisqualificationReason,
  isLeadStatus,
} from "./lead-status";

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

describe("transições de status do lead", () => {
  it("aceita as transições manuais previstas", () => {
    expect(canTransitionLeadStatus("Novo", "Em contato")).toBe(true);
    expect(canTransitionLeadStatus("Em contato", "Qualificando")).toBe(true);
    expect(canTransitionLeadStatus("Qualificando", "Reunião agendada")).toBe(
      true,
    );
    expect(canTransitionLeadStatus("Reunião agendada", "Em contato")).toBe(
      true,
    );
    expect(canTransitionLeadStatus("Novo", "Desqualificado")).toBe(true);
  });

  it("não permite chegar a Qualificado manualmente", () => {
    for (const from of LEAD_STATUSES)
      expect(canTransitionLeadStatus(from, "Qualificado")).toBe(false);
  });

  it("trata Qualificado e Desqualificado como terminais", () => {
    for (const to of LEAD_STATUSES) {
      expect(canTransitionLeadStatus("Qualificado", to)).toBe(false);
      expect(canTransitionLeadStatus("Desqualificado", to)).toBe(false);
    }
  });

  it("lista os destinos permitidos a partir do estado atual", () => {
    expect(allowedLeadStatusTransitions("Qualificando")).toEqual([
      "Em contato",
      "Reunião agendada",
      "Desqualificado",
    ]);
  });

  it("reconhece apenas os motivos de desqualificação do schema", () => {
    expect(isLeadDisqualificationReason("Prazo")).toBe(true);
    expect(isLeadDisqualificationReason("Dados Inválidos")).toBe(true);
    expect(isLeadDisqualificationReason("Outro motivo")).toBe(false);
    expect(LEAD_DISQUALIFICATION_REASONS).toHaveLength(7);
  });
});
