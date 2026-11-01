import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listEvents, createEvent } = vi.hoisted(() => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock("@/lib/repositories/events", () => ({ listEvents, createEvent }));

import { getBrazilDateString } from "@/lib/brazil-date";
import { GET, POST } from "./route";

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/events${query}`);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(body: string) {
  return new NextRequest("http://localhost/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const validEvent = () => ({
  client_id: "client-1",
  event_type: "reuniao",
  title: "Conversa inicial",
  occurred_at: "2026-10-01",
});

describe("GET /api/events", () => {
  beforeEach(() => {
    listEvents.mockReset().mockResolvedValue([]);
  });

  it("exige cliente ou oportunidade", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe o cliente ou a oportunidade.",
    });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("repassa cliente, tipo e limite", async () => {
    const response = await GET(
      getRequest("?client_id=client-1&type=reuniao&limit=10"),
    );

    expect(response.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith({
      clientId: "client-1",
      opportunityId: null,
      type: "reuniao",
      limit: 10,
    });
  });

  it("aceita oportunidade isolada e trata filtros ausentes como null", async () => {
    const response = await GET(getRequest("?opportunity_id=opp-1"));

    expect(response.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith({
      clientId: null,
      opportunityId: "opp-1",
      type: null,
      limit: null,
    });
  });

  it("rejeita tipo inválido", async () => {
    const response = await GET(getRequest("?client_id=client-1&type=sms"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Tipo de evento inválido.",
    });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it.each(["0", "101", "abc", "1.5", "-1"])(
    "rejeita limite %s",
    async (limit) => {
      const response = await GET(
        getRequest(`?client_id=client-1&limit=${limit}`),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Limite inválido.",
      });
      expect(listEvents).not.toHaveBeenCalled();
    },
  );

  it("retorna 503 quando o repositório falha", async () => {
    listEvents.mockRejectedValue(new Error("database is locked"));

    const response = await GET(getRequest("?client_id=client-1"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar o histórico.",
    });
  });
});

describe("POST /api/events", () => {
  beforeEach(() => {
    createEvent.mockReset();
  });

  it("retorna 400 para corpo JSON malformado", async () => {
    const response = await POST(rawPostRequest("não é json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("retorna 400 para corpo que não é objeto", async () => {
    const response = await POST(rawPostRequest("[]"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos.",
    });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["tipo inválido", { event_type: "sms" }, "Tipo de evento inválido."],
    ["título vazio", { title: "  " }, "Informe um título (até 200 caracteres)."],
    ["cliente ausente", { client_id: undefined }, "Informe o cliente."],
    ["data inválida", { occurred_at: "2026-02-30" }, "Informe uma data válida."],
  ])("retorna 400 para %s", async (_label, overrides, message) => {
    const response = await POST(postRequest({ ...validEvent(), ...overrides }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("preenche a data de hoje quando occurred_at está ausente", async () => {
    createEvent.mockResolvedValue({ id: "event-1" });
    const { occurred_at, ...withoutDate } = validEvent();

    const response = await POST(postRequest(withoutDate));

    expect(response.status).toBe(201);
    expect(createEvent).toHaveBeenCalledWith({
      ...withoutDate,
      occurred_at: getBrazilDateString(),
    });
  });

  it("retorna 400 quando o vínculo não existe", async () => {
    createEvent.mockResolvedValue(null);

    const response = await POST(postRequest(validEvent()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cliente, oportunidade ou contato válido não encontrado.",
    });
  });

  it("cria o evento e retorna 201", async () => {
    const payload = validEvent();
    createEvent.mockResolvedValue({ id: "event-1", ...payload });

    const response = await POST(postRequest(payload));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "event-1",
      ...payload,
    });
    expect(createEvent).toHaveBeenCalledWith(payload);
  });

  it("retorna 400 quando o repositório lança exceção", async () => {
    createEvent.mockRejectedValue(new Error("database is locked"));

    const response = await POST(postRequest(validEvent()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível cadastrar o evento.",
    });
  });
});
