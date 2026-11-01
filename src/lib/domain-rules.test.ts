import { describe, expect, it, vi } from "vitest";
import { getDashboardMetrics } from "./dashboard-metrics";
import { getGreeting } from "./greeting";
import { toProjectHours } from "./project-time";
import {
  getRecentOpportunities,
  type RecentOpportunity,
} from "./recent-opportunities";
import { saoPauloDayRange } from "./task-date";
import { validateTask } from "./task-validation";

const anaNameSuffixPattern = /, Ana$/;

describe("regras de tarefas", () => {
  const validTask = {
    contact_type: "email",
    subject: "Retornar proposta",
    scheduled_at: "2026-10-09T14:00:00-03:00",
    client_id: "client-id",
    contact_id: "contact-id",
  };

  it("aceita os três tipos permitidos e descrição opcional", () => {
    for (const contact_type of ["email", "telefone", "compromisso"]) {
      expect(validateTask({ ...validTask, contact_type })).toBeNull();
    }
  });

  it.each([
    ["tipo", { contact_type: "fax" }],
    ["assunto em branco", { subject: "  " }],
    ["data inválida", { scheduled_at: "amanhã" }],
    ["cliente ausente", { client_id: null }],
    ["contato ausente", { contact_id: undefined }],
    ["descrição acima do limite", { description: "x".repeat(5001) }],
  ])("rejeita %s", (_reason, change) => {
    expect(validateTask({ ...validTask, ...change })).not.toBeNull();
  });

  it("calcula limites civis do dia em São Paulo sem deslocar a data", () => {
    expect(saoPauloDayRange("2026-10-12")).toEqual({
      start: "2026-10-12T03:00:00.000Z",
      end: "2026-10-13T03:00:00.000Z",
    });
    expect(() => saoPauloDayRange("2026-02-30")).toThrow();
  });
});

describe("duração e apresentação de datas", () => {
  it.each([
    ["hours", 3, 3],
    ["days", 2, 16],
    ["weeks", 2, 80],
    ["months", 1, 160],
  ] as const)("converte %s para horas", (unit, amount, expected) => {
    expect(toProjectHours(amount, unit)).toBe(expected);
  });

  it("preserva zero, trata vazio como opcional e rejeita valores inválidos", () => {
    expect(toProjectHours(0, "days")).toBe(0);
    expect(toProjectHours("", "hours")).toBeNull();
    expect(() => toProjectHours(-1, "hours")).toThrow(RangeError);
    expect(() => toProjectHours("abc", "hours")).toThrow(RangeError);
  });
});

describe("saudação e métricas do painel", () => {
  it("escolhe a saudação conforme hora de Brasília", () => {
    expect(getGreeting(new Date("2026-10-12T10:00:00-03:00"), "Ana")).toMatch(
      anaNameSuffixPattern,
    );
    expect(getGreeting(new Date("2026-10-12T15:00:00-03:00"), "Ana")).toMatch(
      anaNameSuffixPattern,
    );
    expect(getGreeting(new Date("2026-10-12T21:00:00-03:00"), "Ana")).toMatch(
      anaNameSuffixPattern,
    );
    expect(getGreeting(new Date("2026-10-12T10:00:00-03:00"))).not.toMatch(
      anaNameSuffixPattern,
    );
  });

  it("agrega conversão sobre oportunidades encerradas e valores por moeda", async () => {
    const query = vi.fn(async (_statement: string) => ({
      rows: [
        {
          contacts_count: 10,
          opportunities_count: 8,
          open_opportunities_count: 5,
          won_count: 2,
          lost_count: 1,
          open_values: JSON.stringify([{ currency: "BRL", value: "1500.00" }]),
        },
      ],
    }));
    await expect(getDashboardMetrics(query)).resolves.toMatchObject({
      contactsCount: 10,
      openOpportunitiesCount: 5,
      conversionRate: 67,
      openValueByCurrency: { BRL: "1500.00" },
    });
    expect(query.mock.calls[0][0]).toMatch(/json_group_array/);
    expect(query.mock.calls[0][0]).toMatch(
      /status NOT IN \('Ganha', 'Perdida'\)/,
    );
  });

  it("propaga falhas de consulta ao painel", async () => {
    await expect(
      getDashboardMetrics(async () => {
        throw new Error("falha SQL");
      }),
    ).rejects.toThrow("falha SQL");
  });
});

describe("oportunidades recentes", () => {
  it("consulta os campos da oportunidade em ordem recente e devolve linhas", async () => {
    const rows = [
      { id: "op-1", title: "Projeto", status: "Proposta" },
    ] as unknown as RecentOpportunity[];
    const query = vi.fn(async (_statement: string) => ({ rows }));
    await expect(getRecentOpportunities(query)).resolves.toEqual(rows);
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY.*created_at DESC/i);
    expect(query.mock.calls[0][0]).toMatch(/LIMIT/);
  });

  it("retorna vazio sem resultados e propaga erro do banco", async () => {
    await expect(
      getRecentOpportunities(async () => ({ rows: [] })),
    ).resolves.toEqual([]);
    await expect(
      getRecentOpportunities(async () => {
        throw new Error("sem banco");
      }),
    ).rejects.toThrow("sem banco");
  });
});
