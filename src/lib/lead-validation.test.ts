import { describe, expect, it } from "vitest";
import {
  toLeadRecord,
  validateLeadCreation,
} from "./lead-validation";

function validLead(overrides: Record<string, unknown> = {}) {
  return {
    company_name: "Empresa Alfa Ltda.",
    trade_name: "Alfa",
    tax_id: "11222333000181",
    industry_id: "industry-tecnologia",
    segment_id: "segment-enterprise",
    revenue_band: "Até R$ 10 milhões",
    employee_band: "1-50",
    street: "Rua Teste",
    street_number: "100",
    neighborhood: "Centro",
    city_id: "city-sao-paulo",
    state: "SP",
    postal_code: "01000-000",
    country_id: "country-brasil",
    lead_source_id: "lead-source-site",
    ...overrides,
  };
}

describe("validateLeadCreation", () => {
  it("aceita o lead mínimo válido", () => {
    expect(validateLeadCreation(validLead())).toBeNull();
  });

  it("aceita campos opcionais vazios", () => {
    expect(
      validateLeadCreation(
        validLead({
          complement: "",
          website: " ",
          contact_email: "",
          budget: "",
          contact_same_address: 1,
          communication_type: "",
          priority: "",
          expected_timeframe: "",
          bant_budget: "",
          bant_authority: "",
          bant_need: "",
          bant_timing: "",
          next_interaction_date: "",
          next_interaction_time: "",
        }),
      ),
    ).toBeNull();
  });

  it("exige razão social", () => {
    expect(validateLeadCreation(validLead({ company_name: "  " }))).toBe(
      "Informe a razão social.",
    );
  });

  it("exige nome fantasia", () => {
    expect(validateLeadCreation(validLead({ trade_name: "" }))).toBe(
      "Informe o nome fantasia.",
    );
  });

  it("rejeita CNPJ com dígitos verificadores inválidos", () => {
    expect(
      validateLeadCreation(validLead({ tax_id: "11111111111111" })),
    ).toBe("CNPJ inválido. Informe os 14 dígitos.");
  });

  it("rejeita faixa de faturamento fora do enum", () => {
    expect(
      validateLeadCreation(validLead({ revenue_band: "Muito alto" })),
    ).toBe("Selecione uma faixa de faturamento válida.");
  });

  it("rejeita faixa de funcionários fora do enum", () => {
    expect(
      validateLeadCreation(validLead({ employee_band: "0-0" })),
    ).toBe("Selecione uma faixa de número de funcionários válida.");
  });

  it("rejeita UF fora do enum", () => {
    expect(validateLeadCreation(validLead({ state: "XX" }))).toBe(
      "Selecione um estado válido.",
    );
  });

  it("rejeita CEP sem 8 dígitos", () => {
    expect(validateLeadCreation(validLead({ postal_code: "0100-000" }))).toBe(
      "CEP inválido. Informe os 8 dígitos.",
    );
  });

  it("rejeita e-mail de contato inválido", () => {
    expect(
      validateLeadCreation(validLead({ contact_email: "marina@" })),
    ).toBe("E-mail do contato inválido.");
  });

  it("rejeita budget com separador de milhar", () => {
    expect(validateLeadCreation(validLead({ budget: "1.234,56" }))).toBe(
      "Budget inválido. Use um valor em reais, sem separador de milhar.",
    );
  });

  it("aceita budget decimal canônico", () => {
    expect(validateLeadCreation(validLead({ budget: "1234.56" }))).toBeNull();
  });

  it("rejeita data civil inexistente", () => {
    expect(
      validateLeadCreation(
        validLead({ next_interaction_date: "2026-02-30" }),
      ),
    ).toBe("Data da próxima interação inválida.");
  });

  it("rejeita hora fora do formato HH:MM", () => {
    expect(
      validateLeadCreation(validLead({ next_interaction_time: "25:00" })),
    ).toBe("Hora da próxima interação inválida.");
  });

  it("rejeita status diferente de Novo na criação", () => {
    expect(validateLeadCreation(validLead({ status: "Qualificado" }))).toBe(
      "Todo lead é criado com o status Novo.",
    );
  });

  it("rejeita vínculo com oportunidade na criação", () => {
    expect(
      validateLeadCreation(validLead({ opportunity_id: "opp-1" })),
    ).toBe("Um lead novo não pode estar vinculado a uma oportunidade.");
  });

  it("rejeita motivo de desqualificação na criação", () => {
    expect(
      validateLeadCreation(validLead({ disqualification_reason: "Prazo" })),
    ).toBe("O motivo de desqualificação só existe em lead desqualificado.");
  });

  it("exige descrição quando a origem é Outro", () => {
    expect(
      validateLeadCreation(validLead({ lead_source_id: "lead-source-outro" })),
    ).toBe("Descreva a origem do lead quando escolher Outro.");
  });

  it("rejeita descrição de origem quando não é Outro", () => {
    expect(
      validateLeadCreation(validLead({ lead_source_other: "Feira" })),
    ).toBe("A descrição da origem só se aplica à opção Outro.");
  });

  it("exige descrição do decisor quando é Outro", () => {
    expect(
      validateLeadCreation(validLead({ bant_authority: "Outro" })),
    ).toBe("Descreva o decisor quando escolher Outro.");
  });

  it("rejeita enum de BANT inválido", () => {
    expect(validateLeadCreation(validLead({ bant_timing: "Imediato" }))).toBe(
      "Selecione uma opção de prazo de compra (BANT) válida.",
    );
  });

  it("exige o endereço do contato quando não é o da empresa", () => {
    expect(
      validateLeadCreation(
        validLead({ contact_same_address: 0, contact_street: "" }),
      ),
    ).toBe("Informe o endereço do contato.");
  });

  it("aceita endereço do contato completo quando não é o da empresa", () => {
    expect(
      validateLeadCreation(
        validLead({
          contact_same_address: 0,
          contact_street: "Rua do Contato",
          contact_street_number: "20",
          contact_neighborhood: "Centro",
          contact_city_id: "city-santo-andre",
          contact_state: "SP",
          contact_postal_code: "09000-000",
          contact_country_id: "country-brasil",
        }),
      ),
    ).toBeNull();
  });

  it("rejeita tipo não textual em campo opcional", () => {
    expect(validateLeadCreation(validLead({ website: 42 }))).toBe(
      "Dados inválidos para o lead.",
    );
  });
});

describe("toLeadRecord", () => {
  it("normaliza CNPJ, aplica trim e fixa o status Novo", () => {
    const record = toLeadRecord("lead-1", {
      ...validLead({
        company_name: "  Empresa Alfa Ltda.  ",
        tax_id: "11.222.333/0001-81",
        complement: "   ",
      }),
    });

    expect(record.id).toBe("lead-1");
    expect(record.company_name).toBe("Empresa Alfa Ltda.");
    expect(record.tax_id).toBe("11222333000181");
    expect(record.complement).toBeNull();
    expect(record.status).toBe("Novo");
  });

  it("assume endereço do contato igual ao da empresa por padrão", () => {
    expect(toLeadRecord("lead-1", validLead()).contact_same_address).toBe(1);
    expect(
      toLeadRecord("lead-1", validLead({ contact_same_address: false }))
        .contact_same_address,
    ).toBe(0);
  });
});
