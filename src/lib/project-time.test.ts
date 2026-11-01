import { describe, expect, it } from "vitest";
import { toProjectHours } from "./project-time";

describe("toProjectHours", () => {
  it.each([
    ["hours", 2, 2],
    ["days", 3, 24],
    ["weeks", 2, 80],
    ["months", 1, 160],
  ] as const)("converte %s em horas", (unit, amount, expected) => {
    expect(toProjectHours(amount, unit)).toBe(expected);
  });

  it("preserva zero e trata valores vazios como opcionais", () => {
    expect(toProjectHours(0, "days")).toBe(0);
    expect(toProjectHours("", "hours")).toBeNull();
    expect(toProjectHours(null, "hours")).toBeNull();
    expect(toProjectHours(undefined, "hours")).toBeNull();
  });

  it.each([-1, "abc", Number.NaN, Number.POSITIVE_INFINITY])(
    "rejeita valor inválido %s",
    (value) => {
      expect(() => toProjectHours(value, "hours")).toThrow(RangeError);
    },
  );
});
