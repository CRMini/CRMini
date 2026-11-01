import { describe, expect, it } from "vitest";
import { isValidEmail } from "./email";

describe("isValidEmail", () => {
  it.each(["ana@example.com", "ana.souza+crm@example.com.br", "a@b.co"])(
    "aceita %s",
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );

  it.each([
    "",
    "ana",
    "ana@",
    "@example.com",
    "ana@example",
    "ana @example.com",
    "ana@exa mple.com",
    "ana@@example.com",
  ])("rejeita %s", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("aceita 254 caracteres e rejeita 255", () => {
    const domain = "@example.com";
    const atLimit = `${"a".repeat(254 - domain.length)}${domain}`;
    const overLimit = `${"a".repeat(255 - domain.length)}${domain}`;

    expect(atLimit).toHaveLength(254);
    expect(isValidEmail(atLimit)).toBe(true);
    expect(overLimit).toHaveLength(255);
    expect(isValidEmail(overLimit)).toBe(false);
  });
});
