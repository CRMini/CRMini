import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { deactivateEvent, getEvent, updateEvent } = vi.hoisted(() => ({
  deactivateEvent: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("@/lib/repositories/events", () => ({
  deactivateEvent,
  getEvent,
  updateEvent,
}));

import { DELETE, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "event-1" }) };

function currentEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    client_id: "client-1",
    contact_id: "contact-1",
    opportunity_id: "opp-1",
    event_type: "reuniao",
    title: "Reunião",
    details: null,
    occurred_at: "2026-10-01",
    is_origin: false,
    is_active: 1,
    ...overrides,
  };
}

function jsonRequest(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/events/event-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(method: string, body: string) {
  return new NextRequest("http://localhost/api/events/event-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  getEvent.mockReset();
  updateEvent.mockReset();
  deactivateEvent.mockReset();
});

describe("PATCH /api/events/[id]", () => {
  it("retorna 400 para corpo JSON malformado", async () => {
    const response = await PATCH(rawRequest("PATCH", "não é json"), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo JSON inválido.",
    });
    expect(getEvent).not.toHaveBeenCalled();
  });

  it("retorna 404 para evento inexistente", async () => {
    getEvent.mockResolvedValue(null);

    const response = await PATCH(jsonRequest("PATCH", { title: "Novo" }), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Evento não encontrado.",
    });
  });

  it("retorna 404 para evento inativo", async () => {
    getEvent.mockResolvedValue(currentEvent({ is_active: 0 }));

    const response = await PATCH(jsonRequest("PATCH", { title: "Novo" }), params);

    expect(response.status).toBe(404);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("rejeita a troca de cliente", async () => {
    getEvent.mockResolvedValue(currentEvent());

    const response = await PATCH(
      jsonRequest("PATCH", { client_id: "client-2" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "O cliente do evento não pode ser alterado.",
    });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("rejeita a troca de origem", async () => {
    getEvent.mockResolvedValue(currentEvent());

    const response = await PATCH(
      jsonRequest("PATCH", { is_origin: true }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A origem do evento não pode ser alterada.",
    });
  });

  it("rejeita trocar a oportunidade de um evento de origem", async () => {
    getEvent.mockResolvedValue(currentEvent({ is_origin: true }));

    const response = await PATCH(
      jsonRequest("PATCH", { opportunity_id: "opp-2" }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A oportunidade de um evento de origem não pode ser alterada.",
    });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("valida o evento mesclado antes de atualizar", async () => {
    getEvent.mockResolvedValue(currentEvent());

    const response = await PATCH(jsonRequest("PATCH", { title: "  " }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe um título (até 200 caracteres).",
    });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("atualiza o evento com os campos enviados", async () => {
    getEvent.mockResolvedValue(currentEvent());
    updateEvent.mockResolvedValue(currentEvent({ title: "Novo título" }));

    const response = await PATCH(
      jsonRequest("PATCH", { title: "Novo título", details: "Detalhe" }),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "event-1",
      title: "Novo título",
    });
    expect(updateEvent).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({
        client_id: "client-1",
        title: "Novo título",
        details: "Detalhe",
        event_type: "reuniao",
      }),
    );
  });

  it("retorna 400 quando o vínculo não existe", async () => {
    getEvent.mockResolvedValue(currentEvent());
    updateEvent.mockResolvedValue(null);

    const response = await PATCH(jsonRequest("PATCH", { title: "Novo" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cliente, oportunidade ou contato válido não encontrado.",
    });
  });

  it("retorna 400 quando o repositório falha", async () => {
    getEvent.mockRejectedValue(new Error("database is locked"));

    const response = await PATCH(jsonRequest("PATCH", { title: "Novo" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível atualizar o evento.",
    });
  });
});

describe("DELETE /api/events/[id]", () => {
  it("retorna 404 para evento inexistente", async () => {
    getEvent.mockResolvedValue(null);

    const response = await DELETE(new NextRequest("http://localhost"), params);

    expect(response.status).toBe(404);
    expect(deactivateEvent).not.toHaveBeenCalled();
  });

  it("retorna 409 para evento de origem", async () => {
    getEvent.mockResolvedValue(currentEvent({ is_origin: true }));

    const response = await DELETE(new NextRequest("http://localhost"), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Eventos de origem não podem ser excluídos.",
    });
    expect(deactivateEvent).not.toHaveBeenCalled();
  });

  it("retorna 204 idempotente para evento já inativo", async () => {
    getEvent.mockResolvedValue(currentEvent({ is_active: 0 }));

    const response = await DELETE(new NextRequest("http://localhost"), params);

    expect(response.status).toBe(204);
    expect(deactivateEvent).not.toHaveBeenCalled();
  });

  it("desativa o evento e retorna 204", async () => {
    getEvent.mockResolvedValue(currentEvent());
    deactivateEvent.mockResolvedValue({ id: "event-1" });

    const response = await DELETE(new NextRequest("http://localhost"), params);

    expect(response.status).toBe(204);
    expect(deactivateEvent).toHaveBeenCalledWith("event-1");
  });

  it("retorna 400 quando o repositório falha", async () => {
    getEvent.mockRejectedValue(new Error("database is locked"));

    const response = await DELETE(new NextRequest("http://localhost"), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível excluir o evento.",
    });
  });
});
