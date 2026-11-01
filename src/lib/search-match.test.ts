import { describe, expect, it } from "vitest";
import { matchesSearch } from "./search-match";

describe("matchesSearch", () => {
  it.each([null, undefined, "", "   "])(
    "trata a busca %s como vazia e aceita qualquer texto",
    (query) => {
      expect(matchesSearch("Empresa Alfa", query)).toBe(true);
    },
  );

  it("ignora acentos e caixa nos dois lados", () => {
    expect(matchesSearch("José São Paulo", "jose sao")).toBe(true);
    expect(matchesSearch("jose sao paulo", "JOSÉ")).toBe(true);
  });

  it("encontra trechos no meio do texto", () => {
    expect(matchesSearch("Ana Paula Souza", "paula")).toBe(true);
  });

  it("colapsa espaços repetidos e não separa palavras que estavam juntas", () => {
    expect(matchesSearch("Ana   Exemplo", "ana exemplo")).toBe(true);
    expect(matchesSearch("Ana Exemplo", "ana   exemplo")).toBe(true);
    expect(matchesSearch("AnaExemplo", "ana exemplo")).toBe(false);
  });

  it("devolve false quando o termo não existe", () => {
    expect(matchesSearch("Empresa Alfa", "beta")).toBe(false);
  });
});
