import { describe, expect, it } from "vitest";
import {
  isLeadReferenceType,
  LEAD_REFERENCE_TYPES,
  sortLeadReferences,
} from "./lead-references";

describe("lead-references", () => {
  it("expõe as seis listas de referência na ordem esperada", () => {
    expect(LEAD_REFERENCE_TYPES).toEqual([
      "industries",
      "segments",
      "cities",
      "countries",
      "job_titles",
      "lead_sources",
    ]);
  });

  it("aceita apenas tipos conhecidos", () => {
    expect(isLeadReferenceType("cities")).toBe(true);
    expect(isLeadReferenceType("lead_sources")).toBe(true);
    expect(isLeadReferenceType("clients")).toBe(false);
    expect(isLeadReferenceType("")).toBe(false);
    expect(isLeadReferenceType("__proto__")).toBe(false);
  });

  it("ordena em português ignorando acentos e caixa", () => {
    const rows = [
      { id: "1", name: "Zebra" },
      { id: "2", name: "água" },
      { id: "3", name: "Ave" },
    ];

    expect(sortLeadReferences(rows).map((row) => row.name)).toEqual([
      "água",
      "Ave",
      "Zebra",
    ]);
  });

  it("não altera o array recebido", () => {
    const rows = [
      { id: "1", name: "B" },
      { id: "2", name: "A" },
    ];

    sortLeadReferences(rows);

    expect(rows.map((row) => row.name)).toEqual(["B", "A"]);
  });
});
