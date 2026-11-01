import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatBrazilDate,
  formatBrazilDateMedium,
  formatBrazilDateTime,
  getBrazilDateString,
  SAO_PAULO_TIME_ZONE,
  toCivilDateTimeInput,
} from "./brazil-date";

afterEach(() => {
  vi.useRealTimers();
});

describe("datas no fuso de São Paulo", () => {
  it("usa o identificador do fuso de São Paulo", () => {
    expect(SAO_PAULO_TIME_ZONE).toBe("America/Sao_Paulo");
  });

  it("calcula a data civil perto da virada UTC", () => {
    expect(getBrazilDateString(new Date("2025-01-10T01:30:00Z"))).toBe(
      "2025-01-09",
    );
    expect(getBrazilDateString(new Date("2025-01-10T03:30:00Z"))).toBe(
      "2025-01-10",
    );
  });

  it("formata datas civis sem aplicar deslocamento de fuso", () => {
    expect(formatBrazilDate("2025-01-09")).toBe("09/01/2025");
  });

  it("formata instantes no fuso de São Paulo e trata valores ausentes", () => {
    expect(formatBrazilDate("2025-01-10T01:30:00Z")).toBe("09/01/2025");
    expect(formatBrazilDateTime("2025-01-10T01:30:00Z")).toBe(
      "09/01/2025, 22:30",
    );
    expect(formatBrazilDate(null)).toBe("—");
    expect(formatBrazilDateTime(undefined)).toBe("—");
  });

  it("formata a data por extenso no fuso de São Paulo", () => {
    const formatted = formatBrazilDateMedium("2025-01-10T01:30:00Z");

    expect(formatted).toContain("jan");
    expect(formatted).toContain("2025");
    expect(formatted).not.toContain("10 de jan");
    expect(formatBrazilDateMedium(undefined)).toBe("—");
  });

  it("monta o valor de datetime-local no fuso de São Paulo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:30:00Z"));
    expect(toCivilDateTimeInput()).toBe("2026-06-15T07:30");

    vi.setSystemTime(new Date("2026-06-16T02:00:00Z"));
    expect(toCivilDateTimeInput()).toBe("2026-06-15T23:00");
  });
});
