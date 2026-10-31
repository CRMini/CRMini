import { describe, expect, it } from "vitest";
import { isValidCep, normalizeCep, parseViaCepPayload } from "./cep";

describe("normalizeCep", () => {
  it("mantém apenas os dígitos de um CEP mascarado", () => {
    expect(normalizeCep("01310-100")).toBe("01310100");
    expect(normalizeCep(" CEP: 01310-100 ")).toBe("01310100");
  });

  it("trata valores nulos ou vazios", () => {
    expect(normalizeCep(null)).toBe("");
    expect(normalizeCep(undefined)).toBe("");
    expect(normalizeCep("")).toBe("");
  });
});

describe("isValidCep", () => {
  it.each(["01310100", "01310-100", " 01310-100 "])(
    "aceita o CEP completo %s",
    (value) => {
      expect(isValidCep(value)).toBe(true);
    },
  );

  it.each(["", "01310", "0131010", "013101000", "CEP pendente"])(
    "rejeita o valor %s",
    (value) => {
      expect(isValidCep(value)).toBe(false);
    },
  );
});

describe("parseViaCepPayload", () => {
  it("converte a resposta do ViaCEP no endereço do CRM", () => {
    expect(
      parseViaCepPayload(
        {
          cep: "01310-100",
          logradouro: "Avenida Paulista",
          localidade: "São Paulo",
          uf: "SP",
        },
        "01310100",
      ),
    ).toEqual({
      postal_code: "01310-100",
      street: "Avenida Paulista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("preserva logradouro vazio quando o ViaCEP não o informa", () => {
    expect(
      parseViaCepPayload({ localidade: "São Paulo", uf: "SP" }, "01310-100"),
    ).toEqual({
      postal_code: "01310-100",
      street: "",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("trata espaços em branco nos campos retornados", () => {
    expect(
      parseViaCepPayload(
        {
          logradouro: "  Avenida Paulista  ",
          localidade: "  São Paulo  ",
          uf: " SP ",
        },
        "01310100",
      ),
    ).toEqual({
      postal_code: "01310-100",
      street: "Avenida Paulista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it.each([
    [{ erro: true }],
    [null],
    [undefined],
    ["resposta"],
    [[]],
    [{ localidade: "São Paulo" }],
    [{ uf: "SP" }],
    [{ localidade: 123, uf: "SP" }],
    [{ localidade: "São Paulo", uf: 123 }],
  ])("retorna null para a resposta %j", (payload) => {
    expect(parseViaCepPayload(payload, "01310100")).toBeNull();
  });
});
