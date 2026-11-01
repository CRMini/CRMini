import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { readJsonObject } from "./api-json";

function postRequest(body: string) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("readJsonObject", () => {
  it("devolve o objeto quando o JSON é válido", async () => {
    const result = await readJsonObject(postRequest('{"name":"Empresa"}'));

    expect(result).toEqual({ ok: true, body: { name: "Empresa" } });
  });

  it("devolve 400 com a mensagem padrão para JSON malformado", async () => {
    const result = await readJsonObject(postRequest("não é json"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
  });

  it("aceita mensagem e status customizados", async () => {
    const result = await readJsonObject(postRequest("não é json"), {
      error: "Dados inválidos.",
      status: 422,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(422);
    await expect(result.response.json()).resolves.toEqual({
      error: "Dados inválidos.",
    });
  });

  it.each([
    ["array", "[]"],
    ["nulo", "null"],
    ["escalar", '"texto"'],
  ])(
    "rejeita corpo %s usando a mensagem de parse por padrão",
    async (_, body) => {
      const result = await readJsonObject(postRequest(body));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      await expect(result.response.json()).resolves.toEqual({
        error: "Corpo JSON inválido.",
      });
    },
  );

  it("usa shapeError quando o JSON é válido mas não é objeto", async () => {
    const result = await readJsonObject(postRequest("[]"), {
      error: "Corpo JSON inválido.",
      shapeError: "Dados inválidos.",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    await expect(result.response.json()).resolves.toEqual({
      error: "Dados inválidos.",
    });
  });

  it("devolve 400 ao reler um corpo já consumido", async () => {
    const request = postRequest('{"name":"Empresa"}');
    expect((await readJsonObject(request)).ok).toBe(true);

    const result = await readJsonObject(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });
});
