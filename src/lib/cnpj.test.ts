import { describe, expect, it } from "vitest";
import { isValidCnpj, normalizeCnpj } from "./cnpj";

describe("normalizeCnpj", () => {
  it("remove a máscara e mantém apenas caracteres alfanuméricos", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj(" 11 222 333 0001 81 ")).toBe("11222333000181");
    expect(normalizeCnpj("11.222.333/0001-81\r\n")).toBe("11222333000181");
  });

  it("converte letras minúsculas em maiúsculas", () => {
    expect(normalizeCnpj("12abc34501de35")).toBe("12ABC34501DE35");
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });

  it("devolve string vazia para entradas ausentes ou sem conteúdo", () => {
    expect(normalizeCnpj(null)).toBe("");
    expect(normalizeCnpj(undefined)).toBe("");
    expect(normalizeCnpj("")).toBe("");
    expect(normalizeCnpj("   ")).toBe("");
  });
});

describe("isValidCnpj — formatos aceitos", () => {
  it.each([
    ["numérico sem máscara", "11222333000181"],
    ["numérico com máscara", "11.222.333/0001-81"],
    ["alfanumérico sem máscara", "12ABC34501DE35"],
    ["alfanumérico com máscara", "12.ABC.345/01DE-35"],
    ["alfanumérico em minúsculas", "12abc34501de35"],
  ])("aceita CNPJ %s", (_label, value) => {
    expect(isValidCnpj(value)).toBe(true);
  });

  it("usa o valor oficial ASCII−48 para as letras (vetor 12.ABC.345/01DE-35)", () => {
    // Com o mapeamento alfabético comum (A=10) este vetor seria rejeitado.
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
  });
});

describe("isValidCnpj — dígitos verificadores", () => {
  it("rejeita o primeiro dígito verificador errado", () => {
    expect(isValidCnpj("11222333000191")).toBe(false);
  });

  it("rejeita o segundo dígito verificador errado", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  it("aceita dígito verificador 0 e não o confunde com valor inválido", () => {
    // Resto 0 → DV 0 (primeiro dígito): 112223330000-09.
    expect(isValidCnpj("11222333000009")).toBe(true);
    // Segundo dígito 0: 112223330018-20.
    expect(isValidCnpj("11222333001820")).toBe(true);
    // Ambos os dígitos 0: 112223330019-00.
    expect(isValidCnpj("11222333001900")).toBe(true);
    // Mesmo formato com DV 0 trocado para 1 é inválido.
    expect(isValidCnpj("11222333000019")).toBe(false);
  });
});

describe("isValidCnpj — formatos rejeitados", () => {
  it.each([
    ["13 caracteres", "1122233300018"],
    ["15 caracteres", "112223330001811"],
    ["letra no primeiro verificador", "1122233300018A"],
    ["letra no segundo verificador", "12ABC34501DE3A"],
  ])("rejeita CNPJ com %s", (_label, value) => {
    expect(isValidCnpj(value)).toBe(false);
  });

  it.each([
    ["texto sem forma de CNPJ", "CNPJ pendente"],
    ["apenas letras", "ABCDEFGHIJKLMN"],
    ["apenas separadores", "...///---"],
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
    ["espaços", "   "],
  ])("rejeita %s", (_label, value) => {
    expect(isValidCnpj(value)).toBe(false);
  });

  it.each([
    ["zeros", "00000000000000"],
    ["uns", "11111111111111"],
    ["zeros com máscara", "00.000.000/0000-00"],
  ])("rejeita CNPJ repetido (%s)", (_label, value) => {
    expect(isValidCnpj(value)).toBe(false);
  });
});
