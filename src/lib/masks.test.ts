import { describe, expect, it } from "vitest";
import {
  formatCep,
  formatCepForDisplay,
  formatCnpj,
  formatCnpjForDisplay,
} from "./masks";

describe("formatCnpj", () => {
  it("retorna vazio para valores ausentes ou em branco", () => {
    expect(formatCnpj("")).toBe("");
    expect(formatCnpj("   ")).toBe("");
    expect(formatCnpj(null)).toBe("");
    expect(formatCnpj(undefined)).toBe("");
  });

  it.each([
    ["1", "1"],
    ["12", "12"],
    ["123", "12.3"],
    ["12345", "12.345"],
    ["123456", "12.345.6"],
    ["12345678", "12.345.678"],
    ["123456789", "12.345.678/9"],
    ["123456789012", "12.345.678/9012"],
    ["1234567890123", "12.345.678/9012-3"],
  ])("formata progressivamente %s como %s", (digits, expected) => {
    expect(formatCnpj(digits)).toBe(expected);
  });

  it("formata os 14 dígitos completos", () => {
    expect(formatCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("aceita CNPJ alfanumérico e converte as letras para maiúsculas", () => {
    expect(formatCnpj("12abc678000199")).toBe("12.ABC.678/0001-99");
    expect(formatCnpj("12AbC678000199")).toBe("12.ABC.678/0001-99");
    expect(formatCnpj("12.abc.678/0001-99")).toBe("12.ABC.678/0001-99");
  });

  it("descarta letras nas duas posições finais sem consumir o limite de 14", () => {
    expect(formatCnpj("ABCDEFGHIJKLMN")).toBe("AB.CDE.FGH/IJKL");
    expect(formatCnpj("ABCDEFGHIJKLMN99")).toBe("AB.CDE.FGH/IJKL-99");
    expect(formatCnpj("12ABC67800019X")).toBe("12.ABC.678/0001-9");
  });

  it("mantém o valor já mascarado", () => {
    expect(formatCnpj("12.345.678/0001-99")).toBe("12.345.678/0001-99");
    expect(formatCnpj("12.ABC.678/0001-99")).toBe("12.ABC.678/0001-99");
  });

  it("remove pontuação e espaços antes de aplicar a máscara", () => {
    expect(formatCnpj(" 12 345 678 0001 99 ")).toBe("12.345.678/0001-99");
    expect(formatCnpj("12/345?678!0001_99")).toBe("12.345.678/0001-99");
    expect(formatCnpj("(12) 345 678 / 0001 - 99")).toBe("12.345.678/0001-99");
  });

  it("trunca a entrada em 14 caracteres alfanuméricos", () => {
    expect(formatCnpj("123456780001999999")).toBe("12.345.678/0001-99");
    expect(formatCnpj("12.345.678/0001-99 0000")).toBe("12.345.678/0001-99");
    expect(formatCnpj("12ABC678000199XYZ")).toBe("12.ABC.678/0001-99");
  });
});

describe("formatCnpjForDisplay", () => {
  it("retorna vazio para valores ausentes ou em branco", () => {
    expect(formatCnpjForDisplay("")).toBe("");
    expect(formatCnpjForDisplay("   ")).toBe("");
    expect(formatCnpjForDisplay(null)).toBe("");
    expect(formatCnpjForDisplay(undefined)).toBe("");
  });

  it.each([
    ["12345678000199", "12.345.678/0001-99"],
    ["12.345.678/0001-99", "12.345.678/0001-99"],
    ["  12345678000199  ", "12.345.678/0001-99"],
    ["12abc678000199", "12.ABC.678/0001-99"],
    ["12.ABC.678/0001-99", "12.ABC.678/0001-99"],
  ])("formata o CNPJ completo %s como %s", (value, expected) => {
    expect(formatCnpjForDisplay(value)).toBe(expected);
  });

  it.each([
    ["1234567800019"],
    ["12.345.678/0001-9"],
    ["123456789"],
    ["CNPJ pendente"],
    ["não informado"],
    ["00000000000"],
    ["CEP: 01310-100"],
    ["Rua X, 01310-100"],
    ["01310-100 (antigo)"],
    ["CNPJ: 12345678000199"],
    ["12.345.678/0001-9X"],
    ["ABCDEFGHIJKLMN"],
  ])("preserva o valor incompleto ou legado %s", (value) => {
    expect(formatCnpjForDisplay(value)).toBe(value);
  });

  it("remove espaços nas extremidades de valores preservados", () => {
    expect(formatCnpjForDisplay("  CNPJ pendente  ")).toBe("CNPJ pendente");
    expect(formatCnpjForDisplay("  1234567800019  ")).toBe("1234567800019");
  });
});

describe("formatCep", () => {
  it("retorna vazio para valores ausentes ou sem dígitos", () => {
    expect(formatCep("")).toBe("");
    expect(formatCep("   ")).toBe("");
    expect(formatCep(null)).toBe("");
    expect(formatCep(undefined)).toBe("");
    expect(formatCep("abc")).toBe("");
  });

  it.each([
    ["0", "0"],
    ["01310", "01310"],
    ["013101", "01310-1"],
    ["0131010", "01310-10"],
    ["01310100", "01310-100"],
  ])("formata progressivamente %s como %s", (digits, expected) => {
    expect(formatCep(digits)).toBe(expected);
  });

  it("remove pontuação e espaços antes de aplicar a máscara", () => {
    expect(formatCep("01310-100")).toBe("01310-100");
    expect(formatCep("01310.100")).toBe("01310-100");
    expect(formatCep(" 01310 100 ")).toBe("01310-100");
  });

  it("trunca a entrada em 8 dígitos", () => {
    expect(formatCep("013101009999")).toBe("01310-100");
    expect(formatCep("01310-100 000")).toBe("01310-100");
  });
});

describe("formatCepForDisplay", () => {
  it("retorna vazio para valores ausentes ou em branco", () => {
    expect(formatCepForDisplay("")).toBe("");
    expect(formatCepForDisplay("   ")).toBe("");
    expect(formatCepForDisplay(null)).toBe("");
    expect(formatCepForDisplay(undefined)).toBe("");
  });

  it.each([
    ["01310100", "01310-100"],
    ["01310-100", "01310-100"],
    ["01310.100", "01310-100"],
    ["  01310100  ", "01310-100"],
  ])("formata o CEP completo %s como %s", (value, expected) => {
    expect(formatCepForDisplay(value)).toBe(expected);
  });

  it.each([
    ["0131010"],
    ["01310"],
    ["013101000"],
    ["CEP não informado"],
    ["N/A"],
    ["abc"],
    ["CEP: 01310-100"],
    ["Rua X, 01310-100"],
    ["01310-100 (antigo)"],
    ["abc12345678"],
  ])("preserva o valor incompleto ou legado %s", (value) => {
    expect(formatCepForDisplay(value)).toBe(value);
  });

  it("remove espaços nas extremidades de valores preservados", () => {
    expect(formatCepForDisplay("  CEP pendente  ")).toBe("CEP pendente");
    expect(formatCepForDisplay("  0131010  ")).toBe("0131010");
  });
});
